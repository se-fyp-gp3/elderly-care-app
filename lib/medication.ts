/**
 * Caregiver Medication Service Layer
 *
 * All data fetching and mutation operations for the caregiver medication management screen.
 * Keeps the component (UI) layer clean by separating business logic and API calls.
 */

import { MedicationItem } from "@/components/MedicationCard";
import { checkAndFinishReminder } from "@/lib/medication_tracking";
import { translateFrequency, translateUnit } from "@/lib/schedule";
import {
    Elderly,
    ElderlyMedication,
    ElderlyMedicationReminder,
    Medication,
} from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    MEDICATION_LOGS_TABLE_ID,
    MEDICATION_TABLE_ID,
    tablesDB,
} from "./appwrite";
import { getCaregiverByUserId, getLinkedElderly } from "./caregiver";
import { triggerProfilePush } from "./chat-push";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElderlyGroup {
  elderlyId: string;
  elderlyName: string;
  medications: MedicationItem[];
}

export interface FetchMedicationResult {
  elderlyGroups: ElderlyGroup[];
  linkedElderly: Elderly[];
}

export interface PendingCancelReminder {
  reminderId: string;
  elderlyId: string;
  elderlyName: string;
  medicationName: string;
  dosage: string;
  reminderTimes: string[];
  updatedAt: string;
}

export interface AddMedicationData {
  elderlyId: string;
  name: string;
  unit: string;
  dosage: string;
  frequency: string;
  times: Date[];
}

export interface ConfirmTakingParams {
  medItem: MedicationItem;
  elderlyId: string | undefined;
  elderlyGroups: ElderlyGroup[];
}

export interface ConfirmTakingResult {
  logId: string | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely extract ID from Appwrite relationship field */
export const getRelationshipId = (val: any): string | null => {
  if (!val) return null;
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    const item = val[0];
    if (typeof item === "string") return item;
    if (typeof item === "object" && item.$id) return item.$id;
  }
  if (typeof val === "string") return val;
  if (typeof val === "object" && val.$id) return val.$id;
  return null;
};

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Fetch all medication data for a caregiver's linked elderly.
 * Combines prescriptions, reminders, medication details, and logs into grouped data.
 */
