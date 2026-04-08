import i18n from "@/lib/i18n";
import { ElderlyStatus, HealthData } from "@/types/appwrite";
import { Query } from "react-native-appwrite";
import {
  DATABASE_ID,
  ELDERLY_MEDICATION_REMINDER_TABLE_ID,
  ELDERLY_MEDICATION_TABLE_ID,
  HEALTH_DATA_TABLE_ID,
  MEDICATION_LOGS_TABLE_ID,
  SCHEDULE_TABLE_ID,
  tablesDB,
} from "./appwrite";

export interface ElderlyStatusInfo {
  status: ElderlyStatus;
  reasons: string[];
  lastCheckTime: string | null;
  missedMedCount: number;
  nextAppointment: string | null;
  medicationSummary: string;
}

/**
 * Resolve an Appwrite relationship field to its document ID string.
 * Appwrite relations can be returned as a string ID, an object with `$id`,
 * or an array of either — this helper normalises all those shapes.
 */
function resolveRelationId(field: unknown): string | null {
  if (typeof field === "string") return field;
  if (field && typeof field === "object" && "$id" in field)
    return (field as { $id: string }).$id;
  if (Array.isArray(field) && field.length > 0) {
    const first = field[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "$id" in first)
      return (first as { $id: string }).$id;
  }
  return null;
}

/**
 * Compute a comprehensive status for an elderly person based on real data:
 *  - Health data abnormalities (BP, heart rate)
 *  - Missed medications in the last 24 hours
 *  - How recently health data was recorded
 *  - Upcoming schedule / appointments
 */
