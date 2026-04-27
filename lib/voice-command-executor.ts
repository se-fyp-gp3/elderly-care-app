// lib/voice-command-executor.ts
// Executes voice commands identified by Qwen3.5-audio recognition
// Bridges intent → action and generates Chinese response messages

import { Linking } from "react-native";
import { getContactsForElderly, getElderlyContacts } from "./contacts";
import {
  getCustomVoicesForElderly,
  getResolvedCustomVoiceId,
  resolveCustomVoiceSlotFromLanguage,
  selectBestCustomVoiceForSlot,
} from "./custom-voice";
import { createElderlyMedicationWithReminder, getElderlyByUserId } from "./elderly";
import {
  fetchActiveMedicationReminders,
  fetchDailyMedicationLogs,
  getFormattedTodayMedicationSummary,
  logMedicationAction,
} from "./medication_tracking";
import { DEFAULT_VOICE, synthesizePersonalVoice } from "./personal-voice";
import { createScheduleTask } from "./schedule";
import type { VoiceLanguage, VoiceRecognitionResult } from "./voice-recognition";

// ── Types ──

export interface CommandResult {
  success: boolean;
  message: string;          // Chinese message for TTS playback
  action?: string;           // What was done
  needsConfirmation?: boolean;
  confirmationData?: any;
  audioBase64?: string;      // Pre-synthesized audio if available
}

// ── Per-language messages ──

const MESSAGES: Record<VoiceLanguage, Record<string, string>> = {
  yue: {
    medication_recorded: "好嘅，已經幫你記錄咗食藥喇。",
    medication_all_taken: "你今日嘅藥已經全部食晒啦！做得好！",
    medication_none_pending: "你而家冇未食嘅藥。",
    medication_error: "記錄食藥嘅時候出咗啲問題，請稍後再試。",
    check_no_medication: "你今日冇藥要食。",
    add_medication_prompt: "好嘅，請你講出藥名同埋幾時食。",
    call_no_contacts: "你而家冇聯絡人。",
    call_which_contact: "你想打畀邊個？",
    call_not_found: "搵唔到呢個聯絡人。",
    call_no_phone: "呢個聯絡人冇電話號碼。",
    calling: "好嘅，而家幫你打畀",
    schedule_created: "好嘅，已經幫你設定咗日程。",
    schedule_error: "設定日程嘅時候出咗啲問題，請稍後再試。",
    schedule_missing_info: "請講清楚幾時同埋做咩嘢。",
    general_response: "我聽到你講嘅嘢啦。有咩可以幫到你？",
    error: "唔好意思，出咗啲問題。請再試一次。",
    confirm_cancelled: "好嘅，取消咗。",
  },
  zh: {
    medication_recorded: "好的，已经帮你记录了吃药。",
    medication_all_taken: "你今天的药已经全部吃完了！做得好！",
    medication_none_pending: "你现在没有未吃的药。",
    medication_error: "记录吃药的时候出了点问题，请稍后再试。",
    check_no_medication: "你今天没有药要吃。",
    add_medication_prompt: "好的，请说出药名和什么时候吃。",
    call_no_contacts: "你现在没有联系人。",
    call_which_contact: "你想打给谁？",
    call_not_found: "找不到这个联系人。",
    call_no_phone: "这个联系人没有电话号码。",
    calling: "好的，现在帮你打给",
    schedule_created: "好的，已经帮你设定了日程。",
    schedule_error: "设定日程的时候出了点问题，请稍后再试。",
    schedule_missing_info: "请说清楚什么时候和做什么。",
    general_response: "我听到你说的了。有什么可以帮到你？",
    error: "不好意思，出了点问题。请再试一次。",
    confirm_cancelled: "好的，已取消。",
  },
  en: {
    medication_recorded: "OK, I've recorded that you took your medication.",
    medication_all_taken: "You've taken all your medication for today! Well done!",
    medication_none_pending: "You have no pending medication right now.",
    medication_error: "There was a problem recording your medication. Please try again later.",
    check_no_medication: "You have no medication to take today.",
    add_medication_prompt: "OK, please tell me the medicine name and when to take it.",
    call_no_contacts: "You don't have any contacts.",
    call_which_contact: "Who would you like to call?",
    call_not_found: "I couldn't find that contact.",
    call_no_phone: "This contact doesn't have a phone number.",
    calling: "OK, calling ",
    schedule_created: "OK, I've set up the schedule for you.",
    schedule_error: "There was a problem setting the schedule. Please try again later.",
    schedule_missing_info: "Please tell me when and what you'd like to schedule.",
    general_response: "I heard you. How can I help?",
    error: "Sorry, something went wrong. Please try again.",
    confirm_cancelled: "OK, cancelled.",
  },
};

