import {
  Caregiver,
  CaregiverElderly,
  Elderly,
  ElderlyMedication,
  ElderlyMedicationStatus,
  ElderlyStatus,
  Medication,
  Schedule,
} from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
  CAREGIVER_ELDERLY_TABLE_ID,
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  ELDERLY_MEDICATION_REMINDER_TABLE_ID,
  ELDERLY_MEDICATION_TABLE_ID,
  ELDERLY_TABLE_ID,
  MEDICATION_LOGS_TABLE_ID,
  MEDICATION_TABLE_ID,
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

export type MedicationReminderInput = {
  name: string;
  unit?: string | null;
  dosage?: number | null;
  timesPerDay: number;
  durationDays: number;
  followUpCaregiver?: string | null;
  afterMeal: boolean;
  reminderTimes: string[];
  startDate?: string;
  active?: boolean;
};

const buildReminderNotesFallback = (input: MedicationReminderInput) =>
  JSON.stringify({
    durationDays: input.durationDays,
    followUpCaregiver: input.followUpCaregiver || null,
    afterMeal: input.afterMeal,
    reminderTimes: input.reminderTimes,
    startDate: input.startDate || new Date().toISOString(),
    active: input.active ?? true,
  });

const normalizeMedicationName = (name: string) => name.trim();

async function getOrCreateMedication(
  name: string,
  unit?: string | null,
): Promise<Medication> {
  const normalizedName = normalizeMedicationName(name);
  const response = await tablesDB.listRows<Medication>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_TABLE_ID,
    queries: [Query.equal("name", normalizedName), Query.limit(1)],
  });

  if (response.total > 0) {
    return response.rows[0] as unknown as Medication;
  }

  const document = await tablesDB.createRow<Medication>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_TABLE_ID,
    rowId: ID.unique(),
    data: {
      name: normalizedName,
      unit: unit?.trim() || "dose",
    },
  });

  return document as unknown as Medication;
}

export async function createElderlyMedicationWithReminder(
  userId: string,
  input: MedicationReminderInput,
): Promise<ElderlyMedication> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) {
    throw new Error("Elderly profile not found for user.");
  }

  const medication = await getOrCreateMedication(input.name, input.unit);
  const approxTimes = input.reminderTimes.filter((time) => time.trim());
  const frequency =
    input.timesPerDay <= 1
      ? "Daily"
      : `${input.timesPerDay} times/day`;

  const notesFallback = buildReminderNotesFallback(input);

  const medicationRow = await tablesDB.createRow<ElderlyMedication>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_TABLE_ID,
    rowId: ID.unique(),
    data: {
      elderly: profile.$id as unknown as Elderly[],
      medication: medication.$id as unknown as Medication[],
      dosage: input.dosage ?? 1,
      frequency,
      is_prn: false,
      times_per_day: input.timesPerDay,
      approx_times: approxTimes,
      status: ElderlyMedicationStatus.PENDING,
      last_taken: null,
      notes: ELDERLY_MEDICATION_REMINDER_TABLE_ID
        ? null
        : notesFallback,
    },
  });

  if (ELDERLY_MEDICATION_REMINDER_TABLE_ID) {
    try {
      const reminder = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
        rowId: ID.unique(),
        data: {
          elderly: profile.$id,
          elderly_medication: medicationRow.$id,
          start_date: input.startDate || new Date().toISOString(),
          duration_days: input.durationDays,
          follow_up_caregiver: input.followUpCaregiver || null,
          after_meal: input.afterMeal,
          reminder_times: approxTimes,
          active: input.active ?? true,
        },
      });

            // Auto-create Medication Logs (Pending)
            const hkOffset = 8 * 60 * 60 * 1000;
            const nowMs = Date.now();
            const startDateMs = input.startDate ? new Date(input.startDate).getTime() : nowMs;

            // Determine the HK date for the start date
            const hkStartDate = new Date(startDateMs + hkOffset);
            const startYear = hkStartDate.getUTCFullYear();
            const startMonth = hkStartDate.getUTCMonth();
            const startDay = hkStartDate.getUTCDate();

      // Iterate per time slot to ensure full duration coverage
      for (const time of approxTimes) {
          const [hours, minutes] = time.split(':').map(Number);

          // Calculate the first candidate time (Today's HK time converted to UTC timestamp)
          // 1. Treats (Year-Month-Day) from HK time, and (Hours:Minutes) from slot
          // 2. Subtract hkOffset to get the actual UTC timestamp
          const firstCandidateHkAsUtc = Date.UTC(startYear, startMonth, startDay, hours, minutes, 0);
          const firstCandidateInstance = firstCandidateHkAsUtc - hkOffset;

          // If the calculated time for "Today" is in the past, start sequence from "Tomorrow"
          let startDelayDays = 0;
          if (firstCandidateInstance <= nowMs) {
              startDelayDays = 1;
          }

          for (let d = 0; d < input.durationDays; d++) {
             // Add days in milliseconds
             const targetTime = firstCandidateInstance + ((startDelayDays + d) * 24 * 60 * 60 * 1000);
             const scheduledAt = new Date(targetTime).toISOString();
             
             await tablesDB.createRow({
                 databaseId: DATABASE_ID,
                 tableId: MEDICATION_LOGS_TABLE_ID,
                 rowId: ID.unique(),
                 data: {
                     elderly: profile.$id,
                     elderly_medication_reminder: reminder.$id,
                     scheduled_at: scheduledAt,
                     status: 'pending',
                     taken_at: null
                 }
             });
          }
      }

    } catch (error) {
      console.error("Error saving medication reminder metadata:", error);
    }
  }

  return medicationRow as unknown as ElderlyMedication;
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

export async function fetchCaregiversForElderly(
  userId: string,
): Promise<Caregiver[]> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return [];

  try {
    const response = await tablesDB.listRows<CaregiverElderly>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_ELDERLY_TABLE_ID,
      queries: [Query.equal("elderly", profile.$id)],
    });

    const caregivers: Caregiver[] = [];
    const missingCaregiverIds = new Set<string>();

    for (const row of response.rows) {
      // Handle both single object and array cases for relationship
      const caregiverOrArray = row.caregiver;
      if (Array.isArray(caregiverOrArray) && caregiverOrArray.length > 0) {
        // Expanded array
        const c = caregiverOrArray[0];
        if (typeof c === 'string') {
           missingCaregiverIds.add(c);
        } else {
           caregivers.push(c as unknown as Caregiver);
        }
      } else if (caregiverOrArray && !Array.isArray(caregiverOrArray)) {
         if (typeof caregiverOrArray === 'string') {
             missingCaregiverIds.add(caregiverOrArray);
         } else {
             caregivers.push(caregiverOrArray as unknown as Caregiver);
         }
      }
    }

    if (missingCaregiverIds.size > 0) {
        try {
            const fetchedList = await tablesDB.listRows<Caregiver>({
                databaseId: DATABASE_ID,
                tableId: CAREGIVER_TABLE_ID,
                queries: [
                    Query.equal('$id', Array.from(missingCaregiverIds))
                ]
            });
            caregivers.push(...(fetchedList.rows as unknown as Caregiver[]));
        } catch (e) {
            console.error("Failed to fetch missing caregivers", e);
        }
    }

    return caregivers;
  } catch (error) {
    console.error("Error fetching caregivers for elderly:", error);
    return [];
  }
}
