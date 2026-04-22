import i18n from "@/lib/i18n";
import { emitCaregiverActivityAlerts } from "./caregiver-activity-alerts";
import {
    ElderlyMedication,
    Medication,
    Schedule,
    ScheduleCategory,
    ScheduleStatus,
} from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    MEDICATION_LOGS_TABLE_ID,
    MEDICATION_TABLE_ID,
    SCHEDULE_CATEGORY_TABLE_ID,
    SCHEDULE_TABLE_ID,
    tablesDB,
} from "./appwrite";
  import { sendImmediateNotification } from "./notifications";

/** Translate a medication unit string (e.g. "tablet" → "片") using i18n. */
export function translateUnit(unit: string): string {
  if (!unit) return "";
  const map: Record<string, string> = {
    tablet: i18n.t('medication.unitTablet'),
    capsule: i18n.t('medication.unitCapsule'),
    pill: i18n.t('medication.unitPill'),
    drop: i18n.t('medication.unitDrop'),
    ml: i18n.t('medication.unitMl'),
    piece: i18n.t('medication.unitPiece'),
    dose: i18n.t('medication.unitDose'),
  };
  return map[unit.toLowerCase()] || unit;
}

/** Translate a frequency string stored in DB (e.g. "Daily" → "每日"). */
export function translateFrequency(freq: string): string {
  if (!freq) return "";
  if (freq === "Daily") return i18n.t('medication.daily');
  if (freq === "Weekly") return i18n.t('medication.weekly');
  const m = freq.match(/^(\d+)\s*times?\/day$/i);
  if (m) return i18n.t('medication.timesDaily', { times: m[1] });
  return freq;
}

/**
 * A unified event item shown on the schedule timeline,
 * covering both generic schedule entries and medication slots.
 */
export type ScheduleEvent = {
  id: string;
  /** Formatted display time, e.g. "08:30" */
  time: string;
  title: string;
  description: string;
  type: string;
  status: ScheduleStatus;
  elderlyName: string;
  elderlyId: string;
  /** ISO string used for chronological sorting */
  rawDate: string;
  medicationData?: {
    /** ID of the ElderlyMedication (prescription) row */
    realId: string;
    /** ID of the MedicationLog row if one already exists */
    logId?: string;
    /** ID of the ElderlyMedicationReminder row */
    reminderId?: string;
    name: string;
    /** Original approx_times entry for this slot */
    time: string;
  };
};

/**
 * Resolves an Appwrite relationship field to its document ID.
 * Handles both expanded objects ({ $id: "..." }) and plain ID strings.
 */
export function getRelationshipId(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null && "$id" in val)
    return (val as { $id: string }).$id;
  return null;
}

// ── Category ──────────────────────────────────────────────────────────────────

/**
 * Fetch all schedule categories from the database.
 */
export async function fetchScheduleCategories(): Promise<ScheduleCategory[]> {
  const response = await tablesDB.listRows<ScheduleCategory>({
    databaseId: DATABASE_ID,
    tableId: SCHEDULE_CATEGORY_TABLE_ID,
  });
  return response.rows;
}

// ── Schedule Events ───────────────────────────────────────────────────────────

/**
 * Fetch generic (non-medication) schedule events for a given day.
 * Automatically marks overdue PENDING tasks as MISSED in the database.
 */