export async function fetchCaregiverMedicationData(
  userId: string,
  targetDate?: Date,
): Promise<FetchMedicationResult> {
  // 1. Get Caregiver & Linked Elderly
  const caregiver = await getCaregiverByUserId(userId);
  if (!caregiver) {
    return { elderlyGroups: [], linkedElderly: [] };
  }

  const elderlyList = await getLinkedElderly(caregiver.$id);
  if (elderlyList.length === 0) {
    return { elderlyGroups: [], linkedElderly: elderlyList };
  }

  const elderlyIds = elderlyList.map((e) => e.$id);

  // 2. Fetch Medication Records (Prescriptions) - BASE "PLAN"
  const prescriptionsResponse = await tablesDB.listRows<ElderlyMedication>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.limit(100)],
  });

  // 2a. Fetch Reminders (to link logs) — only active ones
  const remindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.equal("active", true), Query.limit(1000)],
  });

  // Also fetch inactive reminders to know which prescriptions are cancelled
  const inactiveRemindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.equal("active", false), Query.limit(1000)],
  });
  const cancelledPrescriptionIds = new Set<string>();
  inactiveRemindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) cancelledPrescriptionIds.add(prescriptionId);
  });

  // Map Prescription ID -> Reminder (full object for start_date & reminder_times)
  const prescriptionToReminderMap = new Map<string, any>();
  remindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) prescriptionToReminderMap.set(prescriptionId, reminder);
  });

  // 3. Fetch Medication Details
  const medicationIds = new Set<string>();
  prescriptionsResponse.rows.forEach((row) => {
    const medicationId = getRelationshipId(row.medication);
    if (medicationId) medicationIds.add(medicationId);
  });

  const medicationMap = new Map<string, Medication>();
  if (medicationIds.size > 0) {
    const medicationsResponse = await tablesDB.listRows<Medication>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_TABLE_ID,
      queries: [Query.equal("$id", Array.from(medicationIds)), Query.limit(100)],
    });
    medicationsResponse.rows.forEach((m) => medicationMap.set(m.$id, m));
  }

  // 4. Fetch Logs (Expanded range to catch timezone shifts)
  const baseDate = targetDate ?? new Date();
  const logRangeStart = new Date(baseDate);
  logRangeStart.setDate(logRangeStart.getDate() - 1);
  logRangeStart.setHours(0, 0, 0, 0);

  const logRangeEnd = new Date(baseDate);
  logRangeEnd.setDate(logRangeEnd.getDate() + 1);
  logRangeEnd.setHours(23, 59, 59, 999);

  const logsResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    queries: [
      Query.equal("elderly", elderlyIds),
      Query.greaterThanEqual("scheduled_at", logRangeStart.toISOString()),
      Query.lessThanEqual("scheduled_at", logRangeEnd.toISOString()),
      Query.limit(100),
    ],
  });

  // 5. Build Grouped Data
  const groups: ElderlyGroup[] = elderlyList
    .map((elderly) => {
      const elderlyPrescriptions = prescriptionsResponse.rows.filter((row) => {
        const elderlyId = getRelationshipId(row.elderly);
        if (elderlyId !== elderly.$id) return false;
        // Exclude prescriptions whose reminders are inactive (cancelled)
        if (cancelledPrescriptionIds.has(row.$id)) return false;
        // Only include prescriptions that have an active reminder
        if (!prescriptionToReminderMap.has(row.$id)) return false;
        return true;
      });

      const dailyMeds: MedicationItem[] = [];

      elderlyPrescriptions.forEach((prescription) => {
        const medicationId = getRelationshipId(prescription.medication);
        const medication = medicationId ? medicationMap.get(medicationId) : null;
        const medicationName = medication
          ? medication.name || "Unknown Drug"
          : "Unknown Drug";
        const medicationUnit = medication ? medication.unit || "" : "";
        const dosage = `${prescription.dosage || "?"} ${translateUnit(medicationUnit)}`;
        const reminder = prescriptionToReminderMap.get(prescription.$id);
        const reminderId = reminder?.$id;
        const times: string[] = reminder?.reminder_times || prescription.approx_times || [];

        if (times.length === 0) {
          dailyMeds.push({
            id: prescription.$id,
            isPrescriptionId: true,
            elderly: elderly.name,
            name: medicationName,
            dosage: dosage,
            frequency: translateFrequency(prescription.frequency || ""),
            time: "Anytime",
            status: "pending",
            lastTaken: prescription.last_taken
              ? new Date(prescription.last_taken).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Never",
            notes: prescription.notes || "",
            reminderId: reminderId,
          });
        } else {
          const potentialLogs = reminderId
            ? logsResponse.rows.filter(
                (l: any) =>
                  getRelationshipId(l.elderly_medication_reminder) ===
                  reminderId,
              )
            : [];

          // HK timezone offset for start_date filtering
          const hkOffset = 8 * 60 * 60 * 1000;
          const hkNow = new Date(baseDate.getTime() + hkOffset);
          const todayStr = hkNow.toISOString().slice(0, 10);

          const slots = times.map((tStr, index) => {
            const todayScheduledTime = new Date(baseDate);
            if (tStr.includes("T")) {
              const d = new Date(tStr);
              todayScheduledTime.setHours(
                d.getHours(),
                d.getMinutes(),
                0,
                0,
              );
            } else if (tStr.includes(":")) {
              const parts = tStr.split(":");
              todayScheduledTime.setHours(
                parseInt(parts[0]),
                parseInt(parts[1]),
                0,
                0,
              );
            }
            return {
              timeObj: todayScheduledTime,
              tStr,
              index,
              displayTime: todayScheduledTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
            };
          });

          const matchedLogIds = new Set<string>();

          slots.forEach((slot) => {
            // Apply start_date & duration_days filter
            if (reminder?.start_date) {
              const [hours, minutes] = slot.tStr.split(":").map(Number);
              const baseDate = new Date(todayStr);
              baseDate.setUTCHours(hours, minutes, 0, 0);
              const scheduledUtcMs = baseDate.getTime() - hkOffset;
              const startDateMs = new Date(reminder.start_date).getTime();

              // Skip slots before start_date (compare by HK calendar date, not exact timestamp)
              const scheduledHkDateStr = new Date(scheduledUtcMs + hkOffset).toISOString().slice(0, 10);
              const startHkDateStr = new Date(startDateMs + hkOffset).toISOString().slice(0, 10);
              if (scheduledHkDateStr < startHkDateStr) {
                return;
              }
              // On the same calendar day, also skip slots chronologically before the exact start_date time
              if (scheduledHkDateStr === startHkDateStr && scheduledUtcMs < startDateMs) {
                return;
              }

              // Skip slots beyond duration_days
              if (reminder.duration_days) {
                const startHkDate = new Date(startDateMs + hkOffset).toISOString().slice(0, 10);
                const firstCandBase = new Date(startHkDate);
                firstCandBase.setUTCHours(hours, minutes, 0, 0);
                const firstCandUtcMs = firstCandBase.getTime() - hkOffset;
                const startDelay = firstCandUtcMs <= startDateMs ? 1 : 0;
                const lastValidUtcMs = firstCandUtcMs + (startDelay + reminder.duration_days - 1) * 86400000;
                if (scheduledUtcMs > lastValidUtcMs) {
                  return;
                }
              }
            }

            let status = "pending";
            let takenAt = null;
            let currentLogId: string | undefined = undefined;

            let bestLog: any = null;
            let maxScore = -1;

            potentialLogs.forEach((log: any) => {
              if (matchedLogIds.has(log.$id)) return;

              const logDate = new Date(log.scheduled_at);
              let score = 0;

              const logMin = logDate.getMinutes();
              const slotMin = slot.timeObj.getMinutes();
              if (Math.abs(logMin - slotMin) < 5) score += 20;
              else return;

              const logHourLocal = logDate.getHours();
              const logHourUTC = logDate.getUTCHours();
              const slotHour = slot.timeObj.getHours();

              if (logHourLocal === slotHour) score += 50;
              else if (logHourUTC === slotHour) score += 40;
              else return;

              const timeDiff = Math.abs(
                logDate.getTime() - slot.timeObj.getTime(),
              );
              const hoursDiff = timeDiff / (1000 * 60 * 60);

              if (hoursDiff < 4) score += 30;
              else if (hoursDiff < 26) score += 10;

              if (score > maxScore) {
                maxScore = score;
                bestLog = log;
              }
            });

            if (bestLog && maxScore >= 40) {
              currentLogId = bestLog.$id;
              matchedLogIds.add(bestLog.$id);

              if (bestLog.status === "taken") {
                status = "completed";
                takenAt = bestLog.taken_at;
              }
            }

            if (status === "pending") {
              const now = new Date();
              const graceMs = 10 * 60 * 1000; // 10-minute grace period
              const deadlineMs = slot.timeObj.getTime() + graceMs;
              if (now.getTime() > deadlineMs) {
                status = "missed";
              }
            }

            dailyMeds.push({
              id: `${prescription.$id}_${slot.index}`,
              realId: prescription.$id,
              isPrescriptionId: true,
              elderly: elderly.name,
              name: medicationName,
              dosage: dosage,
              frequency: translateFrequency(prescription.frequency || ""),
              time: slot.displayTime,
              status: status,
              lastTaken: takenAt
                ? new Date(takenAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : prescription.last_taken
                  ? new Date(prescription.last_taken).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Never",
              takenAtIso: takenAt || prescription.last_taken || undefined,
              notes: prescription.notes || "",
              reminderId: reminderId,
              logId: currentLogId,
            });
          });
        }
      });

      dailyMeds.sort((a, b) => a.time.localeCompare(b.time));

      return {
        elderlyId: elderly.$id,
        elderlyName: elderly.name,
        medications: dailyMeds,
      };
    })
    .filter((g) => g.medications.length > 0);

  return { elderlyGroups: groups, linkedElderly: elderlyList };
}