interface ResolvedScheduleDraft {
  title: string;
  description: string;
  datetime: Date | null;
  datetimeText: string;
}

/**
 * Execute a voice command based on recognition result.
 *
 * @param result - The recognition result from Qwen3.5-audio
 * @param userId - Current user's ID
 * @param language - Active language
 */
export async function executeVoiceCommand(
  result: VoiceRecognitionResult,
  userId: string,
  language: VoiceLanguage = "yue",
): Promise<CommandResult> {
  const msg = MESSAGES[language] || MESSAGES.yue;

  try {
    switch (result.intent) {
      case "record_medication":
        return await handleRecordMedication(userId, msg);

      case "check_medication":
        return await handleCheckMedication(userId, msg, language);

      case "add_medication":
        return await handleAddMedication(userId, msg, result.params, language);

      case "call_contact":
        return await handleCallContact(userId, msg, result.params);

      case "set_schedule":
        return await handleSetSchedule(userId, msg, result, language);

      case "general_chat":
      default:
        return {
          success: true,
          message: result.reply || msg.general_response,
          action: "general_chat",
        };
    }
  } catch (error) {
    console.error("[voice-cmd] Execution error:", error);
    return {
      success: false,
      message: msg.error,
      action: "error",
    };
  }
}

function getScheduleLocale(language: VoiceLanguage): string {
  switch (language) {
    case "en":
      return "en-US";
    case "zh":
      return "zh-CN";
    case "yue":
    default:
      return "zh-HK";
  }
}

