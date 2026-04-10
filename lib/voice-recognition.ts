// lib/voice-recognition.ts
// Voice recognition service using Qwen3.5-audio for end-to-end speech recognition + understanding
// Supports: Hong Kong Cantonese (yue), Mandarin (zh), English (en)

import * as FileSystem from "expo-file-system/legacy";

const DASHSCOPE_API_KEY =
  process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim() || "";
const DASHSCOPE_AUDIO_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_AUDIO_MODEL?.trim() || "qwen2.5-omni-7b";

// Language options for voice commands
export type VoiceLanguage = "yue" | "zh" | "en";

export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  yue: "粵語",
  zh: "普通話",
  en: "English",
};

// Database schema knowledge for the AI model
const DB_SCHEMA_INFO = `
【數據庫規則 — 新增藥物時必須遵守】
- drug_name: 字串，藥物名稱（必填）
- unit: 字串，單位（例如"粒"、"ml"、"dose"），預設"dose"
- dosage: 數字(double)，每次劑量，預設1
- times_per_day: 整數(integer)，每日幾次（必須係整數，例如1、2、3）
- duration_days: 整數(integer)，食幾日（必須係整數，例如7、14、30）
- reminder_times: 字串陣列，提醒時間（HH:MM格式，例如["08:00","12:00","18:00"]）
- after_meal: 布林值，飯後食（true/false）
- start_date: 日期字串（ISO格式），開始日期

如果用戶講「一日三次」，times_per_day=3。
如果用戶講「食兩個禮拜」，duration_days=14。
如果用戶講「食一個月」，duration_days=30。
如果用戶講「持續兩日」，duration_days=2。
如果缺少必要資訊，用reply欄位友善咁問返用戶。
`;

