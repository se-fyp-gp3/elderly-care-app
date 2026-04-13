import { account, APPWRITE_PROJECT_ID } from "@/lib/appwrite";
import i18n from "@/lib/i18n";
import * as FileSystem from "expo-file-system/legacy";

const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim();
const DASHSCOPE_API_URL = process.env.EXPO_PUBLIC_DASHSCOPE_API_URL?.trim();
const DASHSCOPE_TEXT_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_MODEL?.trim() || "qwen3.5-flash";
const DASHSCOPE_IMAGE_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_IMAGE_MODEL?.trim() || "qwen-vl-max-latest";

const SYSTEM_PROMPT =
  "You are a helpful AI assistant in an elderly care community app. " +
  "Provide a short, thoughtful, and caring response (2-3 sentences) to the community post. " +
  "Be supportive, warm, and offer practical insights when relevant. " +
  "Reply in the same language as the post content.";

function inferImageMimeTypeFromBase64(base64: string): string | null {
  const normalized = base64.trim();
  if (normalized.startsWith("/9j/")) return "image/jpeg";
  if (normalized.startsWith("iVBORw0KGgo")) return "image/png";
  if (normalized.startsWith("R0lGOD")) return "image/gif";
  if (normalized.startsWith("UklGR")) return "image/webp";
  if (normalized.startsWith("Qk")) return "image/bmp";
  if (normalized.startsWith("PHN2Zy") || normalized.startsWith("PD94bWw")) {
    return "image/svg+xml";
  }
  if (normalized.startsWith("PGh0bWw") || normalized.startsWith("PCFET0NUWVBF")) {
    return null;
  }
  return null;
}

function buildBase64DataUrl(base64: string): string {
  const mimeType = inferImageMimeTypeFromBase64(base64);
  if (!mimeType) {
    throw new Error("Unsupported or unreadable image data returned for DashScope request.");
  }
  return `data:${mimeType};base64,${base64}`;
}

function inferImageMimeType(uri: string): string {
  const normalized = uri.toLowerCase();
  if (normalized.includes(".png")) return "image/png";
  if (normalized.includes(".webp")) return "image/webp";
  if (normalized.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function buildDashScopeImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;

  if (imageUrl.startsWith("file:")) {
    const base64 = await FileSystem.readAsStringAsync(imageUrl, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return buildBase64DataUrl(base64);
  }

  const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheRoot) {
    throw new Error("No writable cache directory available for image conversion.");
  }

  const tempUri = `${cacheRoot}dashscope_image_${Date.now()}`;
  const headers: Record<string, string> = {};

  if (/\/storage\/buckets\/.+\/files\/.+\/(view|download)/.test(imageUrl)) {
    const jwt = await account.createJWT();
    headers["X-Appwrite-Project"] = APPWRITE_PROJECT_ID;
    headers["X-Appwrite-JWT"] = jwt.jwt;
  }

  const downloaded = await FileSystem.downloadAsync(imageUrl, tempUri, {
    headers,
  });

  try {
    const base64 = await FileSystem.readAsStringAsync(downloaded.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return buildBase64DataUrl(base64);
  } finally {
    FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => {
      // Ignore cache cleanup failures.
    });
  }
}

export async function generateAIResponse(
  content: string,
  imageUrl?: string,
): Promise<string> {
  if (!DASHSCOPE_API_KEY || !DASHSCOPE_API_URL) {
    return i18n.t("caregiverAI.aiNotConfigured");
  }

  let resolvedImageUrl: string | undefined;
  if (imageUrl) {
    try {
      resolvedImageUrl = await buildDashScopeImageUrl(imageUrl);
    } catch (error) {
      console.warn("Failed to inline image for DashScope, falling back to text-only:", error);
    }
  }

  const hasImage = !!resolvedImageUrl;
  const model = hasImage ? DASHSCOPE_IMAGE_MODEL : DASHSCOPE_TEXT_MODEL;

  const userContent = hasImage
    ? [
        { type: "text" as const, text: `Please comment on this community post:\n\n${content}` },
        { type: "image_url" as const, image_url: { url: resolvedImageUrl! } },
      ]
    : `Please comment on this community post:\n\n${content}`;

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 200,
    temperature: 0.7,
  };

  try {
    const response = await fetch(`${DASHSCOPE_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("DashScope API error:", response.status, await response.text());
      return "Sorry, the AI service is temporarily unavailable. Please try again later.";
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    // Strip <think>...</think> tags if present
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return text || "I appreciate this post! Thank you for sharing with our community.";
  } catch (error) {
    console.error("Error calling DashScope:", error);
    return "Sorry, I couldn't generate a response right now. Please try again later.";
  }
}
