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
  let medicationSummary = "Up to date";

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
          reasons.push(`High BP: ${sys}/${dia} mmHg`);
        } else if (sys <= 90 || dia <= 60) {
          status = ElderlyStatus.WARNING;
          reasons.push(`Low BP: ${sys}/${dia} mmHg`);
        }
      }

      // Check for abnormal heart rate
      const latestHR = healthRecords.find((r) => r.type === "Heart Rate");
      if (latestHR?.numeric_value) {
        const hr = latestHR.numeric_value;
        if (hr > 100) {
          status = ElderlyStatus.WARNING;
          reasons.push(`High heart rate: ${hr} bpm`);
        } else if (hr < 50) {
          status = ElderlyStatus.WARNING;
          reasons.push(`Low heart rate: ${hr} bpm`);
        }
      }

      // Check for abnormal temperature
      const latestTemp = healthRecords.find((r) => r.type === "Temperature");
      if (latestTemp?.numeric_value) {
        const temp = latestTemp.numeric_value;
        if (temp >= 38) {
          status = ElderlyStatus.WARNING;
          reasons.push(`Fever: ${temp}°C`);
        } else if (temp <= 35) {
          status = ElderlyStatus.WARNING;
          reasons.push(`Low temperature: ${temp}°C`);
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
          reasons.push(`No check-in for ${Math.floor(diffDays)} days`);
        }
      }
    } else {
      // No health data at all
      reasons.push("No health data recorded");
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
        medicationSummary = "No schedule";
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
          const emId = rem.elderly_medication;
          const pId = typeof emId === "string" ? emId
            : emId && typeof emId === "object" && "$id" in emId ? emId.$id
            : Array.isArray(emId) && emId.length > 0
              ? (typeof emId[0] === "string" ? emId[0] : emId[0]?.$id)
              : null;
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
          reasons.push(`${missedSlots} missed medication(s) today`);
          if (pendingSlots > 0) {
            medicationSummary = `${missedSlots} missed, ${pendingSlots} pending`;
          } else {
            medicationSummary = `${missedSlots} missed`;
          }
        } else if (pendingSlots > 0) {
          medicationSummary = `${pendingSlots} pending`;
        } else if (takenSlots > 0) {
          medicationSummary = "All taken";
        } else {
          medicationSummary = "No schedule";
        }
      }
    } catch {
      // Medication query may fail if table is empty; ignore
      medicationSummary = "Unknown";
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
      const elderlySchedule = schedules.find((s) => {
        const eld = s.elderly;
        if (typeof eld === "string") return eld === elderlyId;
        if (eld && typeof eld === "object" && "$id" in eld)
          return eld.$id === elderlyId;
        return false;
      });

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
  if (!timeStr) return "Never";
  const diff = Date.now() - new Date(timeStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
