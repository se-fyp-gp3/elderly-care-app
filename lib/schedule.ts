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

  // 2. Reminders keyed by prescription ID ─────────────────────────────────────
  const medicationRemindersResponse = await tablesDB.listRows<any>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    queries: [Query.equal("elderly", elderlyIds), Query.limit(100)],
  });
  const prescriptionToReminderMap = new Map<string, string>();
  medicationRemindersResponse.rows.forEach((reminder) => {
    const prescriptionId = getRelationshipId(reminder.elderly_medication);
    if (prescriptionId) prescriptionToReminderMap.set(prescriptionId, reminder.$id);
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
    const elderlyName = elderlyMap.get(elderlyId) || "Unknown";

    const medicationId = getRelationshipId(prescription.medication);
    const medicationInfo = medicationId ? medicationById.get(medicationId) : null;
    const medicationName = medicationInfo?.name || "Unknown Drug";
    const dosage = `${prescription.dosage || ""} ${medicationInfo?.unit || ""}`;

    const approxTimes = prescription.approx_times || [];
    const reminderId = prescriptionToReminderMap.get(prescription.$id);

    // Filter logs that belong to this reminder
    const candidateLogs = reminderId
      ? medicationLogsResponse.rows.filter(
          (log) =>
            getRelationshipId(log.elderly_medication_reminder) === reminderId,
        )
      : [];

    approxTimes.forEach((approxTimeStr: string, slotIndex: number) => {
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
 * Record a medication as taken for the given slot.
 * Creates a new log if none exists yet, or updates the existing one.
 * Returns the (potentially new) log ID.
 */
export async function recordMedicationTaken(params: {
  reminderId: string;
  logId?: string;
  elderlyId: string;
  /** Original approx_times string for this slot */
  medicationTime: string;
  selectedDate: Date;
  prescriptionId: string;
}): Promise<string | undefined> {
  const { reminderId, logId, elderlyId, medicationTime, selectedDate, prescriptionId } =
    params;
  const now = new Date();
  let activeLogId = logId;

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
    const timeParts = medicationTime.includes(":") ? medicationTime.split(":") : ["00", "00"];
    const scheduledDate = new Date(selectedDate);
    scheduledDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);

    const newLog = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        status: "taken",
        taken_at: now.toISOString(),
        scheduled_at: scheduledDate.toISOString(),
        elderly: elderlyId,
        elderly_medication_reminder: reminderId,
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
}): Promise<void> {
  const { title, description, datetime, elderlyId, typeName, categoryId } = params;
  const data: Record<string, any> = {
    title,
    description,
    time: datetime.toISOString(),
    elderly: elderlyId,
    status: ScheduleStatus.PENDING,
    type: typeName.toLowerCase(),
  };
  if (categoryId) data.scheduleCategory = categoryId;

  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: SCHEDULE_TABLE_ID,
    rowId: ID.unique(),
    data,
  });
}