export async function fetchDayScheduleEvents(
  elderlyIds: string[],
  date: Date,
  categories: ScheduleCategory[],
  elderlyMap: Map<string, string>,
): Promise<ScheduleEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await tablesDB.listRows<Schedule>({
    databaseId: DATABASE_ID,
    tableId: SCHEDULE_TABLE_ID,
    queries: [
      Query.greaterThanEqual("time", startOfDay.toISOString()),
      Query.lessThanEqual("time", endOfDay.toISOString()),
      Query.equal("elderly", elderlyIds),
      Query.limit(100),
      Query.orderAsc("time"),
    ],
  });

  return response.rows.map((row) => {
    // Resolve elderly reference ──────────────────────────────────────────────
    let elderlyName = "Unknown";
    let elderlyId = "";
    const elderlyReference: unknown = Array.isArray(row.elderly)
      ? row.elderly.length > 0
        ? row.elderly[0]
        : null
      : row.elderly;

    if (elderlyReference) {
      if (
        typeof elderlyReference === "object" &&
        elderlyReference !== null &&
        "$id" in elderlyReference
      ) {
        elderlyName = (elderlyReference as any).name || "Unknown";
        elderlyId = (elderlyReference as any).$id;
      } else if (typeof elderlyReference === "string") {
        elderlyId = elderlyReference;
        elderlyName = elderlyMap.get(elderlyId) ?? "Unknown";
      }
    }

    // Resolve category reference ─────────────────────────────────────────────
    let categoryName = "activity";
    const categoryReference: unknown = Array.isArray(row.scheduleCategory)
      ? row.scheduleCategory.length > 0
        ? row.scheduleCategory[0]
        : null
      : row.scheduleCategory;

    if (categoryReference) {
      if (
        typeof categoryReference === "object" &&
        categoryReference !== null &&
        "name" in categoryReference
      ) {
        categoryName =
          (categoryReference as any).name?.toLowerCase() || "activity";
      } else if (typeof categoryReference === "string") {
        const matchedCategory = categories.find(
          (c) => c.$id === categoryReference,
        );
        if (matchedCategory?.name) {
          categoryName = matchedCategory.name.toLowerCase();
        }
      }
    }

    // Auto-mark overdue PENDING tasks as MISSED ──────────────────────────────
    let displayStatus = row.status || ScheduleStatus.PENDING;
    if (displayStatus === ScheduleStatus.PENDING && row.time) {
      const taskTime = new Date(row.time);
      if (taskTime < new Date()) {
        displayStatus = ScheduleStatus.MISSED;
        tablesDB
          .updateRow({
            databaseId: DATABASE_ID,
            tableId: SCHEDULE_TABLE_ID,
            rowId: row.$id,
            data: { status: ScheduleStatus.MISSED },
          })
          .catch((error) => {
            console.error(
              "Failed to auto-mark overdue schedule item as MISSED",
              {
                scheduleId: row.$id,
                originalStatus: row.status,
                targetStatus: ScheduleStatus.MISSED,
                error,
              },
            );
          });
      }
    }

    return {
      id: row.$id,
      time: row.time
        ? new Date(row.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "--:--",
      title: row.title || "",
      description: row.description || "",
      type: categoryName,
      status: displayStatus,
      elderlyName,
      elderlyId,
      rawDate: row.time || "",
    };
  });
}

// ── Medication Events ─────────────────────────────────────────────────────────

/**
 * Build ScheduleEvent items for every medication slot on the given day
 * by cross-referencing prescriptions, reminders, and existing logs.
 */