export async function computeElderlyStatus(
  elderlyId: string,
): Promise<ElderlyStatusInfo> {
  const reasons: string[] = [];
  let status: ElderlyStatus = ElderlyStatus.NORMAL;
  let lastCheckTime: string | null = null;
  let missedMedCount = 0;
  let nextAppointment: string | null = null;
  let medicationSummary = i18n.t('medication.upToDate');

  try {
    // ── 1. Latest health data ───────────────────────────────────────────
    const healthRes = await tablesDB.listRows<HealthData>({
      databaseId: DATABASE_ID,
      tableId: HEALTH_DATA_TABLE_ID,
      queries: [
        Query.equal("elderly_id", elderlyId),
        Query.orderDesc("time"),
        Query.limit(10),
      ],
    });

    const healthRecords = healthRes.rows as unknown as HealthData[];

    if (healthRecords.length > 0) {
      lastCheckTime = healthRecords[0].time;

      // Check for abnormal BP
      const latestBP = healthRecords.find((r) => r.type === "Blood Pressure");
      if (latestBP?.numeric_value) {
        const sys = latestBP.numeric_value;
        const dia = latestBP.second_value ?? 0;
        if (sys >= 140 || dia >= 90) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.highBP', { sys, dia }));
        } else if (sys <= 90 || dia <= 60) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.lowBP', { sys, dia }));
        }
      }

      // Check for abnormal heart rate
      const latestHR = healthRecords.find((r) => r.type === "Heart Rate");
      if (latestHR?.numeric_value) {
        const hr = latestHR.numeric_value;
        if (hr > 100) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.highHeartRate', { hr }));
        } else if (hr < 50) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.lowHeartRate', { hr }));
        }
      }

      // Check for abnormal temperature
      const latestTemp = healthRecords.find((r) => r.type === "Temperature");
      if (latestTemp?.numeric_value) {
        const temp = latestTemp.numeric_value;
        if (temp >= 38) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.fever', { temp }));
        } else if (temp <= 35) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('healthData.lowTemperature', { temp }));
        }
      }

      // Check if last check was more than 3 days ago
      if (lastCheckTime) {
        const last = new Date(lastCheckTime);
        const diffMs = Date.now() - last.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 3) {
          if (status === ElderlyStatus.NORMAL) {
            status = ElderlyStatus.WARNING;
          }
          reasons.push(i18n.t('healthData.noCheckIn', { days: Math.floor(diffDays) }));
        }
      }
    } else {
      // No health data at all
      reasons.push(i18n.t('healthData.noHealthDataRecorded'));
    }

    // ── 2. Medication status (based on prescription plans + logs) ──────
    try {
      // 2a. Fetch prescriptions for this elderly
      const prescriptionsRes = await tablesDB.listRows<any>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_TABLE_ID,
        queries: [
          Query.equal("elderly", elderlyId),
          Query.limit(100),
        ],
      });

      const prescriptions = prescriptionsRes.rows;

      if (prescriptions.length === 0) {
        medicationSummary = i18n.t('medication.noSchedule');
      } else {
        // 2b. Fetch reminders to link prescriptions -> logs
        const remindersRes = await tablesDB.listRows<any>({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
          queries: [
            Query.equal("elderly", elderlyId),
            Query.limit(200),
          ],
        });

        // Map prescription ID -> reminder ID
        const prescriptionToReminder = new Map<string, string>();
        remindersRes.rows.forEach((rem: any) => {
          const pId = resolveRelationId(rem.elderly_medication);
          if (pId) prescriptionToReminder.set(pId, rem.$id);
        });

        // Collect all reminder IDs
        const reminderIds = Array.from(prescriptionToReminder.values());

        // 2c. Fetch today's logs for these reminders
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        let takenLogScheduledTimes: Date[] = [];
        if (reminderIds.length > 0) {
          const logsRes = await tablesDB.listRows<any>({
            databaseId: DATABASE_ID,
            tableId: MEDICATION_LOGS_TABLE_ID,
            queries: [
              Query.equal("elderly", elderlyId),
              Query.greaterThanEqual("scheduled_at", todayStart.toISOString()),
              Query.lessThanEqual("scheduled_at", todayEnd.toISOString()),
              Query.limit(200),
            ],
          });

          // Collect scheduled times of taken logs
          takenLogScheduledTimes = logsRes.rows
            .filter((l: any) => (l.status || "").toLowerCase() === "taken")
            .map((l: any) => new Date(l.scheduled_at));
        }

        // 2d. Count total scheduled slots today, and which are taken/missed/pending
        const now = new Date();
        let totalSlots = 0;
        let takenSlots = 0;
        let missedSlots = 0;
        let pendingSlots = 0;

        prescriptions.forEach((prescription: any) => {
          const times: string[] = prescription.approx_times || [];
          times.forEach((tStr: string) => {
            const scheduled = new Date();
            if (tStr.includes("T")) {
              const d = new Date(tStr);
              scheduled.setHours(d.getHours(), d.getMinutes(), 0, 0);
            } else if (tStr.includes(":")) {
              const parts = tStr.split(":");
              scheduled.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
            }

            totalSlots++;

            // Check if there's a matching taken log (within 5 min of scheduled time)
            const isTaken = takenLogScheduledTimes.some((logTime) => {
              return Math.abs(logTime.getHours() - scheduled.getHours()) === 0
                && Math.abs(logTime.getMinutes() - scheduled.getMinutes()) < 5;
            });

            if (isTaken) {
              takenSlots++;
            } else if (scheduled < now) {
              missedSlots++;
            } else {
              pendingSlots++;
            }
          });
        });

        missedMedCount = missedSlots;

        if (missedSlots > 0) {
          status = ElderlyStatus.WARNING;
          reasons.push(i18n.t('medication.missedMedToday', { count: missedSlots }));
          if (pendingSlots > 0) {
            medicationSummary = i18n.t('medication.missedAndPending', { missed: missedSlots, pending: pendingSlots });
          } else {
            medicationSummary = i18n.t('medication.xMissed', { count: missedSlots });
          }
        } else if (pendingSlots > 0) {
          medicationSummary = i18n.t('medication.xPending', { count: pendingSlots });
        } else if (takenSlots > 0) {
          medicationSummary = i18n.t('medication.allTakenText');
        } else {
          medicationSummary = i18n.t('medication.noSchedule');
        }
      }
    } catch {
      // Medication query may fail if table is empty; ignore
      medicationSummary = i18n.t('medication.unknownMedStatus');
    }

    // ── 3. Next appointment / schedule ──────────────────────────────────
    try {
      const now = new Date().toISOString();
      const scheduleRes = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: SCHEDULE_TABLE_ID,
        queries: [
          Query.greaterThanEqual("time", now),
          Query.orderAsc("time"),
          Query.limit(20),
        ],
      });

      // Filter client-side for this elderly
      const schedules = scheduleRes.rows as any[];
      const elderlySchedule = schedules.find((s) =>
        resolveRelationId(s.elderly) === elderlyId,
      );

      if (elderlySchedule?.time) {
        const d = new Date(elderlySchedule.time);
        nextAppointment = d.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      // Schedule query may fail; ignore
    }
  } catch (err) {
    console.error("Error computing elderly status:", err);
  }

  return {
    status,
    reasons,
    lastCheckTime,
    missedMedCount,
    nextAppointment,
    medicationSummary,
  };
}

/**
 * Format a lastCheckTime into a human-readable relative string.
 */
export function formatLastCheck(timeStr: string | null): string {
  if (!timeStr) return i18n.t('common.never');
  const diff = Date.now() - new Date(timeStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return i18n.t('common.justNow');
  if (minutes < 60) return i18n.t('common.minutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('common.hoursAgo', { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return i18n.t('common.yesterday');
  return i18n.t('common.daysAgo', { days });
}