/**
 * Fetch all upcoming medication plans for a caregiver, starting from today.
 * Iterates day-by-day for `daysAhead` days (default 7), prefixes the time field
 * with a short date label (M/D), and merges all per-day groups into one.
 * Pending status is computed against the actual scheduled date/time.
 */
export async function fetchCaregiverUpcomingMedicationData(
  userId: string,
  daysAhead = 7,
): Promise<FetchMedicationResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const merged = new Map<string, ElderlyGroup>();
  let linkedElderlyOut: Elderly[] = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const dayResult = await fetchCaregiverMedicationData(userId, date);
    if (i === 0) linkedElderlyOut = dayResult.linkedElderly;

    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;

    dayResult.elderlyGroups.forEach((group) => {
      // Re-key per-day items so they don't collide across days
      const taggedMeds: MedicationItem[] = group.medications.map((m) => ({
        ...m,
        id: `${m.id}_d${i}`,
        time: `${dateLabel} ${m.time}`,
      }));

      const existing = merged.get(group.elderlyId);
      if (existing) {
        existing.medications.push(...taggedMeds);
      } else {
        merged.set(group.elderlyId, {
          elderlyId: group.elderlyId,
          elderlyName: group.elderlyName,
          medications: taggedMeds,
        });
      }
    });
  }

  const elderlyGroups = Array.from(merged.values()).filter(
    (g) => g.medications.length > 0,
  );

  return { elderlyGroups, linkedElderly: linkedElderlyOut };
}

