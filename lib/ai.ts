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
  if (
    normalized.startsWith("PGh0bWw") ||
    normalized.startsWith("PCFET0NUWVBF")
  ) {
    return null;
  }
  return null;
}

function buildBase64DataUrl(base64: string): string {
  const mimeType = inferImageMimeTypeFromBase64(base64);
  if (!mimeType) {
    throw new Error(
      "Unsupported or unreadable image data returned for DashScope request.",
    );
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
      encoding: "base64" as any,
    });
    return buildBase64DataUrl(base64);
  }

  const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheRoot) {
    throw new Error(
      "No writable cache directory available for image conversion.",
    );
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
      encoding: "base64" as any,
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
      console.warn(
        "Failed to inline image for DashScope, falling back to text-only:",
        error,
      );
    }
  }

  const hasImage = !!resolvedImageUrl;
  const model = hasImage ? DASHSCOPE_IMAGE_MODEL : DASHSCOPE_TEXT_MODEL;

  const userContent = hasImage
    ? [
        {
          type: "text" as const,
          text: `Please comment on this community post:\n\n${content}`,
        },
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
    enable_thinking: false,
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
      console.error(
        "DashScope API error:",
        response.status,
        await response.text(),
      );
      return "Sorry, the AI service is temporarily unavailable. Please try again later.";
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    // Strip <think>...</think> tags if present
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return (
      text ||
      "I appreciate this post! Thank you for sharing with our community."
    );
  } catch (error) {
    console.error("Error calling DashScope:", error);
    return "Sorry, I couldn't generate a response right now. Please try again later.";
  }
}

// ─────────────────────────────────────────────────────────────
// AI reply to a specific comment in a moment thread
// ─────────────────────────────────────────────────────────────

const COMMENT_REPLY_SYSTEM_PROMPT =
  "You are a warm, caring AI assistant in an elderly care community app. " +
  "You are replying to a SPECIFIC comment in a thread under a community post. " +
  "Address the commenter by name in a friendly way, keep it short (1-2 sentences), " +
  "be supportive and conversational, and offer a gentle insight only if it fits naturally. " +
  "Reply in the same language as the comment you are replying to.";

const MAX_THREAD_COMMENTS = 8;
const MAX_THREAD_CHARS = 2000;

export interface AICommentReplyContext {
  momentContent: string;
  momentImageUrl?: string;
  /** Ancestor chain ordered from oldest -> the comment being replied to (last item). */
  thread: { authorName: string; authorRole: string; content: string }[];
}

function buildThreadPromptText(ctx: AICommentReplyContext): string {
  const lines: string[] = [];
  const moment = (ctx.momentContent || "").trim();
  lines.push(`Original post: ${moment || "(no text — see attached image)"}`);
  lines.push("");
  lines.push("Comment thread (oldest first):");

  const trimmedThread = ctx.thread.slice(-MAX_THREAD_COMMENTS);
  trimmedThread.forEach((c, i) => {
    const isTarget = i === trimmedThread.length - 1;
    const prefix = isTarget ? ">>> Reply to" : `${i + 1}.`;
    const role = c.authorRole === "ai" ? " [AI]" : "";
    lines.push(`${prefix} ${c.authorName}${role}: ${(c.content || "").trim()}`);
  });

  let text = lines.join("\n");
  if (text.length > MAX_THREAD_CHARS) {
    text = text.slice(text.length - MAX_THREAD_CHARS);
  }
  return text;
}

export async function generateAICommentReply(
  ctx: AICommentReplyContext,
): Promise<string> {
  if (!DASHSCOPE_API_KEY || !DASHSCOPE_API_URL) {
    return i18n.t("caregiverAI.aiNotConfigured");
  }
  if (!ctx.thread || ctx.thread.length === 0) {
    return i18n.t("caregiverAI.aiNotConfigured");
  }

  let resolvedImageUrl: string | undefined;
  if (ctx.momentImageUrl) {
    try {
      resolvedImageUrl = await buildDashScopeImageUrl(ctx.momentImageUrl);
    } catch (error) {
      console.warn(
        "Failed to inline image for DashScope comment reply, falling back to text-only:",
        error,
      );
    }
  }

  const hasImage = !!resolvedImageUrl;
  const model = hasImage ? DASHSCOPE_IMAGE_MODEL : DASHSCOPE_TEXT_MODEL;
  const promptText = buildThreadPromptText(ctx);

  const userContent = hasImage
    ? [
        { type: "text" as const, text: promptText },
        { type: "image_url" as const, image_url: { url: resolvedImageUrl! } },
      ]
    : promptText;

  const payload = {
    model,
    messages: [
      { role: "system", content: COMMENT_REPLY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 200,
    temperature: 0.7,
    enable_thinking: false,
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
      console.error(
        "DashScope API error (comment reply):",
        response.status,
        await response.text(),
      );
      return "Sorry, the AI service is temporarily unavailable. Please try again later.";
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return text || "Thanks for sharing — that's a lovely thought!";
  } catch (error) {
    console.error("Error calling DashScope (comment reply):", error);
    return "Sorry, I couldn't generate a reply right now. Please try again later.";
  }
}
