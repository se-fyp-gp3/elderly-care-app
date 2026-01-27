import {
  Elderly,
  ElderlyMedication,
  ElderlyStatus,
  Schedule,
} from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
  DATABASE_ID,
  ELDERLY_MEDICATION_TABLE_ID,
  ELDERLY_TABLE_ID,
  SCHEDULE_TABLE_ID,
  tablesDB,
} from "./appwrite";

export async function createElderlyProfile(
  data: Elderly,
): Promise<Elderly> {
  const document = await tablesDB.createRow<Elderly>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_TABLE_ID,
    rowId: ID.unique(),
    data: {
      user_id: data.user_id,
      name: data.name,
      phone: data.phone,
      birth: data.birth,
      status: ElderlyStatus.NORMAL,
    },
  });
  return document as unknown as Elderly;
}
export async function getElderlyByUserId(
  userId: string,
): Promise<Elderly | null> {
  try {
    const response = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("user_id", userId), Query.limit(1)],
    });
    if (response.total > 0) {
      return response.rows[0] as unknown as Elderly;
    }
    return null;
  } catch (error) {
    console.error("Error fetching elderly profile:", error);
    return null;
  }
}

export async function getElderlyByPhone(
  phone: string,
): Promise<Elderly | null> {
  try {
    const response = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("phone", phone), Query.limit(1)],
    });
    if (response.total > 0) {
      return response.rows[0] as unknown as Elderly;
    }
    return null;
  } catch (error) {
    console.error("Error fetching elderly profile by phone:", error);
    return null;
  }
}

const getTodayKey = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const formatTime = (time?: string | null) => {
  if (!time) return "";
  try {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return time;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return time;
  }
};

export async function fetchElderlyMedicationsForUser(
  userId?: string | null,
): Promise<ElderlyMedication[]> {
  if (!userId) return [] as ElderlyMedication[];

  const profile = await getElderlyByUserId(userId);
  const queries = [Query.limit(50), Query.orderDesc("$createdAt")];

  try {
    if (profile?.$id) {
      queries.unshift(Query.equal("elderly", profile.$id));
    }
    const response = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_TABLE_ID,
      queries,
    });
    return response.rows as unknown as ElderlyMedication[];
  } catch (error) {
    console.error("Error fetching medications:", error);
    if (profile?.$id) {
      try {
        const fallbackResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          queries: [Query.limit(50), Query.orderDesc("$createdAt")],
        });
        return fallbackResponse.rows as unknown as ElderlyMedication[];
      } catch (fallbackError) {
        console.error("Fallback medication fetch failed:", fallbackError);
      }
    }
    return [] as ElderlyMedication[];
  }
}

export async function fetchElderlySchedulesForUser(
  userId?: string | null,
): Promise<Schedule[]> {
  if (!userId) return [] as Schedule[];

  const profile = await getElderlyByUserId(userId);
  const queries = [Query.limit(50), Query.orderDesc("$createdAt")];

  try {
    if (profile?.$id) {
      queries.unshift(Query.equal("elderly", profile.$id));
    }
    const response = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: SCHEDULE_TABLE_ID,
      queries,
    });
    return response.rows as unknown as Schedule[];
  } catch (error) {
    console.error("Error fetching schedules:", error);
    if (profile?.$id) {
      try {
        const fallbackResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: SCHEDULE_TABLE_ID,
          queries: [Query.limit(50), Query.orderDesc("$createdAt")],
        });
        return fallbackResponse.rows as unknown as Schedule[];
      } catch (fallbackError) {
        console.error("Fallback schedule fetch failed:", fallbackError);
      }
    }
    return [] as Schedule[];
  }
}

export function buildMedicationSummary(
  medications: ElderlyMedication[],
): string {
  if (medications.length === 0) {
    return "I couldn't find any medications for today. Please check your medication list or ask your caregiver.";
  }

  const pending = medications.filter((m) => m.status !== "Completed");
  if (pending.length === 0) {
    return "You have no pending medications. You're all caught up today.";
  }

  const items = pending.slice(0, 5).map((med) => {
    const name = med.medication?.[0]?.name || "Medication";
    const dosage = med.dosage ? `${med.dosage}` : "1";
    const unit = med.medication?.[0]?.unit || "dose";
    const time = med.approx_times?.[0] ? ` at ${med.approx_times[0]}` : "";
    return `• ${name} — ${dosage} ${unit}${time}`;
  });

  return `Here is what you need to take today:\n${items.join("\n")}`;
}

export function buildScheduleSummary(schedules: Schedule[]): string {
  if (schedules.length === 0) {
    return "I couldn't find any schedules for today. Your schedule looks clear.";
  }

  const todayKey = getTodayKey();
  const upcoming = schedules.filter((schedule) => {
    if (!schedule.time) return true;
    return schedule.time.includes(todayKey);
  });

  if (upcoming.length === 0) {
    return "You have no upcoming events for today.";
  }

  const items = upcoming.slice(0, 5).map((schedule) => {
    const title = schedule.title || "Appointment";
    const time = schedule.time ? ` at ${formatTime(schedule.time)}` : "";
    return `• ${title}${time}`;
  });

  return `Here is your schedule for today:\n${items.join("\n")}`;
}