export async function fetchCaregiverPendingCancelReminders(
  userId: string,
): Promise<PendingCancelReminder[]> {
  const caregiver = await getCaregiverByUserId(userId);
  if (!caregiver) return [];

  const elderlyList = await getLinkedElderly(caregiver.$id);
  if (elderlyList.length === 0) return [];

  const elderlyIds = elderlyList.map((elderly) => elderly.$id);
  const elderlyMap = new Map(elderlyList.map((elderly) => [elderly.$id, elderly]));

  const remindersResponse = await tablesDB.listRows<ElderlyMedicationReminder>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [
      Query.equal("elderly", elderlyIds),
      Query.equal("active", false),
      Query.equal("is_finished", false),
      Query.orderDesc("$updatedAt"),
      Query.limit(100),
    ],
  });

  const prescriptionIds = Array.from(
    new Set(
      remindersResponse.rows
        .map((reminder) => getRelationshipId(reminder.elderly_medication))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const prescriptionMap = new Map<string, ElderlyMedication>();
  if (prescriptionIds.length > 0) {
    const prescriptionsResponse = await tablesDB.listRows<ElderlyMedication>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_TABLE_ID,
      queries: [Query.equal("$id", prescriptionIds), Query.limit(100)],
    });
    prescriptionsResponse.rows.forEach((row) => {
      prescriptionMap.set(row.$id, row);
    });
  }

  const medicationIds = Array.from(
    new Set(
      Array.from(prescriptionMap.values())
        .map((prescription) => getRelationshipId(prescription.medication))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const medicationMap = new Map<string, Medication>();
  if (medicationIds.length > 0) {
    const medicationsResponse = await tablesDB.listRows<Medication>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_TABLE_ID,
      queries: [Query.equal("$id", medicationIds), Query.limit(100)],
    });
    medicationsResponse.rows.forEach((row) => {
      medicationMap.set(row.$id, row);
    });
  }

  return remindersResponse.rows.map((reminder) => {
    const elderlyId = getRelationshipId(reminder.elderly) || "";
    const elderlyName =
      elderlyMap.get(elderlyId)?.name ||
      (typeof reminder.elderly === "object" && reminder.elderly?.name) ||
      "Unknown elderly";

    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    const prescription = prescriptionId ? prescriptionMap.get(prescriptionId) : null;
    const medicationId = prescription ? getRelationshipId(prescription.medication) : null;
    const medication = medicationId ? medicationMap.get(medicationId) : null;

    const medicationName =
      medication?.name ||
      (typeof prescription?.medication === "object" && prescription.medication?.name) ||
      "Unknown medication";

    const dosageValue = prescription?.dosage;
    const dosageUnit = medication?.unit ||
      (typeof prescription?.medication === "object" && prescription.medication?.unit) ||
      "";
    const dosage = dosageValue ? `${dosageValue} ${dosageUnit}`.trim() : "";

    return {
      reminderId: reminder.$id,
      elderlyId,
      elderlyName,
      medicationName,
      dosage,
      reminderTimes: reminder.reminder_times || [],
      updatedAt: reminder.$updatedAt,
    };
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Add a new medication plan (prescription + reminder) for an elderly.
 */
export async function addMedication(data: AddMedicationData): Promise<void> {
  // 1. Get or Create Medication record
  let medicationId = "";
  const existingMedResult = await tablesDB.listRows<Medication>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_TABLE_ID,
    queries: [Query.equal("name", data.name)],
  });

  if (existingMedResult.total > 0) {
    medicationId = existingMedResult.rows[0].$id;
  } else {
    const newMed = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_TABLE_ID,
      rowId: ID.unique(),
      data: {
        name: data.name,
        unit: data.unit,
      },
    });
    medicationId = newMed.$id;
  }

  // 2. Create ElderlyMedication (The Plan)
  const approxTimes = data.times.map((t) =>
    t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  );

  const prescriptionRow = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_TABLE_ID,
    rowId: ID.unique(),
    data: {
      elderly: data.elderlyId,
      medication: medicationId,
      dosage: parseFloat(data.dosage) || 1,
      frequency: data.frequency,
      is_prn: false,
      approx_times: approxTimes,
      status: "Pending",
      notes: "",
    },
  });

  // 3. Create Reminder
  const reminderStartDate = new Date();
  const reminderEndDate = new Date(
    reminderStartDate.getTime() + 365 * 24 * 60 * 60 * 1000,
  );

  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    rowId: ID.unique(),
    data: {
      elderly: data.elderlyId,
      elderly_medication: prescriptionRow.$id,
      start_date: reminderStartDate.toISOString(),
      duration_days: 365,
      active: true,
      reminder_times: approxTimes,
      is_finished: false,
      after_meal: false,
      end_date: reminderEndDate.toISOString(),
    },
  });

  notifyElderlyMedicationAction(
    {
      elderlyProfileId: data.elderlyId,
      action: "added",
      medicationName: data.name,
      reminderTimes: approxTimes,
    },
  );
}

