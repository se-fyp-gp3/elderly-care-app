// lib/voice-recognition.ts
// Voice recognition service using Qwen3.5-audio for end-to-end speech recognition + understanding
// Supports: Hong Kong Cantonese (yue), Mandarin (zh), English (en)

import * as FileSystem from "expo-file-system/legacy";

const DASHSCOPE_API_KEY =
  process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim() || "";
const DASHSCOPE_AUDIO_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_AUDIO_MODEL?.trim() || "qwen2.5-omni-7b";

// Supported language codes
export type VoiceLanguage = "yue" | "zh" | "en";

export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  yue: "粵語",
  zh: "普通話",
  en: "English",
};

// System prompts per language to guide Qwen3.5-audio understanding
const SYSTEM_PROMPTS: Record<VoiceLanguage, string> = {
  yue: `你係一個長者護理助手。請用香港粵語回覆。
仔細聽用戶嘅語音，識別佢哋嘅意圖。可能嘅意圖包括：
1. 記錄食藥 (record_medication) - 例如「我食咗藥」「已經食藥」
2. 新增藥物 (add_medication) - 例如「加一隻新藥」「我要食新藥」
3. 打電話畀人 (call_contact) - 例如「打畀阿女」「打電話」
4. 查詢藥物 (check_medication) - 例如「今日食咩藥」「有咩藥未食」
5. 一般對話 (general_chat) - 其他所有對話

請以JSON格式回覆：{"intent":"意圖名稱","params":{},"reply":"用粵語嘅回覆"}`,

  zh: `你是一个长者护理助手。请用普通话回复。
仔细听用户的语音，识别他们的意图。可能的意图包括：
1. 记录服药 (record_medication) - 如"我吃了药""已经吃药了"
2. 新增药物 (add_medication) - 如"加一种新药""我要吃新药"
3. 打电话给人 (call_contact) - 如"打给女儿""打电话"
4. 查询药物 (check_medication) - 如"今天吃什么药""有什么药没吃"
5. 一般对话 (general_chat) - 其他所有对话

请以JSON格式回复：{"intent":"意图名称","params":{},"reply":"用普通话的回复"}`,

  en: `You are an elderly care assistant. Reply in English.
Listen carefully to the user's voice and identify their intent. Possible intents:
1. Record medication taken (record_medication) - e.g. "I took my medicine", "medicine taken"
2. Add new medication (add_medication) - e.g. "add a new medicine", "new prescription"
3. Call a contact (call_contact) - e.g. "call my daughter", "make a phone call"
4. Check medication schedule (check_medication) - e.g. "what medicine today", "any pills left"
5. General conversation (general_chat) - everything else

Reply in JSON: {"intent":"intent_name","params":{},"reply":"English reply"}`,
};

export interface VoiceRecognitionResult {
  transcript: string;
  intent: string;
  params: Record<string, any>;
  reply: string;
  raw?: string;
}

function assertConfigured() {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("EXPO_PUBLIC_DASHSCOPE_API_KEY is not configured.");
  }
}

/**
 * Send audio to Qwen3.5-audio for end-to-end recognition + understanding.
 * The model transcribes the audio AND extracts intent in one pass.
 *
 * @param audioBase64 - Base64-encoded audio data (WAV, M4A, MP3)
 * @param language - Target language for recognition
 * @param mimeType - MIME type of audio (default: audio/wav)
 */
export async function recognizeVoiceCommand(
  audioBase64: string,
  language: VoiceLanguage = "yue",
  mimeType: string = "audio/wav",
): Promise<VoiceRecognitionResult> {
  assertConfigured();

  // Build the audio data URI
  const audioDataUri = `data:${mimeType};base64,${audioBase64}`;

  const systemPrompt = SYSTEM_PROMPTS[language];

  // Use DashScope multimodal API (compatible mode) for Qwen audio model
  const apiUrl = `${process.env.EXPO_PUBLIC_DASHSCOPE_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"}/chat/completions`;

  const requestBody = {
    model: DASHSCOPE_AUDIO_MODEL,
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audioDataUri,
              format: mimeType.includes("wav")
                ? "wav"
                : mimeType.includes("mp3")
                  ? "mp3"
                  : "m4a",
            },
          },
          {
            type: "text",
            text:
              language === "yue"
                ? "請聽我講嘅嘢，識別意圖，用JSON回覆"
                : language === "zh"
                  ? "请听我说的话，识别意图，用JSON回复"
                  : "Listen to what I said, identify intent, reply in JSON",
          },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.3,
    modalities: ["text"],
    audio: { voice: "Cherry", format: "wav" },
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Voice recognition failed (${response.status}): ${errText}`,
    );
  }

  const data = await response.json();
  const rawContent =
    data?.choices?.[0]?.message?.content ||
    data?.output?.choices?.[0]?.message?.content ||
    "";

  // Extract the text content (may be string or array)
  let textContent = "";
  if (typeof rawContent === "string") {
    textContent = rawContent;
  } else if (Array.isArray(rawContent)) {
    textContent = rawContent
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
  }

  return parseRecognitionResponse(textContent, language);
}

/**
 * Parse the JSON response from Qwen3.5-audio.
 * Falls back gracefully if the model doesn't return valid JSON.
 */
function parseRecognitionResponse(
  rawText: string,
  language: VoiceLanguage,
): VoiceRecognitionResult {
  // Try to extract JSON from the response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        transcript: parsed.transcript || rawText,
        intent: parsed.intent || "general_chat",
        params: parsed.params || {},
        reply: parsed.reply || rawText,
        raw: rawText,
      };
    } catch {
      // JSON parse failed, fall through
    }
  }

  // Fallback: treat entire response as general chat
  const fallbackReplies: Record<VoiceLanguage, string> = {
    yue: "唔好意思，我聽唔太清楚。可以再講一次嗎？",
    zh: "不好意思，我没听清楚。可以再说一次吗？",
    en: "Sorry, I didn't catch that clearly. Could you say it again?",
  };

  return {
    transcript: rawText,
    intent: "general_chat",
    params: {},
    reply: rawText || fallbackReplies[language],
    raw: rawText,
  };
}

/**
 * Read an audio file from a URI and return base64.
 */
export async function readAudioAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