export async function fetchDayMedicationEvents(
  elderlyIds: string[],
  date: Date,
  elderlyMap: Map<string, string>,
): Promise<ScheduleEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Prescriptions (ElderlyMedication rows) ─────────────────────────────────
  const elderlyMedicationResponse = await tablesDB.listRows<ElderlyMedication>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.limit(100)],
  });

  // 2. Reminders keyed by prescription ID — only active ones ──────────────────
  const medicationRemindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.equal("active", true), Query.limit(100)],
  });
  const prescriptionToReminderMap = new Map<string, any>();
  medicationRemindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) prescriptionToReminderMap.set(prescriptionId, reminder);
  });

  // Also fetch inactive to exclude cancelled prescriptions
  const inactiveRemindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.equal("active", false), Query.limit(100)],
  });
  const cancelledPrescriptionIds = new Set<string>();
  inactiveRemindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) cancelledPrescriptionIds.add(prescriptionId);
  });

  // 3. Medication details keyed by medication ID ───────────────────────────────
  const medicationIds = new Set<string>();
  elderlyMedicationResponse.rows.forEach((row) => {
    const medicationId = getRelationshipId(row.medication);
    if (medicationId) medicationIds.add(medicationId);
  });

  const medicationById = new Map<string, Medication>();
  if (medicationIds.size > 0) {
    const medicationsResponse = await tablesDB.listRows<Medication>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_TABLE_ID,
      queries: [Query.equal("$id", Array.from(medicationIds))],
    });
    medicationsResponse.rows.forEach((medication) =>
      medicationById.set(medication.$id, medication),
    );
  }

  // 4. Logs for the day (±1 day buffer to handle UTC offsets) ─────────────────
  const logWindowStart = new Date(startOfDay);
  logWindowStart.setDate(logWindowStart.getDate() - 1);
  const logWindowEnd = new Date(endOfDay);
  logWindowEnd.setDate(logWindowEnd.getDate() + 1);

  const medicationLogsResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    queries: [
      Query.equal("elderly", elderlyIds),
      Query.greaterThanEqual("scheduled_at", logWindowStart.toISOString()),
      Query.lessThanEqual("scheduled_at", logWindowEnd.toISOString()),
      Query.limit(100),
    ],
  });

  // 5. Build one ScheduleEvent per prescription × approx_time slot ─────────────
  const medicationEvents: ScheduleEvent[] = [];

  elderlyMedicationResponse.rows.forEach((prescription) => {
    const elderlyId = getRelationshipId(prescription.elderly);
    if (!elderlyId) return;
    // Skip cancelled prescriptions
    if (cancelledPrescriptionIds.has(prescription.$id)) return;
    // Only include prescriptions that have an active reminder
    if (!prescriptionToReminderMap.has(prescription.$id)) return;
    const elderlyName = elderlyMap.get(elderlyId) || "Unknown";

    const medicationId = getRelationshipId(prescription.medication);
    const medicationInfo = medicationId ? medicationById.get(medicationId) : null;
    const medicationName = medicationInfo?.name || "Unknown Drug";
    const rawUnit = medicationInfo?.unit || "";
    const unitMap: Record<string, string> = {
      tablet: i18n.t('medication.unitTablet'),
      capsule: i18n.t('medication.unitCapsule'),
      pill: i18n.t('medication.unitPill'),
      drop: i18n.t('medication.unitDrop'),
      ml: i18n.t('medication.unitMl'),
      piece: i18n.t('medication.unitPiece'),
      dose: i18n.t('medication.unitDose'),
    };
    const translatedUnit = unitMap[rawUnit.toLowerCase()] || rawUnit;
    const dosage = `${prescription.dosage || ""} ${translatedUnit}`;

    const reminder = prescriptionToReminderMap.get(prescription.$id);
    const reminderId = reminder?.$id;
    const approxTimes = reminder?.reminder_times || prescription.approx_times || [];

    // Filter logs that belong to this reminder
    const candidateLogs = reminderId
      ? medicationLogsResponse.rows.filter(
          (log) =>
            getRelationshipId(log.elderly_medication_reminder) === reminderId,
        )
      : [];

    // HK timezone offset for start_date filtering
    const hkOffset = 8 * 60 * 60 * 1000;
    const hkDate = new Date(date.getTime() + hkOffset);
    const dayStr = hkDate.toISOString().slice(0, 10);

    approxTimes.forEach((approxTimeStr: string, slotIndex: number) => {
      // Apply start_date & duration_days filter
      if (reminder?.start_date) {
        const [h, m] = approxTimeStr.includes(":")
          ? approxTimeStr.split(":").map(Number)
          : [0, 0];
        const baseDate = new Date(dayStr);
        baseDate.setUTCHours(h, m, 0, 0);
        const scheduledUtcMs = baseDate.getTime() - hkOffset;
        const startDateMs = new Date(reminder.start_date).getTime();

        // Skip slots before start_date
        if (scheduledUtcMs < startDateMs) {
          return;
        }

        // Skip slots beyond duration_days
        if (reminder.duration_days) {
          const startHkDate = new Date(startDateMs + hkOffset).toISOString().slice(0, 10);
          const firstCandBase = new Date(startHkDate);
          firstCandBase.setUTCHours(h, m, 0, 0);
          const firstCandUtcMs = firstCandBase.getTime() - hkOffset;
          const startDelay = firstCandUtcMs <= startDateMs ? 1 : 0;
          const lastValidUtcMs = firstCandUtcMs + (startDelay + reminder.duration_days - 1) * 86400000;
          if (scheduledUtcMs > lastValidUtcMs) {
            return;
          }
        }
      }

      // Parse the approx time into a full Date for this day ──────────────────
      const slotDate = new Date(date);
      if (approxTimeStr.includes("T")) {
        const parsedTime = new Date(approxTimeStr);
        slotDate.setHours(parsedTime.getHours(), parsedTime.getMinutes(), 0, 0);
      } else if (approxTimeStr.includes(":")) {
        const timeParts = approxTimeStr.split(":");
        slotDate.setHours(
          parseInt(timeParts[0]),
          parseInt(timeParts[1]),
          0,
          0,
        );
      }

      // Match the best candidate log using a scoring approach ─────────────────
      let status = ScheduleStatus.PENDING;
      let logId: string | undefined = undefined;
      let bestLog: any = null;
      let maxScore = -1;

      candidateLogs.forEach((log) => {
        const logDate = new Date(log.scheduled_at);
        let score = 0;

        // Reject logs from other days (> 13 h apart prevents day-jumping)
        const diffHours =
          Math.abs(logDate.getTime() - slotDate.getTime()) / 36e5;
        if (diffHours >= 13) return;

        // Minute proximity (must be within 5 min)
        if (Math.abs(logDate.getMinutes() - slotDate.getMinutes()) < 5)
          score += 20;
        else return;

        // Hour match — accept both local and UTC-shifted logs
        const logLocalHour = logDate.getHours();
        const logUTCHour = logDate.getUTCHours();
        const slotLocalHour = slotDate.getHours();

        if (logLocalHour === slotLocalHour) score += 50;
        else if (logUTCHour === slotLocalHour) score += 40; // UTC-shifted match
        else return;

        // Proximity bonus
        score += diffHours < 4 ? 30 : 10;

        if (score > maxScore) {
          maxScore = score;
          bestLog = log;
        }
      });

      if (bestLog && maxScore >= 40) {
        logId = bestLog.$id;
        if (bestLog.status === "taken") {
          status = ScheduleStatus.COMPLETED;
        }
      }

      // Auto-mark as MISSED if slot time has passed
      if (status === ScheduleStatus.PENDING && new Date() > slotDate) {
        status = ScheduleStatus.MISSED;
      }

      medicationEvents.push({
        id: `${prescription.$id}_${slotIndex}`,
        time: slotDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        title: medicationName,
        description: dosage,
        type: "medication",
        status,
        elderlyName,
        elderlyId,
        rawDate: slotDate.toISOString(),
        medicationData: {
          realId: prescription.$id,
          logId,
          reminderId,
          name: medicationName,
          time: approxTimeStr,
        },
      });
    });
  });

  return medicationEvents;
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Mark a generic schedule task as completed.
 */