// Per-language system prompts (all understand mixed input, reply in selected language)
const SYSTEM_PROMPTS: Record<VoiceLanguage, string> = {
  yue: `你係一個長者護理助手，支援中英粵混合口語。用戶可能會用廣東話、普通話、英文、或者混合嚟講嘢。
請用廣東話回覆，必須用繁體中文字，唔好用簡體字。語氣要親切自然，好似同屋企人傾計咁。

你支持多輪對話。如果之前嘅對話有提供上下文，請根據上下文嚟理解用戶嘅意圖。
例如：用戶之前問「我今日食咗藥未？」→ 你話「你今日未食降血壓藥」→ 用戶話「幫我記錄」→ 你應該理解係要記錄食藥(record_medication)。

仔細聽用戶嘅語音，識別佢哋嘅意圖。【intent欄位必須用英文名】：
1. record_medication - 記錄食藥（用戶宣告已經食咗）。例如「我食咗藥」「已經食藥」「幫我記錄」「我已經完成」「食完咗」「完成食藥」「已完成今晚嘅藥」「我食完止痛藥㗎喇」。⚠️ 判斷關鍵：用戶係陳述句、講已完成嘅事情 → record_medication。
2. add_medication - 新增藥物。例如「加一隻新藥」「我要食新藥」。params用以下欄位：
   drug_name(藥名), unit(單位), dosage(劑量數字), times_per_day(整數), duration_days(整數), reminder_times(["HH:MM"]), after_meal(true/false)
   ⚠️ 嚴格規則：params入面只能放用戶口中明確講出嚟嘅資料。用戶冇講嘅欄位絕對唔可以自己估或者捏造，包括藥名、劑量、次數、日數。如果用戶冇講藥名，params必須係{}，reply要問佢藥名係咩。
3. call_contact - 打電話畀人。例如「打畀阿女」「打電話」。params要有name
4. check_medication - 查詢藥物（用戶係問句，問自己要食咩）。例如「今日食咩藥」「有咩藥未食」「仲有咩未食」。⚠️ 只有用戶係問問題先用呢個 intent，如果用戶陳述已完成就用 record_medication。
5. set_schedule - 設定日程。例如「下晝三點覆診」。params要有title, datetime(ISO格式), description
6. general_chat - 其他所有對話

${DB_SCHEMA_INFO}

重要規則：
- intent 欄位必須用英文（record_medication/add_medication/call_contact/check_medication/set_schedule/general_chat）
- reply 欄位必須係自然嘅廣東話回覆（繁體中文），唔好放JSON，唔好用簡體字
- 如果語音唔清楚，reply寫「對唔住，我聽唔清楚，可以再講一次嗎？」，intent設為general_chat
- add_medication 嘅 params 只包含用戶親口講出嘅資料，用戶冇提及嘅欄位唔好放入params

請以JSON格式回覆：{"intent":"英文intent名","transcript":"用戶原話（原文轉錄，唔係翻譯）","params":{},"reply":"廣東話回覆"}`,

  zh: `你是一个长者护理助手，支持中英粤混合口语。用户可能会用粤语、普通话、英文、或者混合来说话。
请用普通话回复，语气要亲切自然，像跟家人聊天一样。

你支持多轮对话。如果之前的对话有提供上下文，请根据上下文来理解用户的意图。

仔细听用户的语音，识别他们的意图。【intent字段必须用英文名】：
1. record_medication - 记录吃药（用户宣告已经吃了）。例如"我吃了药""已经吃药""帮我记录""我已经完成""吃完了""完成吃药""我把止痛药吃完了"。⚠️ 判断关键：用户是陈述句、说已完成的事情 → record_medication。
2. add_medication - 新增药物。例如"加一种新药""我要吃新药"。params用以下字段：
   drug_name(药名), unit(单位), dosage(剂量数字), times_per_day(整数), duration_days(整数), reminder_times(["HH:MM"]), after_meal(true/false)
   ⚠️ 严格规则：params里只能放用户明确说出来的资料。用户没说的字段绝对不能自己猜测或捏造，包括药名、剂量、次数、天数。如果用户没说药名，params必须是{}，reply要问用户药名是什么。
3. call_contact - 打电话给人。例如"打给女儿""打电话"。params要有name
4. check_medication - 查询药物（用户是疑问句，问自己要吃什么）。例如"今天吃什么药""有什么药没吃""还有什么没吃"。⚠️ 只有用户是问问题才用这个 intent，如果用户陈述已完成就用 record_medication。
5. set_schedule - 设定日程。例如"下午三点看医生"。params要有title, datetime(ISO格式), description
6. general_chat - 其他所有对话

${DB_SCHEMA_INFO}

重要规则：
- intent 字段必须用英文（record_medication/add_medication/call_contact/check_medication/set_schedule/general_chat）
- reply 字段必须是自然的普通话回复，不要放JSON
- 如果语音不清楚，reply写"对不起，我听不清楚，请再说一次"，intent设为general_chat
- add_medication 的 params 只包含用户亲口说出的资料，用户没提到的字段不要放进params

请以JSON格式回复：{"intent":"英文intent名","transcript":"用户原话（逐字）","params":{},"reply":"普通话回复"}`,

  en: `You are an elderly care assistant that understands Cantonese, Mandarin, and English (including mixed speech).
Please reply in English. Be warm and natural, like talking to a family member.

You support multi-turn conversation. If previous conversation context is provided, use it to understand the user's intent.

Listen carefully to the user's voice and identify their intent. The intent field MUST be in English:
1. record_medication - Record medication taken (user DECLARES they have taken it). e.g. "I took my medicine", "Mark it as taken", "I already finished", "I've taken my painkiller", "Done with my evening meds". ⚠️ KEY RULE: if the user makes a STATEMENT about completing/taking medication → record_medication.
2. add_medication - Add new medication. e.g. "Add a new medicine". params should use:
   drug_name(name), unit(unit), dosage(number), times_per_day(integer), duration_days(integer), reminder_times(["HH:MM"]), after_meal(true/false)
   ⚠️ STRICT RULE: params must ONLY contain fields explicitly stated by the user. NEVER guess, invent, or fill in any drug name, dosage, frequency, or duration that the user did not say. If the user did not mention a drug name, params must be {} and reply must ask for the drug name.
3. call_contact - Call a contact. e.g. "Call my daughter". params should include name
4. check_medication - Check medication (user ASKS what they need to take). e.g. "What medicine today", "What haven't I taken". ⚠️ Only use this when the user is ASKING a question; if they are STATING they have finished, use record_medication instead.
5. set_schedule - Set schedule. e.g. "Doctor at 3pm". params should include title, datetime (ISO format), description
6. general_chat - All other conversations

${DB_SCHEMA_INFO}

Important rules:
- intent field MUST be English (record_medication/add_medication/call_contact/check_medication/set_schedule/general_chat)
- reply field must be a natural English response, NOT JSON
- If the speech is unclear, set reply to "Sorry, I didn't catch that. Could you say it again?" and intent to general_chat
- add_medication params must ONLY include fields the user explicitly mentioned; omit all fields the user did not mention

Reply in JSON format: {"intent":"english_intent_name","transcript":"user's exact words (verbatim)","params":{},"reply":"natural reply"}`,
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

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Send audio to Qwen3.5-audio for end-to-end recognition + understanding.
 * The model transcribes the audio AND extracts intent in one pass.
 *
 * @param audioBase64 - Base64-encoded audio data (WAV, M4A, MP3)
 * @param language - Target language for recognition
 * @param mimeType - MIME type of audio (default: audio/wav)
 * @param conversationHistory - Previous conversation turns for multi-turn support
 */
export async function recognizeVoiceCommand(
  audioBase64: string,
  language: VoiceLanguage = "yue",
  mimeType: string = "audio/wav",
  conversationHistory: ConversationTurn[] = [],
): Promise<VoiceRecognitionResult> {
  assertConfigured();

  const systemPrompt = SYSTEM_PROMPTS[language];

  // Build the audio data URI
  const audioDataUri = `data:${mimeType};base64,${audioBase64}`;

  // Use DashScope multimodal API (compatible mode) for Qwen audio model
  const apiUrl = `${process.env.EXPO_PUBLIC_DASHSCOPE_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"}/chat/completions`;

  // Build messages with conversation history for multi-turn support
  const messages: any[] = [
    {
      role: "system",
      content: [{ type: "text", text: systemPrompt }],
    },
  ];

  // Add conversation history (last 6 turns max)
  for (const turn of conversationHistory.slice(-6)) {
    messages.push({
      role: turn.role,
      content: [{ type: "text", text: turn.text }],
    });
  }

  // Add current audio input
  messages.push({
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
        text: "請聽我講嘅嘢，識別意圖，用JSON回覆",
      },
    ],
  });

  const requestBody = {
    model: DASHSCOPE_AUDIO_MODEL,
    messages,
    max_tokens: 500,
    temperature: 0.3,
    modalities: ["text"],
    audio: { voice: "Chelsie", format: "wav" },
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

  return parseRecognitionResponse(textContent);
}