function formatScheduleDateTime(date: Date, language: VoiceLanguage): string {
  try {
    return new Intl.DateTimeFormat(getScheduleLocale(language), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function parseAbsoluteDateCandidate(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (!/^\d{4}-\d{1,2}-\d{1,2}|^\d{4}\/\d{1,2}\/\d{1,2}|T\d{2}:\d{2}|Z$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function getExplicitDayOffset(text: string): number | null {
  if (!text) return null;

  if (/(大後日|大后天)/i.test(text)) return 3;
  if (/(後天|后天|day after tomorrow)/i.test(text)) return 2;
  if (/(聽朝|听朝|聽日|听日|明天|明日|明早|明朝|tomorrow)/i.test(text)) return 1;
  if (/(今日|今天|今朝|今晚|today|tonight|this morning|this afternoon|this evening)/i.test(text)) {
    return 0;
  }

  return null;
}

function applyTimeOfDayHint(hours: number, text: string): number {
  const hasPmHint = /(下午|下晝|晚上|今晚|夜晚|傍晚|pm|afternoon|evening|tonight)/i.test(text);
  const hasAmHint = /(朝早|早上|上午|清晨|凌晨|am|morning)/i.test(text);
  const hasNoonHint = /(中午|noon)/i.test(text);

  if (hasNoonHint) {
    if (hours === 0) return 12;
    if (hours < 11) return hours + 12;
  }

  if (hasPmHint && hours < 12) {
    return hours + 12;
  }

  if (hasAmHint && hours === 12) {
    return 0;
  }

  return hours;
}

function extractTimeParts(text: string): { hours: number; minutes: number } | null {
  if (!text) return null;

  const normalized = text.replace(/：/g, ":");
  const halfMatch = normalized.match(/(\d{1,2})\s*(?:點半|点半)/i);
  if (halfMatch) {
    const hours = Number.parseInt(halfMatch[1], 10);
    if (!Number.isNaN(hours)) {
      return {
        hours: applyTimeOfDayHint(hours, normalized),
        minutes: 30,
      };
    }
  }

  const chineseMatch = normalized.match(
    /(\d{1,2})\s*(?:點鐘|点钟|點|点|時|时|:)\s*(\d{1,2})?\s*(?:分)?/i,
  );
  if (chineseMatch) {
    const hours = Number.parseInt(chineseMatch[1], 10);
    const minutes = Number.parseInt(chineseMatch[2] || "0", 10);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      return {
        hours: applyTimeOfDayHint(hours, normalized),
        minutes,
      };
    }
  }

  const englishMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (englishMatch) {
    let hours = Number.parseInt(englishMatch[1], 10);
    const minutes = Number.parseInt(englishMatch[2] || "0", 10);
    const meridiem = englishMatch[3].toLowerCase();
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      return { hours, minutes };
    }
  }

  return null;
}

function parseSpokenScheduleDate(text: string, reference: Date = new Date()): Date | null {
  if (!text) return null;

  const timeParts = extractTimeParts(text);
  if (!timeParts) return null;

  const date = new Date(reference);
  date.setSeconds(0, 0);
  date.setHours(timeParts.hours, timeParts.minutes, 0, 0);

  const explicitDayOffset = getExplicitDayOffset(text);
  if (explicitDayOffset !== null) {
    date.setDate(date.getDate() + explicitDayOffset);
    return date;
  }

  if (date.getTime() <= reference.getTime()) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function extractScheduleTitle(text: string): string {
  if (!text) return "";

  let title = text;
  title = title.replace(/[，。,.!?！？]/g, " ");
  title = title.replace(/\b(confirm|confirmed|ok|okay|sure|please|set|schedule|appointment|tomorrow|today|tonight|this morning|this afternoon|this evening|am|pm)\b/gi, " ");
  title = title.replace(/(確認|确认|確定|确定|請|请|幫我|帮我|安排|新增|添加|設定|设定|日程|行程|預約|预约|時間|时间|喺|在|於|于|聽朝|听朝|聽日|听日|明天|明日|明早|明朝|今日|今天|今朝|今晚|後天|后天|朝早|早上|上午|下晝|下午|晚上|夜晚|中午|凌晨)/g, " ");
  title = title.replace(/(\d{1,2})\s*(?:點鐘|点钟|點半|点半|點|点|時|时|:)\s*(\d{1,2})?\s*(?:分)?/g, " ");
  title = title.replace(/\s+/g, " ").trim();

  return title;
}

function resolveScheduleDraft(
  params: Record<string, any>,
  transcript: string,
  reply: string,
  fallback?: Partial<{
    title: string;
    description: string;
    datetime: string;
    datetimeIso: string;
  }>,
): ResolvedScheduleDraft {
  const transcriptText = typeof transcript === "string" ? transcript.trim() : "";
  const replyText = typeof reply === "string" ? reply.trim() : "";
  const explicitTitle = String(params.title || params.event || fallback?.title || "").trim();
  const explicitDescription = String(params.description || fallback?.description || "").trim();
  const explicitDateText = String(
    params.datetime || params.time || params.date || fallback?.datetime || fallback?.datetimeIso || "",
  ).trim();

  const candidateTexts = [transcriptText, replyText].filter(Boolean);

  let datetime = candidateTexts
    .map((text) => parseSpokenScheduleDate(text))
    .find((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime())) || null;

  if (!datetime && explicitDateText) {
    datetime =
      parseSpokenScheduleDate(explicitDateText) ||
      parseAbsoluteDateCandidate(explicitDateText);
  }

  const title =
    explicitTitle ||
    candidateTexts
      .map((text) => extractScheduleTitle(text))
      .find(Boolean) ||
    "";

  return {
    title,
    description: explicitDescription,
    datetime,
    datetimeText: explicitDateText,
  };
}

// ── Record Medication ──

async function handleRecordMedication(
  userId: string,
  msg: Record<string, string>,
): Promise<CommandResult> {
  try {
    const now = new Date();
    const todayLogs = await fetchDailyMedicationLogs(userId, now);
    const reminders = await fetchActiveMedicationReminders(userId);

    // Find the next pending medication
    const hkOffset = 8 * 60 * 60 * 1000;
    const hkDate = new Date(now.getTime() + hkOffset);
    const todayStr = hkDate.toISOString().slice(0, 10);

    let pendingFound = false;

    for (const reminder of reminders) {
      for (const time of reminder.reminder_times) {
        const [hours, minutes] = time.split(":").map(Number);
        const baseDate = new Date(todayStr);
        baseDate.setUTCHours(hours, minutes, 0, 0);
        const scheduledDate = new Date(baseDate.getTime() - hkOffset);
        const scheduledAt = scheduledDate.toISOString();

        // Find existing log for this time slot
        const existingLog = todayLogs.find((l) => {
          const logRemId =
            typeof l.elderly_medication_reminder === "string"
              ? l.elderly_medication_reminder
              : l.elderly_medication_reminder?.$id;
          if (logRemId !== reminder.$id) return false;
          const logTime = new Date(l.scheduled_at).getTime();
          return Math.abs(logTime - scheduledDate.getTime()) < 2000;
        });

        if (existingLog && existingLog.status === "pending") {
          pendingFound = true;

          // Get medication name for response
          const medications = Array.isArray(
            reminder.elderly_medication?.medication,
          )
            ? reminder.elderly_medication.medication
            : reminder.elderly_medication?.medication
              ? [reminder.elderly_medication.medication]
              : [];
          // @ts-ignore
          const medName = medications[0]?.name || "";

          const confirmMsg = `確認記錄食咗${medName ? `「${medName}」` : "藥"}？講「確認」或者「取消」。`;

          return {
            success: true,
            message: confirmMsg,
            action: "record_medication",
            needsConfirmation: true,
            confirmationData: {
              readyToExecute: true,
              action: "record_medication",
              reminderId: reminder.$id,
              scheduledAt,
              medName,
            },
          };
        }
      }
    }

    if (!pendingFound) {
      return {
        success: true,
        message: msg.medication_none_pending,
        action: "record_medication",
      };
    }

    return {
      success: true,
      message: msg.medication_recorded,
      action: "record_medication",
    };
  } catch (error) {
    console.error("[voice-cmd] Record medication error:", error);
    return {
      success: false,
      message: msg.medication_error,
      action: "record_medication",
    };
  }
}

// ── Check Medication ──

async function handleCheckMedication(
  userId: string,
  msg: Record<string, string>,
  language: VoiceLanguage = "yue",
): Promise<CommandResult> {
  const summary = await getFormattedTodayMedicationSummary(userId, language);

  return {
    success: true,
    message: summary || msg.check_no_medication,
    action: "check_medication",
  };
}

// ── Add Medication ──

const ADD_MED_MESSAGES: Record<VoiceLanguage, Record<string, string>> = {
  yue: {
    missing_name: "你想加咩藥呀？請講藥名。",
    missing_times: "一日食幾次呀？",
    missing_duration: "要食幾多日呀？",
    invalid_times_per_day: "「每日幾次」要係一個整數，例如一日三次。請再講一次。",
    invalid_duration: "「食幾日」要係一個整數，例如七日、十四日。請再講一次。",
    success: "好嘅，已經幫你加咗",
    error: "加藥嘅時候出咗啲問題，請稍後再試。",
  },
  zh: {
    missing_name: "你想加什么药？请说药名。",
    missing_times: "一天吃几次？",
    missing_duration: "要吃几天？",
    invalid_times_per_day: "「每天几次」必须是整数，例如一天三次。请再说一次。",
    invalid_duration: "「吃几天」必须是整数，例如七天、十四天。请再说一次。",
    success: "好的，已经帮你加了",
    error: "加药时出了问题，请稍后再试。",
  },
  en: {
    missing_name: "What medicine would you like to add? Please tell me the name.",
    missing_times: "How many times a day?",
    missing_duration: "How many days should you take it?",
    invalid_times_per_day: "Times per day must be a whole number, like 3 times a day. Please say again.",
    invalid_duration: "Duration must be a whole number of days, like 7 or 14 days. Please say again.",
    success: "OK, I've added ",
    error: "There was a problem adding the medication. Please try again later.",
  },
};

async function handleAddMedication(
  userId: string,
  msg: Record<string, string>,
  params: Record<string, any>,
  language: VoiceLanguage = "yue",
): Promise<CommandResult> {
  const addMsg = ADD_MED_MESSAGES[language] || ADD_MED_MESSAGES.yue;

  const drugName = params.drug_name || params.name || params.medication_name || "";
  const timesPerDay = params.times_per_day;
  const durationDays = params.duration_days || params.duration;
  const reminderTimes = params.reminder_times || [];
  const afterMeal = params.after_meal ?? false;
  const dosage = params.dosage ? Number(params.dosage) : 1;
  const unit = params.unit || "dose";

  // Validate required fields
  if (!drugName) {
    return {
      success: true,
      message: params.reply || addMsg.missing_name,
      action: "add_medication",
      needsConfirmation: true,
      confirmationData: { step: "need_name" },
    };
  }

  if (timesPerDay === undefined || timesPerDay === null) {
    return {
      success: true,
      message: params.reply || addMsg.missing_times,
      action: "add_medication",
      needsConfirmation: true,
      confirmationData: { step: "need_times", drug_name: drugName },
    };
  }

  const timesInt = parseInt(String(timesPerDay), 10);
  if (isNaN(timesInt) || timesInt < 1) {
    return {
      success: true,
      message: addMsg.invalid_times_per_day,
      action: "add_medication",
      needsConfirmation: true,
      confirmationData: { step: "need_times", drug_name: drugName },
    };
  }

  if (durationDays === undefined || durationDays === null) {
    return {
      success: true,
      message: params.reply || addMsg.missing_duration,
      action: "add_medication",
      needsConfirmation: true,
      confirmationData: { step: "need_duration", drug_name: drugName, times_per_day: timesInt },
    };
  }

  const durationInt = parseInt(String(durationDays), 10);
  if (isNaN(durationInt) || durationInt < 1) {
    return {
      success: true,
      message: addMsg.invalid_duration,
      action: "add_medication",
      needsConfirmation: true,
      confirmationData: { step: "need_duration", drug_name: drugName, times_per_day: timesInt },
    };
  }

  // Generate default reminder times if not provided or invalid
  let times: string[] = Array.isArray(reminderTimes) ? reminderTimes : [];
  // Filter out non-HH:MM entries (e.g. "饭后", Chinese text)
  times = times.filter((t: string) => /^\d{1,2}:\d{2}$/.test(t));
  if (times.length === 0) {
    const defaultTimes: Record<number, string[]> = {
      1: ["09:00"],
      2: ["09:00", "21:00"],
      3: ["08:00", "13:00", "19:00"],
      4: ["08:00", "12:00", "17:00", "22:00"],
    };
    times = defaultTimes[timesInt] || Array.from({ length: timesInt }, (_, i) => {
      const hour = Math.round(8 + (i * 14) / (timesInt - 1 || 1));
      return `${String(hour).padStart(2, "0")}:00`;
    });
  }

  // All params valid — ask for confirmation before creating
  const confirmMsg = language === "yue"
    ? `確認加「${drugName}」，一日${timesInt}次，食${durationInt}日？講「確認」或者「取消」。`
    : language === "zh"
      ? `确认添加「${drugName}」，一天${timesInt}次，吃${durationInt}天？说「确认」或「取消」。`
      : `Add "${drugName}", ${timesInt} times a day for ${durationInt} days. Say "confirm" or "cancel".`;

  return {
    success: true,
    message: confirmMsg,
    action: "add_medication",
    needsConfirmation: true,
    confirmationData: {
      readyToExecute: true,
      action: "add_medication",
      drug_name: drugName,
      unit,
      dosage,
      times_per_day: timesInt,
      duration_days: durationInt,
      after_meal: !!afterMeal,
      reminder_times: times,
    },
  };
}

// ── Call Contact ──

async function handleCallContact(
  userId: string,
  msg: Record<string, string>,
  params: Record<string, any>,
): Promise<CommandResult> {
  const elderly = await getElderlyByUserId(userId);
  if (!elderly) {
    return { success: false, message: msg.call_no_contacts, action: "call_contact" };
  }

  // Get both caregiver contacts AND elderly contacts
  const [caregiverContacts, elderlyContacts] = await Promise.all([
    getContactsForElderly(elderly.$id),
    getElderlyContacts(elderly.$id).catch(() => []),
  ]);
  const contacts = [...caregiverContacts, ...elderlyContacts];
  if (contacts.length === 0) {
    return { success: false, message: msg.call_no_contacts, action: "call_contact" };
  }

  const targetName = params.name || params.contact || "";

  if (!targetName) {
    // List available contacts
    const names = contacts.map((c) => c.name).join("、");
    const listMsg = `你有呢啲聯絡人：${names}。你想打畀邊個？`;

    return {
      success: true,
      message: listMsg,
      action: "call_contact",
      needsConfirmation: true,
      confirmationData: { contacts },
    };
  }

  // Fuzzy match contact name
  const lowerTarget = targetName.toLowerCase();
  const matched = contacts.find(
    (c) =>
      c.name.toLowerCase().includes(lowerTarget) ||
      lowerTarget.includes(c.name.toLowerCase()),
  );

  if (!matched) {
    return { success: false, message: msg.call_not_found, action: "call_contact" };
  }

  if (!matched.phone) {
    return { success: false, message: msg.call_no_phone, action: "call_contact" };
  }

  // Initiate the call
  const phoneUrl = `tel:${matched.phone}`;
  const canOpen = await Linking.canOpenURL(phoneUrl);
  if (canOpen) {
    await Linking.openURL(phoneUrl);
  }

  return {
    success: true,
    message: `${msg.calling}${matched.name}。`,
    action: "call_contact",
  };
}

// ── Set Schedule ──

async function handleSetSchedule(
  userId: string,
  msg: Record<string, string>,
  result: VoiceRecognitionResult,
  language: VoiceLanguage = "yue",
): Promise<CommandResult> {
  try {
    const elderly = await getElderlyByUserId(userId);
    if (!elderly) {
      return { success: false, message: msg.schedule_error, action: "set_schedule" };
    }

    const draft = resolveScheduleDraft(
      result.params || {},
      result.transcript || "",
      result.reply || "",
    );

    if (!draft.title || !draft.datetime) {
      return {
        success: true,
        message: msg.schedule_missing_info,
        action: "set_schedule",
        needsConfirmation: true,
      };
    }

    // All params valid — ask for confirmation before creating
    const formattedDatetime = formatScheduleDateTime(draft.datetime, language);
    const confirmMsg = language === "yue"
      ? `確認設定日程「${draft.title}」喺 ${formattedDatetime}？講「確認」或者「取消」。`
      : language === "zh"
        ? `确认设定日程「${draft.title}」在 ${formattedDatetime}？说「确认」或「取消」。`
        : `Set schedule "${draft.title}" at ${formattedDatetime}? Say "confirm" or "cancel".`;

    return {
      success: true,
      message: confirmMsg,
      action: "set_schedule",
      needsConfirmation: true,
      confirmationData: {
        readyToExecute: true,
        action: "set_schedule",
        title: draft.title,
        description: draft.description,
        datetime: draft.datetimeText || draft.datetime.toISOString(),
        datetimeIso: draft.datetime.toISOString(),
        elderlyId: elderly.$id,
      },
    };
  } catch (error) {
    console.error("[voice-cmd] Set schedule error:", error);
    return {
      success: false,
      message: msg.schedule_error,
      action: "set_schedule",
    };
  }
}

/**
 * Execute a previously confirmed pending action.
 */
export async function executePendingAction(
  pendingData: any,
  userId: string,
  language: VoiceLanguage = "yue",
  latestRecognition?: Pick<VoiceRecognitionResult, "params" | "transcript" | "reply">,
): Promise<CommandResult> {
  const msg = MESSAGES[language] || MESSAGES.yue;
  const addMsg = ADD_MED_MESSAGES[language] || ADD_MED_MESSAGES.yue;

  try {
    switch (pendingData.action) {
      case "add_medication": {
        const times: string[] = Array.isArray(pendingData.reminder_times) ? pendingData.reminder_times : [];
        const timesInt = pendingData.times_per_day;
        const durationInt = pendingData.duration_days;
        const drugName = pendingData.drug_name;

        // Generate default reminder times if empty
        let finalTimes = times;
        if (finalTimes.length === 0) {
          const defaultTimes: Record<number, string[]> = {
            1: ["09:00"],
            2: ["09:00", "21:00"],
            3: ["08:00", "13:00", "19:00"],
            4: ["08:00", "12:00", "17:00", "22:00"],
          };
          finalTimes = defaultTimes[timesInt] || Array.from({ length: timesInt }, (_, i) => {
            const hour = Math.round(8 + (i * 14) / (timesInt - 1 || 1));
            return `${String(hour).padStart(2, "0")}:00`;
          });
        }

        await createElderlyMedicationWithReminder(userId, {
          name: drugName,
          unit: pendingData.unit || "dose",
          dosage: pendingData.dosage || 1,
          timesPerDay: timesInt,
          durationDays: durationInt,
          afterMeal: !!pendingData.after_meal,
          reminderTimes: finalTimes,
          startDate: new Date().toISOString(),
          active: true,
        });

        const successMsg = language === "yue"
          ? `好嘅，已經幫你加咗「${drugName}」，一日${timesInt}次，食${durationInt}日。`
          : language === "zh"
            ? `好的，已经帮你加了「${drugName}」，一天${timesInt}次，吃${durationInt}天。`
            : `OK, I've added "${drugName}", ${timesInt} times a day for ${durationInt} days.`;

        return { success: true, message: successMsg, action: "add_medication" };
      }

      case "set_schedule": {
        const draft = resolveScheduleDraft(
          latestRecognition?.params || {},
          latestRecognition?.transcript || "",
          latestRecognition?.reply || "",
          pendingData,
        );
        const datetime = draft.datetime || parseAbsoluteDateCandidate(String(pendingData.datetimeIso || pendingData.datetime || ""));

        if (!datetime) {
          return { success: false, message: msg.schedule_missing_info, action: "set_schedule" };
        }

        await createScheduleTask({
          title: draft.title || pendingData.title,
          description: draft.description || pendingData.description || "",
          datetime,
          elderlyId: pendingData.elderlyId,
          typeName: "appointment",
          notificationAudience: "caregivers",
        });

        const schedMsg = language === "yue"
          ? `好嘅，已經幫你設定咗日程「${draft.title || pendingData.title}」。`
          : language === "zh"
            ? `好的，已经帮你设定了日程「${draft.title || pendingData.title}」。`
            : `OK, I've set the schedule "${draft.title || pendingData.title}".`;

        return { success: true, message: schedMsg, action: "set_schedule" };
      }

      case "record_medication": {
        await logMedicationAction(
          userId,
          pendingData.reminderId,
          pendingData.scheduledAt,
          "taken",
          pendingData.medName,
        );
        const medName = pendingData.medName || "";
        const takenMsg = language === "yue"
          ? `好嘅，已經幫你記錄咗${medName ? `「${medName}」` : ""}食藥。`
          : language === "zh"
            ? `好的，已经帮你记录了${medName ? `「${medName}」` : ""}吃药。`
            : `OK, I've recorded that you took ${medName || "your medication"}.`;
        return { success: true, message: takenMsg, action: "record_medication" };
      }

      default:
        return { success: false, message: msg.error, action: "error" };
    }
  } catch (error) {
    console.error("[voice-cmd] Execute pending action error:", error);
    return { success: false, message: msg.error, action: "error" };
  }
}

/**
 * Synthesize a command result message using the saved family voice or the default Qwen preset voice.
 *
 * @param message - Text to synthesize
 * @param elderlyId - Elderly profile ID (to look up custom voice)
 * @param language - Language for TTS pronunciation
 * @returns base64 audio string
 */
export async function synthesizeCommandResponse(
  message: string,
  elderlyId: string,
  language: VoiceLanguage = "yue",
): Promise<string | null> {
  try {
    // Try to find a custom voice for this elderly
    const customVoices = await getCustomVoicesForElderly(elderlyId);
    const voiceId =
      getResolvedCustomVoiceId(
        selectBestCustomVoiceForSlot(
          customVoices,
          resolveCustomVoiceSlotFromLanguage(language),
        ),
      ) || DEFAULT_VOICE;

    const result = await synthesizePersonalVoice(message, voiceId, undefined, language);
    return result.audioBase64 || null;
  } catch (error) {
    console.error("[voice-cmd] TTS synthesis error:", error);
    return null;
  }
}