export async function markScheduleTaskCompleted(taskId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: SCHEDULE_TABLE_ID,
    rowId: taskId,
    data: { status: ScheduleStatus.COMPLETED },
  });
}

/**
 * Undo a completed schedule task back to pending.
 */
export async function undoScheduleTaskCompleted(taskId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: SCHEDULE_TABLE_ID,
    rowId: taskId,
    data: { status: ScheduleStatus.PENDING },
  });
}

/**
 * Auto-recover a missing reminder link for a prescription.
 * First searches for an existing reminder; if none found, creates a new one.
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

    // Fetch the original prescription to create a new reminder
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
        },
      });
      return newReminder.$id;
    }

    return null;
  } catch (recoveryError) {
    console.warn("Auto-recovery of reminder failed", recoveryError);
    return null;
  }
}

/**
 * Record a medication as taken for the given slot.
 * Creates a new log if none exists yet, or updates the existing one.
 * Auto-recovers a missing reminderId if needed.
 * Returns the (potentially new) log ID.
 */
export async function recordMedicationTaken(params: {
  reminderId?: string;
  logId?: string;
  elderlyId: string;
  /** Pre-computed ISO string for scheduled_at (matches the slot time shown on the timeline) */
  scheduledAt: string;
  prescriptionId: string;
}): Promise<string | undefined> {
  const { logId, elderlyId, scheduledAt, prescriptionId } =
    params;
  let resolvedReminderId = params.reminderId;
  const now = new Date();
  let activeLogId = logId;

  // Auto-recover missing reminder link
  if (!resolvedReminderId && elderlyId && prescriptionId) {
    resolvedReminderId = (await recoverReminder(prescriptionId, elderlyId)) ?? undefined;
  }

  if (!resolvedReminderId) {
    throw new Error(
      `Missing reminder link for prescription ${prescriptionId} and auto-recovery failed.`,
    );
  }

  if (logId) {
    // Update existing log ────────────────────────────────────────────────────
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: logId,
      data: { status: "taken", taken_at: now.toISOString() },
    });
  } else {
    // Create new log ─────────────────────────────────────────────────────────
    const newLog = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        status: "taken",
        taken_at: now.toISOString(),
        scheduled_at: scheduledAt,
        elderly: elderlyId,
        elderly_medication_reminder: resolvedReminderId,
      },
    });
    activeLogId = newLog.$id;
  }

  // Keep prescription's last_taken in sync
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_TABLE_ID,
    rowId: prescriptionId,
    data: { last_taken: now.toISOString() },
  });

  return activeLogId;
}