/**
 * Map Chinese intent names to English intent names.
 */
const INTENT_MAP: Record<string, string> = {
  "記錄食藥": "record_medication",
  "记录吃药": "record_medication",
  "記錄吃藥": "record_medication",
  "新增藥物": "add_medication",
  "新增药物": "add_medication",
  "加藥": "add_medication",
  "加药": "add_medication",
  "打電話": "call_contact",
  "打电话": "call_contact",
  "打電話畀人": "call_contact",
  "打电话给人": "call_contact",
  "查詢藥物": "check_medication",
  "查询药物": "check_medication",
  "檢查藥物": "check_medication",
  "检查药物": "check_medication",
  "設定日程": "set_schedule",
  "设定日程": "set_schedule",
  "一般對話": "general_chat",
  "一般对话": "general_chat",
  "闲聊": "general_chat",
  "閒聊": "general_chat",
};

/**
 * Parse the JSON response from Qwen3.5-audio.
 * Falls back gracefully if the model doesn't return valid JSON.
 * Handles Chinese intent names and nested JSON in reply field.
 */
function parseRecognitionResponse(
  rawText: string,
): VoiceRecognitionResult {
  // Strip <think>...</think> blocks that some models emit
  let cleanedText = rawText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip markdown code fences if present (```json ... ```)
  cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Try to extract JSON from the response
  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    let jsonStr = jsonMatch[0];

    // Helper: attempt JSON.parse, also trying unescape if first attempt fails
    const tryParse = (str: string): any | null => {
      try {
        return JSON.parse(str);
      } catch {
        // AI sometimes returns escaped JSON (literal \" instead of ")
        // Unescape and retry
        const unescaped = str.replace(/\\"/g, '"').replace(/\\\\"/g, '"');
        try {
          return JSON.parse(unescaped);
        } catch {
          return null;
        }
      }
    };

    const parsed = tryParse(jsonStr);
    if (parsed) {
      // Map Chinese intent to English
      let intent = parsed.intent || "general_chat";
      if (INTENT_MAP[intent]) {
        intent = INTENT_MAP[intent];
      }

      // Fix reply field: if it looks like JSON, extract the actual reply
      let reply = parsed.reply || "";
      if (typeof reply === "string" && reply.trim().startsWith("{")) {
        try {
          const nestedJson = JSON.parse(reply);
          reply = nestedJson.reply || nestedJson.new_medicine || reply;
          // If nested JSON has more useful params, merge them
          if (nestedJson.params && typeof nestedJson.params === "object") {
            parsed.params = { ...parsed.params, ...nestedJson.params };
          }
          if (nestedJson.intent && INTENT_MAP[nestedJson.intent]) {
            intent = INTENT_MAP[nestedJson.intent];
          }
        } catch {
          // Not valid JSON, use as-is
        }
      }

      // Fix params: check if any param value looks like a reply instead of data
      const params = parsed.params || {};
      if (params.new_medicine && typeof params.new_medicine === "string" && params.new_medicine.length > 50) {
        // This is likely a reply stuffed into params, not actual medication data
        if (!reply) reply = params.new_medicine;
        delete params.new_medicine;
      }

      // Ensure reply is not a JSON string
      if (typeof reply === "string") {
        reply = reply.trim();
        // Final safety check: if reply still looks like JSON, extract the inner reply
        if (reply.startsWith("{") && reply.includes('"reply"')) {
          const innerParsed = tryParse(reply);
          if (innerParsed?.reply) reply = innerParsed.reply;
        }
      }

      return {
        transcript: parsed.transcript || reply || rawText,
        intent,
        params,
        reply: reply || rawText,
        raw: rawText,
      };
    }
  }

  // Fallback: treat entire response as general chat
  return {
    transcript: rawText,
    intent: "general_chat",
    params: {},
    reply: rawText || "唔好意思，我聽唔太清楚。可以再講多次嗎？",
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