type MedicationActionKind = "added" | "taken" | "updated";

function notifyElderlyMedicationAction(
  params: {
    elderlyProfileId: string | null | undefined;
    action: MedicationActionKind;
    medicationName?: string | null;
    reminderTimes?: string[];
  },
): void {
  const { elderlyProfileId, action, medicationName, reminderTimes } = params;
  if (!elderlyProfileId) return;

  const trimmedMedicationName = medicationName?.trim() || null;
  const times = reminderTimes?.filter(Boolean) || [];

  let title = "Medication updated";
  let body = "A medication entry was updated.";

  if (action === "added") {
    title = "Medication added";
    body = trimmedMedicationName
      ? `${trimmedMedicationName} was added${times.length > 0 ? ` with reminders at ${times.join(", ")}` : ""}`
      : "A medication was added.";
  } else if (action === "taken") {
    title = "Medication taken";
    body = trimmedMedicationName
      ? `${trimmedMedicationName} was marked as taken`
      : "A medication was marked as taken.";
  }

  triggerProfilePush({
    mode: "profiles",
    recipientProfileIds: [elderlyProfileId],
    title,
    body,
    data: {
      type: "medication_action",
      screen: "medication",
      action,
      medicationName: trimmedMedicationName,
      reminderTimes: times,
    },
  });
}

/**
 * Auto-recover a missing reminder for a prescription.
 * Returns the recovered or newly created reminder ID, or null if recovery fails.
 */
