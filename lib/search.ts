import { ExecutionMethod } from "react-native-appwrite";
import { functions, VOICE_CLONE_FUNCTION_ID } from "./appwrite";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface WeatherAnswerBox {
  type: "weather";
  temperature?: number;
  unit?: string;
  weather?: string;
  humidity?: string;
  wind?: string;
  precipitation?: string;
  location?: string;
  forecast?: { day: string; weather: string; temperature: string }[];
}

interface GenericAnswerBox {
  type: "generic";
  title?: string;
  answer?: string;
}

interface SearchResponse {
  success: boolean;
  query: string;
  answerBox?: (WeatherAnswerBox | GenericAnswerBox) | null;
  knowledgeGraph?: { title?: string; description?: string } | null;
  aiOverview?: { text?: string; references?: { title: string; link: string }[] } | null;
  results: SearchResult[];
  error?: string;
}

// ── Search cache (5 min TTL) ────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { data: SearchResponse; ts: number }>();

function getCached(key: string): SearchResponse | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

export async function searchWeb(query: string): Promise<SearchResponse> {
  const cacheKey = query.trim().toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = await functions.createExecution(
    VOICE_CLONE_FUNCTION_ID,
    JSON.stringify({ mode: "search", query, hl: "zh-TW", gl: "hk", num: 5 }),
    false,
    undefined,
    ExecutionMethod.POST,
  );

  const parsed = JSON.parse(result.responseBody);
  if (!parsed.success) {
    throw new Error(parsed.error || "Search failed");
  }

  const response = parsed as SearchResponse;
  searchCache.set(cacheKey, { data: response, ts: Date.now() });
  return response;
}

export function formatSearchResultsForContext(response: SearchResponse): string {
  const parts: string[] = [];

  // AI Overview is the richest & fastest context — prioritize it
  if (response.aiOverview?.text) {
    parts.push(`AI Overview: ${response.aiOverview.text}`);
    if (response.aiOverview.references?.length) {
      for (const ref of response.aiOverview.references.slice(0, 3)) {
        parts.push(`  ↳ ${ref.title}: ${ref.link}`);
      }
    }
  }

  // Weather answer box — structured weather data with temperature
  if (response.answerBox?.type === "weather") {
    const wb = response.answerBox as WeatherAnswerBox;
    const weatherParts: string[] = [];
    if (wb.location) weatherParts.push(`地點: ${wb.location}`);
    if (wb.temperature != null) weatherParts.push(`氣溫: ${wb.temperature}°${wb.unit === "Fahrenheit" ? "F" : "C"}`);
    if (wb.weather) weatherParts.push(`天氣: ${wb.weather}`);
    if (wb.humidity) weatherParts.push(`濕度: ${wb.humidity}`);
    if (wb.wind) weatherParts.push(`風力: ${wb.wind}`);
    if (wb.precipitation) weatherParts.push(`降雨: ${wb.precipitation}`);
    if (weatherParts.length > 0) {
      parts.push(`Current Weather: ${weatherParts.join(", ")}`);
    }
    if (wb.forecast?.length) {
      const forecastStr = wb.forecast.map((f) => `${f.day}: ${f.weather} ${f.temperature}`).join("; ");
      parts.push(`Forecast: ${forecastStr}`);
    }
  } else if (response.answerBox?.type === "generic") {
    const gb = response.answerBox as GenericAnswerBox;
    if (gb.answer) {
      parts.push(`Answer: ${gb.answer}`);
    }
  }

  if (response.knowledgeGraph?.description) {
    parts.push(`${response.knowledgeGraph.title || ""}: ${response.knowledgeGraph.description}`);
  }

  for (const r of response.results) {
    parts.push(`- ${r.title}: ${r.snippet}`);
  }

  return parts.join("\n");
}

// ── Selective search — skip for simple/casual queries ───────────────
const SKIP_SEARCH_PATTERNS = [
  // Greetings / casual
  /^(hi|hello|hey|你好|早晨|早安|晚安|嗨|哈囉|再見|拜拜|bye|thanks|多謝|唔該|謝謝)/i,
  // Emotional / feelings
  /^(i feel|我覺得|我好|好攰|好開心|好sad|lonely|唔開心)/i,
  // Simple yes/no / acknowledgments
  /^(ok|okay|yes|no|係|唔係|好|冇|明白|understand|got it)/i,
  // Medication / schedule (handled locally)
  /\b(medicine|medication|pill|藥|schedule|appointment|event|日程|食藥)\b/i,
  // Very short messages (<=5 chars) unlikely to need search
];

export function shouldSearch(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length <= 5) return false;
  return !SKIP_SEARCH_PATTERNS.some((p) => p.test(trimmed));
}