/**
 * Revert a medication log back to pending (undo "Take").
 */
export async function undoMedicationTaken(logId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    rowId: logId,
    data: { status: "pending", taken_at: null },
  });
}

/**
 * Mark all overdue PENDING schedule items as MISSED in-place.
 * Returns the updated array (mutates status on each item).
 */
export function markOverdueSchedulesAsMissed(schedules: Schedule[]): Schedule[] {
  const now = new Date();
  for (const s of schedules) {
    if (s.status === ScheduleStatus.PENDING && s.time) {
      const taskTime = new Date(s.time);
      if (taskTime < now) {
        s.status = ScheduleStatus.MISSED;
        tablesDB
          .updateRow({
            databaseId: DATABASE_ID,
            tableId: SCHEDULE_TABLE_ID,
            rowId: s.$id,
            data: { status: ScheduleStatus.MISSED },
          })
          .catch((err) =>
            console.error("Failed to auto-mark schedule as MISSED:", s.$id, err),
          );
      }
    }
  }
  return schedules;
}

/**
 * Persist a new generic schedule task to the database.
 */
export async function createScheduleTask(params: {
  title: string;
  description: string;
  /** Combined date + time */
  datetime: Date;
  elderlyId: string;
  typeName: string;
  categoryId?: string;
  remindMinutes?: number;
  notifyConnectedCaregivers?: boolean;
}): Promise<void> {
  const {
    title,
    description,
    datetime,
    elderlyId,
    typeName,
    categoryId,
    remindMinutes,
    notifyConnectedCaregivers,
  } = params;
  const data: Record<string, any> = {
    title,
    description,
    time: datetime.toISOString(),
    elderly: elderlyId,
    status: ScheduleStatus.PENDING,
    type: typeName.toLowerCase(),
  };
  if (categoryId) data.scheduleCategory = categoryId;
  if (remindMinutes != null) data.remind_minutes = remindMinutes;

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: SCHEDULE_TABLE_ID,
      rowId: ID.unique(),
      data,
    });
    if (notifyConnectedCaregivers) {
      await emitCaregiverActivityAlerts({
        elderlyId,
        type: "cg_sched_add",
        description: `${title} at ${datetime.toLocaleString()}`,
      });
    } else {
      await sendImmediateNotification(
        "Schedule added",
        `${title} at ${datetime.toLocaleString()}`,
        { type: "schedule_action" },
      );
    }
  } catch (error: any) {
    const errorMessage = error?.message || "";
    const hasSchemaMismatch =
      /Unknown attribute:\s*"remind_minutes"/i.test(errorMessage);

    if (!hasSchemaMismatch) {
      throw error;
    }

    console.warn(
      "[Schedule] schedule.remind_minutes is missing on the server, retrying without reminder column.",
    );

    const { remind_minutes: _ignored, ...fallbackData } = data;
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: SCHEDULE_TABLE_ID,
      rowId: ID.unique(),
      data: fallbackData,
    });
    if (notifyConnectedCaregivers) {
      await emitCaregiverActivityAlerts({
        elderlyId,
        type: "cg_sched_add",
        description: `${title} at ${datetime.toLocaleString()}`,
      });
    } else {
      await sendImmediateNotification(
        "Schedule added",
        `${title} at ${datetime.toLocaleString()}`,
        { type: "schedule_action" },
      );
    }
  }
}
