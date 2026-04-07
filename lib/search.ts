import { ExecutionMethod } from "react-native-appwrite";
import { functions, VOICE_CLONE_FUNCTION_ID } from "./appwrite";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface SearchResponse {
  success: boolean;
  query: string;
  answerBox?: { title?: string; answer?: string } | null;
  knowledgeGraph?: { title?: string; description?: string } | null;
  results: SearchResult[];
  error?: string;
}

export async function searchWeb(query: string): Promise<SearchResponse> {
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
  return parsed as SearchResponse;
}

export function formatSearchResultsForContext(response: SearchResponse): string {
  const parts: string[] = [];

  if (response.answerBox?.answer) {
    parts.push(`Answer: ${response.answerBox.answer}`);
  }
  if (response.knowledgeGraph?.description) {
    parts.push(`${response.knowledgeGraph.title || ""}: ${response.knowledgeGraph.description}`);
  }

  for (const r of response.results) {
    parts.push(`- ${r.title}: ${r.snippet}`);
  }

  return parts.join("\n");
}
