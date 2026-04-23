import i18n from "@/lib/i18n";
import { ElderlyStatus, EmergencyAlert, HealthData } from "@/types/appwrite";
import { Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    ELDERLY_DAILY_STEPS_TABLE_ID,
    ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
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
  /** Today's step count, null if no record */
  todaySteps: number | null;
  /** ISO timestamp of the most recent step data update */
  lastActiveTime: string | null;
  /** Whether the elderly has shown recent activity (steps > 0 today or yesterday) */
  isActive: boolean;
  /** Recent emergency alerts (active/investigating) for this elderly */
  recentAlerts: EmergencyAlert[];
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
  caregiverUserId?: string,
): Promise<ElderlyStatusInfo> {
  const reasons: string[] = [];
  let status: ElderlyStatus = ElderlyStatus.NORMAL;
  let lastCheckTime: string | null = null;
  let missedMedCount = 0;
  let nextAppointment: string | null = null;
  let medicationSummary = "Up to date";
  let todaySteps: number | null = null;
  let lastActiveTime: string | null = null;
  let isActive = false;
  let recentAlerts: EmergencyAlert[] = [];

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
        // 2b. Fetch reminders to link prescriptions -> logs (only active)
        const remindersRes = await tablesDB.listRows<any>({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
          queries: [
            Query.equal("elderly", elderlyId),
            Query.equal("active", true),
            Query.limit(200),
          ],
        });

        // Map prescription ID -> reminder object (active reminders only)
        const prescriptionToReminder = new Map<string, any>();
        remindersRes.rows.forEach((rem: any) => {
          const pId = resolveRelationId(rem.elderly_medication);
          if (pId) prescriptionToReminder.set(pId, rem);
        });

        // Fetch inactive reminders to exclude cancelled prescriptions
        const inactiveRemindersRes = await tablesDB.listRows<any>({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
          queries: [
            Query.equal("elderly", elderlyId),
            Query.equal("active", false),
            Query.limit(200),
          ],
        });
        const cancelledPrescriptionIds = new Set<string>();
        inactiveRemindersRes.rows.forEach((rem: any) => {
          const pId = resolveRelationId(rem.elderly_medication);
          if (pId) cancelledPrescriptionIds.add(pId);
        });

        // Collect all reminder IDs
        const reminderIds = Array.from(prescriptionToReminder.values()).map((r: any) => r.$id);

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

        // Filter out cancelled prescriptions (active=false) and orphaned ones without active reminder
        const activePrescriptions = prescriptions.filter(
          (p: any) => !cancelledPrescriptionIds.has(p.$id) && prescriptionToReminder.has(p.$id),
        );

        activePrescriptions.forEach((prescription: any) => {
          const reminder = prescriptionToReminder.get(prescription.$id);
          const times: string[] = reminder?.reminder_times || prescription.approx_times || [];

          // ── start_date filter ──
          const startDate = reminder?.start_date ? new Date(reminder.start_date) : null;

          // ── duration_days end boundary helpers ──
          const hkOffset = 8 * 60 * 60 * 1000;
          const durationDays = typeof reminder?.duration_days === "number" ? reminder.duration_days : null;

          times.forEach((tStr: string) => {
            const scheduled = new Date();
            let slotH = 0;
            let slotM = 0;
            if (tStr.includes("T")) {
              const d = new Date(tStr);
              slotH = d.getHours();
              slotM = d.getMinutes();
            } else if (tStr.includes(":")) {
              const parts = tStr.split(":");
              slotH = parseInt(parts[0]);
              slotM = parseInt(parts[1]);
            }
            scheduled.setHours(slotH, slotM, 0, 0);

            const scheduledUtcMs = scheduled.getTime();

            // Skip slots before medication start_date
            if (startDate && scheduledUtcMs < startDate.getTime()) return;

            // Skip slots beyond duration_days end boundary
            if (startDate && durationDays !== null && durationDays > 0) {
              const startDateHkMs = startDate.getTime() + hkOffset;
              const startDayHkMs = startDateHkMs - (startDateHkMs % 86400000);
              const firstCandidateUtcMs = startDayHkMs + slotH * 3600000 + slotM * 60000 - hkOffset;
              const startDelay = firstCandidateUtcMs <= startDate.getTime() ? 1 : 0;
              const lastValidUtcMs = firstCandidateUtcMs + (startDelay + durationDays - 1) * 86400000;
              if (scheduledUtcMs > lastValidUtcMs) return;
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
    // ── 4. Activity / liveness check (step data) ─────────────────────
    try {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const stepsRes = await tablesDB.listRows<any>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
        queries: [
          Query.equal("elderlyId", elderlyId),
          Query.orderDesc("date"),
          Query.limit(3),
        ],
      });

      const stepRecords = stepsRes.rows as any[];
      const todayRecord = stepRecords.find((r: any) => r.date === todayStr);
      const yesterdayRecord = stepRecords.find(
        (r: any) => r.date === yesterdayStr,
      );

      if (todayRecord) {
        todaySteps = todayRecord.steps ?? 0;
        lastActiveTime = todayRecord.lastUpdated ?? null;
        if (todaySteps !== null && todaySteps > 0) {
          isActive = true;
        }
      }

      if (!isActive && yesterdayRecord) {
        const ySteps = yesterdayRecord.steps ?? 0;
        if (ySteps > 0) {
          isActive = true;
          if (!lastActiveTime) {
            lastActiveTime = yesterdayRecord.lastUpdated ?? null;
          }
        }
      }

      // Flag inactivity: no steps today AND no steps yesterday
      if (!isActive && stepRecords.length > 0) {
        // Has step tracking set up but no recent movement
        if (status === ElderlyStatus.NORMAL) {
          status = ElderlyStatus.WARNING;
        }
        reasons.push(i18n.t('healthData.noActivityDetected'));
      } else if (stepRecords.length === 0) {
        // No step data at all — don't flag, tracking may not be enabled
      }
    } catch {
      // Step query may fail; ignore
    }

    // ── 5. Recent emergency alerts ──────────────────────────────────
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const alertQueries = [
        Query.equal("elderly_id", elderlyId),
        Query.greaterThan("$createdAt", oneDayAgo),
        Query.orderDesc("$createdAt"),
        Query.limit(5),
      ];

      if (caregiverUserId) {
        alertQueries.unshift(Query.equal("caregiver_user_id", caregiverUserId));
      }

      const alertsRes = await tablesDB.listRows<EmergencyAlert>({
        databaseId: DATABASE_ID,
        tableId: EMERGENCY_ALERTS_TABLE_ID,
        queries: alertQueries,
      });
      recentAlerts = alertsRes.rows;

      const activeAlerts = recentAlerts.filter(
        (a) => a.status === "active" || a.status === "investigating",
      );
      if (activeAlerts.length > 0) {
        status = ElderlyStatus.DANGER;
        reasons.push(
          i18n.t("emergency.activeAlertsCount", { count: activeAlerts.length }),
        );
      }
    } catch {
      // Alert query may fail; ignore
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
    todaySteps,
    lastActiveTime,
    isActive,
    recentAlerts,
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