async function recoverReminder(
  prescriptionId: string,
  elderlyId: string,
): Promise<string | null> {
  try {
    const reminderSearchResult = await tablesDB.listRows<any>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
      queries: [Query.equal("elderly_medication", prescriptionId)],
    });

    if (reminderSearchResult.rows.length > 0) {
      return reminderSearchResult.rows[0].$id;
    }

    // Must fetch the original medication plan to create a new reminder
    const prescriptionSearchResult = await tablesDB.listRows<any>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_TABLE_ID,
      queries: [Query.equal("$id", prescriptionId)],
    });

    if (prescriptionSearchResult.rows.length > 0) {
      const plan = prescriptionSearchResult.rows[0];
      const newReminder = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
        rowId: ID.unique(),
        data: {
          elderly: elderlyId,
          elderly_medication: prescriptionId,
          start_date: new Date().toISOString(),
          duration_days: 365,
          active: true,
          reminder_times: plan.approx_times || [],
          is_finished: false,
          after_meal: false,
          end_date: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
      return newReminder.$id;
    }

    return null;
  } catch (recoveryError) {
    console.warn("Auto-recovery failed", recoveryError);
    return null;
  }
}

/**
 * Confirm that a medication was taken.
 * Handles both prescription-based items and direct log items.
 * Returns the log ID for local state updates.
 */
export async function confirmMedicationTaking(
  params: ConfirmTakingParams,
): Promise<ConfirmTakingResult> {
  const { medItem, elderlyId } = params;
  const item = medItem as any;

  if (item.isPrescriptionId) {
    let resultLogId = item.logId;
    let resolvedReminderId = item.reminderId;

    // Auto-Recover missing reminder link
    if (!resolvedReminderId && elderlyId && item.isPrescriptionId) {
      resolvedReminderId = await recoverReminder(
        item.realId,
        elderlyId,
      );
    }

    if (resolvedReminderId && elderlyId) {
      const now = new Date();

      if (item.logId) {
        // UPDATE existing log
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_LOGS_TABLE_ID,
          rowId: item.logId,
          data: {
            status: "taken",
            taken_at: now.toISOString(),
          },
        });
      } else {
        // Create NEW log
        const scheduledDate = new Date();
        if (item.time !== "Anytime") {
          const [hours, minutes] = item.time.split(":");
          scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        }

        const newLog = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_LOGS_TABLE_ID,
          rowId: ID.unique(),
          data: {
            status: "taken",
            taken_at: now.toISOString(),
            scheduled_at: scheduledDate.toISOString(),
            elderly: elderlyId,
            elderly_medication_reminder: resolvedReminderId,
          },
        });
        resultLogId = newLog.$id;
      }
    } else if (item.isPrescriptionId && !resolvedReminderId) {
      throw new Error(
        `Record is missing a linked reminder and auto-repair failed for prescription ${item.realId}.`,
      );
    }

    // Update Prescription Last Taken
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_TABLE_ID,
      rowId: item.realId,
      data: {
        last_taken: new Date().toISOString(),
      },
    });

    // Check if all logs for this reminder are now taken → auto-finish reminder
    if (resolvedReminderId) {
      await checkAndFinishReminder(resolvedReminderId);
    }

    notifyElderlyMedicationAction(
      {
        elderlyProfileId: elderlyId,
        action: "taken",
        medicationName: medItem.name,
      },
    );

    return { logId: resultLogId };
  } else {
    // It's an existing Log - update directly
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: medItem.id,
      data: {
        status: "taken",
        taken_at: new Date().toISOString(),
      },
    });

    notifyElderlyMedicationAction(
      {
        elderlyProfileId: elderlyId,
        action: "taken",
        medicationName: medItem.name,
      },
    );

    return { logId: undefined };
  }
}

/**
 * Undo a medication taking action by reverting the log status to pending.
 */
export async function undoMedicationTaking(logId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    rowId: logId,
    data: {
      status: "pending",
      taken_at: null,
    },
  });
}

/**
 * Mark a medication log entry as taken/processed.
 */
export async function markMedicationProcessed(logId: string): Promise<void> {
  const logRow = await tablesDB.getRow<any>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    rowId: logId,
  });

  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    rowId: logId,
    data: {
      status: "taken",
      taken_at: new Date().toISOString(),
    },
  });

  const elderlyRelation = logRow?.elderly;
  const elderlyProfileId =
    typeof elderlyRelation === "string"
      ? elderlyRelation
      : elderlyRelation?.$id;

  notifyElderlyMedicationAction(
    {
      elderlyProfileId,
      action: "updated",
    },
  );
}
