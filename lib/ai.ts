import i18n from "@/lib/i18n";

const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim();
const DASHSCOPE_API_URL = process.env.EXPO_PUBLIC_DASHSCOPE_API_URL?.trim();
const DASHSCOPE_TEXT_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_MODEL?.trim() || "qwen3.5-flash";
const DASHSCOPE_IMAGE_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_IMAGE_MODEL?.trim() || "qwen3.5-vl";

const SYSTEM_PROMPT =
  "You are a helpful AI assistant in an elderly care community app. " +
  "Provide a short, thoughtful, and caring response (2-3 sentences) to the community post. " +
  "Be supportive, warm, and offer practical insights when relevant. " +
  "Reply in the same language as the post content.";

export async function generateAIResponse(
  content: string,
  imageUrl?: string,
): Promise<string> {
  if (!DASHSCOPE_API_KEY || !DASHSCOPE_API_URL) {
    return i18n.t("caregiverAI.aiNotConfigured");
  }

  const hasImage = !!imageUrl;
  const model = hasImage ? DASHSCOPE_IMAGE_MODEL : DASHSCOPE_TEXT_MODEL;

  const userContent = hasImage
    ? [
        { type: "text" as const, text: `Please comment on this community post:\n\n${content}` },
        { type: "image_url" as const, image_url: { url: imageUrl } },
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
