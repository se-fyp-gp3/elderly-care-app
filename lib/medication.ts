/**
 * Caregiver Medication Service Layer
 *
 * All data fetching and mutation operations for the caregiver medication management screen.
 * Keeps the component (UI) layer clean by separating business logic and API calls.
 */

import { MedicationItem } from "@/components/MedicationCard";
import { translateFrequency, translateUnit } from "@/lib/schedule";
import { Elderly, ElderlyMedication, Medication } from "@/types/appwrite";
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

  // 2a. Fetch Reminders (to link logs)
  const remindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.limit(1000)],
  });

  // Map Prescription ID -> Reminder ID
  const prescriptionToReminderMap = new Map<string, string>();
  remindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) prescriptionToReminderMap.set(prescriptionId, reminder.$id);
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
  const logRangeStart = new Date();
  logRangeStart.setDate(logRangeStart.getDate() - 1);
  logRangeStart.setHours(0, 0, 0, 0);

  const logRangeEnd = new Date();
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
        return elderlyId === elderly.$id;
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
        const times = prescription.approx_times || [];
        const reminderId = prescriptionToReminderMap.get(prescription.$id);

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

          const slots = times.map((tStr, index) => {
            const todayScheduledTime = new Date();
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
              if (now > slot.timeObj) {
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
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    rowId: logId,
    data: {
      status: "taken",
      taken_at: new Date().toISOString(),
    },
  });
}
