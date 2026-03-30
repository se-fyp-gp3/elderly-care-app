// lib/voice-command-executor.ts
// Executes voice commands identified by Qwen3.5-audio recognition
// Bridges intent → action and generates Chinese response messages

import { Linking } from "react-native";
import { getContactsForElderly } from "./contacts";
import { getCustomVoicesForElderly } from "./custom-voice";
import { getElderlyByUserId } from "./elderly";
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
  },
};

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
        return await handleCheckMedication(userId, msg);

      case "add_medication":
        return handleAddMedication(msg, result.params);

      case "call_contact":
        return await handleCallContact(userId, msg, result.params);

      case "set_schedule":
        return await handleSetSchedule(userId, msg, result.params);

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
          // Mark this one as taken
          await logMedicationAction(userId, reminder.$id, scheduledAt, "taken");
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

          const takenMsg = `好嘅，已經幫你記錄咗${medName ? ` ${medName} ` : ""}食藥。`;

          return {
            success: true,
            message: takenMsg,
            action: "record_medication",
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
): Promise<CommandResult> {
  const summary = await getFormattedTodayMedicationSummary(userId);

  return {
    success: true,
    message: summary || msg.check_no_medication,
    action: "check_medication",
  };
}

// ── Add Medication ──

function handleAddMedication(
  msg: Record<string, string>,
  params: Record<string, any>,
): CommandResult {
  // This triggers UI navigation to the add medication screen
  return {
    success: true,
    message: msg.add_medication_prompt,
    action: "add_medication",
    needsConfirmation: true,
    confirmationData: {
      medicationName: params.name || "",
      time: params.time || "",
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

  const contacts = await getContactsForElderly(elderly.$id);
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
  params: Record<string, any>,
): Promise<CommandResult> {
  try {
    const elderly = await getElderlyByUserId(userId);
    if (!elderly) {
      return { success: false, message: msg.schedule_error, action: "set_schedule" };
    }

    const title = params.title || params.event || "";
    const datetimeStr = params.datetime || params.time || params.date || "";
    const description = params.description || "";

    if (!title || !datetimeStr) {
      return {
        success: true,
        message: msg.schedule_missing_info,
        action: "set_schedule",
        needsConfirmation: true,
      };
    }

    // Parse datetime — the AI model returns ISO format or natural language
    let datetime: Date;
    const parsed = Date.parse(datetimeStr);
    if (!isNaN(parsed)) {
      datetime = new Date(parsed);
    } else {
      // Fallback: use today with a default time
      datetime = new Date();
      datetime.setHours(datetime.getHours() + 1, 0, 0, 0);
    }

    await createScheduleTask({
      title,
      description,
      datetime,
      elderlyId: elderly.$id,
      typeName: "appointment",
    });

    return {
      success: true,
      message: `${msg.schedule_created} ${title}`,
      action: "set_schedule",
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
 * Synthesize a command result message using CosyVoice-v2 with family voice.
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
      customVoices.length > 0 ? customVoices[0].voice_id : DEFAULT_VOICE;

    const result = await synthesizePersonalVoice(message, voiceId, undefined, language);
    return result.audioBase64 || null;
  } catch (error) {
    console.error("[voice-cmd] TTS synthesis error:", error);
    return null;
  }
}
