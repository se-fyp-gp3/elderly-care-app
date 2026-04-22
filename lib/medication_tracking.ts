import { translateUnit } from "@/lib/schedule";
import {
    ElderlyMedicationReminder,
    Medication,
    MedicationLogs,
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
  import { emitCaregiverActivityAlerts } from "./caregiver-activity-alerts";
import { getElderlyByUserId } from "./elderly";
  import { sendImmediateNotification } from "./notifications";

export async function checkAndMarkSkippedMedications(
  userId: string,
): Promise<void> {
  const now = new Date();
  // 10 minute buffer before marking as missing
  const bufferTime = 10 * 60 * 1000;

  // HK Offset (UTC+8)
  const hkOffset = 8 * 60 * 60 * 1000;
  const hkDate = new Date(now.getTime() + hkOffset);
  const todayStr = hkDate.toISOString().slice(0, 10); // YYYY-MM-DD in HK

  // We only care about user's logs
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return;

  try {
    // Fetch all active reminders
    const reminders = await fetchActiveMedicationReminders(userId);

    // Fetch existing logs for today (based on current absolute time)
    const todayLogs = await fetchDailyMedicationLogs(userId, now);

    const updates: Promise<any>[] = [];

    for (const reminder of reminders) {
      for (const time of reminder.reminder_times) {
        // Construct scheduled time treating 'time' as HK Time
        const [hours, minutes] = time.split(":").map(Number);

        // Construct a base date using the HK date string, set to 00:00 UTC
        const baseDate = new Date(todayStr); // e.g. 2026-02-01T00:00:00.000Z
        baseDate.setUTCHours(hours, minutes, 0, 0); // e.g. 2026-02-01T14:47:00.000Z

        // Subtract 8 hours to convert HKT to UTC
        const scheduledDate = new Date(baseDate.getTime() - hkOffset);
        const scheduledAtFull = scheduledDate.toISOString();

        // Check if it's "past due" (> 10 mins ago)
        const diff = now.getTime() - scheduledDate.getTime();

        if (diff > bufferTime) {
          // Find existing log
          // Handle relationship safely (it might be string ID or expanded object)
          const existingLog = todayLogs.find((l) => {
            const logRemId =
              typeof l.elderly_medication_reminder === "string"
                ? l.elderly_medication_reminder
                : l.elderly_medication_reminder?.$id;

            if (logRemId !== reminder.$id) return false;

            // Robust comparison: check if time matches within 1 second
            // This handles potential millisecond discrepancies or string formatting issues
            const logTime = new Date(l.scheduled_at).getTime();
            const schedTime = scheduledDate.getTime();
            return Math.abs(logTime - schedTime) < 2000;
          });

          if (!existingLog) {
            // Case 1: No log exists -> Do nothing.
            // We rely on createElderlyMedicationWithReminder to generate all necessary logs.
            // If a log is missing for a past time, it means it was skipped during creation (intended).
            continue;
          } else if (existingLog.status === "pending") {
            // Case 2: Log exists and is pending -> Update to MISSING
            console.log(`Auto-marking MISSING (update): ${existingLog.$id}`);
            updates.push(
              tablesDB.updateRow({
                databaseId: DATABASE_ID,
                tableId: MEDICATION_LOGS_TABLE_ID,
                rowId: existingLog.$id,
                data: {
                  status: "missing",
                },
              }),
            );
          }
        }
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (e) {
    console.error("Error marking skipped medications:", e);
  }
}

export async function fetchActiveMedicationReminders(
  userId: string,
): Promise<ElderlyMedicationReminder[]> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return [];

  // Assuming ELDERLY_MEDICATION_REMINDER_TABLE_ID is defined
  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return [];

  try {
    const response = await tablesDB.listRows<ElderlyMedicationReminder>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.equal("active", true),
        Query.equal("is_finished", false),
      ],
    });

    const rows = response.rows as unknown as ElderlyMedicationReminder[];

    // Hydrate Level 2 Relationship: ElderlyMedication -> Medication
    // Appwrite usually returns Depth=1, so elderly_medication might be expanded or not.

    // Phase 1: Ensure ElderlyMedication is hydrated
    const elderlyMedicationIds = new Set<string>();
    const pendingRowsIndices: number[] = [];

    rows.forEach((row, index) => {
      if (typeof row.elderly_medication === "string") {
        elderlyMedicationIds.add(row.elderly_medication);
        pendingRowsIndices.push(index);
      }
      // If it's already an object, we proceed to Phase 2 directly
    });

    if (elderlyMedicationIds.size > 0) {
      try {
        // We can't use ELDERLY_MEDICATION_TABLE_ID directly if it's strictly typed or check limits
        // But let's assume we can fetch.
        const emResponse = await tablesDB.listRows<any>({
          // Use any or ElderlyMedication type
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          queries: [Query.equal("$id", Array.from(elderlyMedicationIds))],
        });
        const emMap = new Map(emResponse.rows.map((r: any) => [r.$id, r]));

        rows.forEach((row) => {
          if (typeof row.elderly_medication === "string") {
            if (emMap.has(row.elderly_medication)) {
              // @ts-ignore
              row.elderly_medication = emMap.get(row.elderly_medication);
            }
          }
        });
      } catch (e) {
        console.error("Failed to hydrate elderly_medication", e);
      }
    }

    // Phase 2: Hydrate Medication inside ElderlyMedication
    const medicationIds = new Set<string>();
    rows.forEach((row) => {
      // Now row.elderly_medication should be an object if available
      if (
        row.elderly_medication &&
        typeof row.elderly_medication !== "string"
      ) {
        const meds = row.elderly_medication.medication;
        if (Array.isArray(meds)) {
          meds.forEach((m: any) => {
            if (typeof m === "string") medicationIds.add(m);
          });
        } else if (typeof meds === "string") {
          medicationIds.add(meds);
        }
      }
    });

    if (medicationIds.size > 0) {
      const fetchedMedications: Record<string, Medication> = {};
      const ids = Array.from(medicationIds);

      // Fetch medications
      try {
        const medResponse = await tablesDB.listRows<Medication>({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_TABLE_ID,
          queries: [Query.equal("$id", ids)],
        });
        medResponse.rows.forEach((m: any) => {
          fetchedMedications[m.$id] = m;
        });

        // Attach back
        rows.forEach((row) => {
          if (
            row.elderly_medication &&
            typeof row.elderly_medication !== "string"
          ) {
            const meds = row.elderly_medication.medication;
            if (Array.isArray(meds)) {
              const hydratedMeds: Medication[] = [];
              meds.forEach((m: any) => {
                if (typeof m === "string") {
                  if (fetchedMedications[m])
                    hydratedMeds.push(fetchedMedications[m]);
                } else {
                  hydratedMeds.push(m);
                }
              });
              // row.elderly_medication.medication = hydratedMeds;
            } else if (typeof meds === "string") {
              if (fetchedMedications[meds]) {
                // @ts-ignore
                row.elderly_medication.medication = [fetchedMedications[meds]]; // Convert to array for consistency with types
              }
            }
          }
        });
      } catch (e) {
        console.error("Failed to hydrate medications", e);
      }
    }

    return rows;
  } catch (error) {
    console.error("Error fetching medication reminders:", error);
    return [];
  }
}

export async function fetchDailyMedicationLogs(
  userId: string,
  date: Date,
): Promise<MedicationLogs[]> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return [];

  // Use HK day boundary to match scheduled_at generation
  const hkOffset = 8 * 60 * 60 * 1000;
  const hkDate = new Date(date.getTime() + hkOffset);
  const hkDayStr = hkDate.toISOString().slice(0, 10);

  const hkBase = new Date(hkDayStr); // 00:00 UTC representing HK date
  const startOfDay = new Date(hkBase.getTime() - hkOffset); // 00:00 HK in UTC
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  try {
    const response = await tablesDB.listRows<MedicationLogs>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.greaterThanEqual("scheduled_at", startOfDay.toISOString()),
        Query.lessThanEqual("scheduled_at", endOfDay.toISOString()),
        Query.limit(500), // Increase limit to ensure we fetch all daily logs
      ],
    });
    return response.rows as unknown as MedicationLogs[];
  } catch (error) {
    console.error("Error fetching medication logs:", error);
    return [];
  }
}

export async function logMedicationAction(
  userId: string,
  reminderId: string,
  scheduledAt: string,
  status: "taken" | "skipped" | "pending",
): Promise<void> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) throw new Error("Elderly profile not found");

  // Check if log already exists
  const logs = await tablesDB.listRows<MedicationLogs>({
    databaseId: DATABASE_ID,
    tableId: MEDICATION_LOGS_TABLE_ID,
    queries: [
      Query.equal("elderly_medication_reminder", reminderId),
      Query.equal("scheduled_at", scheduledAt),
      Query.limit(1),
    ],
  });

  if (logs.total > 0) {
    // Update existing log
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: logs.rows[0].$id,
      data: {
        status,
        taken_at: status === "taken" ? new Date().toISOString() : null,
      },
    });
  } else {
    // Create new log
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        elderly: profile.$id,
        elderly_medication_reminder: reminderId,
        scheduled_at: scheduledAt,
        taken_at: status === "taken" ? new Date().toISOString() : null,
        status,
      },
    });
  }

  // After logging "taken", check if the entire reminder is now finished
  if (status === "taken") {
    await checkAndFinishReminder(reminderId);
  }
}

/**
 * After a log is marked "taken", check if ALL logs for that reminder are
 * now "taken" (i.e. no more "pending" or "missing" logs).  If so, mark the
 * reminder as is_finished = true with end_date = now.
 */
export async function checkAndFinishReminder(
  reminderId: string,
): Promise<void> {
  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return;

  try {
    // Count remaining non-taken logs (pending or missing)
    const remaining = await tablesDB.listRows<MedicationLogs>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly_medication_reminder", reminderId),
        Query.notEqual("status", "taken"),
        Query.notEqual("status", "skipped"),
        Query.limit(1), // we only need to know if at least 1 exists
      ],
    });

    if (remaining.total === 0) {
      // All logs are taken/skipped – finish the reminder
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
        rowId: reminderId,
        data: {
          is_finished: true,
          end_date: new Date().toISOString(),
        },
      });
      console.log(`Reminder ${reminderId} auto-finished (all logs taken).`);
    }
  } catch (e) {
    console.error("checkAndFinishReminder error:", e);
  }
}

/**
 * At the start of each session (or at midnight), sweep all "pending" logs
 * whose scheduled_at is before today's 00:00 HK and mark them as "missing".
 * This ensures yesterday's un-taken meds get properly flagged.
 */
export async function markPreviousDaysPendingAsMissing(
  userId: string,
): Promise<void> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return;

  const hkOffset = 8 * 60 * 60 * 1000;
  const now = new Date();
  const hkDate = new Date(now.getTime() + hkOffset);
  const todayStr = hkDate.toISOString().slice(0, 10); // YYYY-MM-DD in HK

  // 00:00 HK today in UTC
  const todayStart = new Date(new Date(todayStr).getTime() - hkOffset);

  try {
    const pendingOld = await tablesDB.listRows<MedicationLogs>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.equal("status", "pending"),
        Query.lessThan("scheduled_at", todayStart.toISOString()),
        Query.limit(200),
      ],
    });

    if (pendingOld.total === 0) return;

    const updates = pendingOld.rows.map((log) =>
      tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        rowId: log.$id,
        data: { status: "missing" },
      }),
    );

    await Promise.all(updates);
    console.log(`Marked ${updates.length} old pending logs as missing.`);
  } catch (e) {
    console.error("markPreviousDaysPendingAsMissing error:", e);
  }
}

export async function deactivateMedicationReminder(
  userId: string,
  reminderId: string,
): Promise<void> {
  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return;

  const profile = await getElderlyByUserId(userId);

  try {
    // 1. Deactivate Reminder
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
      rowId: reminderId,
      data: {
        active: false,
      },
    });

    // 2. Hide/Update future or pending Logs
    const logs = await tablesDB.listRows<MedicationLogs>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly_medication_reminder", reminderId),
        Query.equal("status", "pending"),
      ],
    });

    for (const log of logs.rows) {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        rowId: log.$id,
        data: {
          status: "skipped",
        },
      });
    }

    if (profile?.$id) {
      await emitCaregiverActivityAlerts({
        elderlyId: profile.$id,
        elderlyName: profile.name,
        type: "cg_med_cancel",
        description: "Cancelled a medication reminder.",
      });
    }
  } catch (error) {
    console.error("Error deactivating medication reminder:", error);
    throw error;
  }
}

export async function fetchFinishedMedicationReminders(
  userId: string,
): Promise<ElderlyMedicationReminder[]> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return [];

  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return [];

  try {
    const response = await tablesDB.listRows<ElderlyMedicationReminder>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.equal("is_finished", true),
        Query.equal("active", true),
        Query.orderDesc("end_date"),
        Query.limit(50),
      ],
    });

    const rows = response.rows as unknown as ElderlyMedicationReminder[];

    // Hydrate Level 2 Relationship: ElderlyMedication -> Medication (same as active)
    const elderlyMedicationIds = new Set<string>();
    rows.forEach((row) => {
      if (typeof row.elderly_medication === "string") {
        elderlyMedicationIds.add(row.elderly_medication);
      }
    });

    if (elderlyMedicationIds.size > 0) {
      try {
        const emResponse = await tablesDB.listRows<any>({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          queries: [Query.equal("$id", Array.from(elderlyMedicationIds))],
        });
        const emMap = new Map(emResponse.rows.map((r: any) => [r.$id, r]));
        rows.forEach((row) => {
          if (typeof row.elderly_medication === "string") {
            if (emMap.has(row.elderly_medication)) {
              // @ts-ignore
              row.elderly_medication = emMap.get(row.elderly_medication);
            }
          }
        });
      } catch (e) {
        console.error("Failed to hydrate elderly_medication (finished)", e);
      }
    }

    const medicationIds = new Set<string>();
    rows.forEach((row) => {
      if (row.elderly_medication && typeof row.elderly_medication !== "string") {
        const meds = row.elderly_medication.medication;
        if (Array.isArray(meds)) {
          meds.forEach((m: any) => {
            if (typeof m === "string") medicationIds.add(m);
          });
        } else if (typeof meds === "string") {
          medicationIds.add(meds);
        }
      }
    });

    if (medicationIds.size > 0) {
      const fetchedMedications: Record<string, Medication> = {};
      try {
        const medResponse = await tablesDB.listRows<Medication>({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_TABLE_ID,
          queries: [Query.equal("$id", Array.from(medicationIds))],
        });
        medResponse.rows.forEach((m: any) => {
          fetchedMedications[m.$id] = m;
        });
        rows.forEach((row) => {
          if (row.elderly_medication && typeof row.elderly_medication !== "string") {
            const meds = row.elderly_medication.medication;
            if (typeof meds === "string") {
              if (fetchedMedications[meds]) {
                // @ts-ignore
                row.elderly_medication.medication = [fetchedMedications[meds]];
              }
            }
          }
        });
      } catch (e) {
        console.error("Failed to hydrate medications (finished)", e);
      }
    }

    return rows;
  } catch (error) {
    console.error("Error fetching finished medication reminders:", error);
    return [];
  }
}

export async function getFormattedTodayMedicationSummary(
  userId: string,
  language: "yue" | "zh" | "en" = "yue",
): Promise<string> {
  const now = new Date();
  const hkOffset = 8 * 60 * 60 * 1000;
  const hkDate = new Date(now.getTime() + hkOffset);
  const todayStr = hkDate.toISOString().slice(0, 10);

  const [reminders, todayLogs] = await Promise.all([
    fetchActiveMedicationReminders(userId),
    fetchDailyMedicationLogs(userId, now),
  ]);

  const todoList: {
    time: string;
    medicationName: string;
    dosage: string;
    status: string;
  }[] = [];

  const toHKDateStr = (date: Date) =>
    new Date(date.getTime() + hkOffset).toISOString().slice(0, 10);

  const toHKTimeStr = (date: Date) => {
    const hk = new Date(date.getTime() + hkOffset);
    const hours = String(hk.getUTCHours()).padStart(2, "0");
    const minutes = String(hk.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  reminders.forEach((r) => {
    r.reminder_times.forEach((time) => {
      const [hours, minutes] = time.split(":").map(Number);
      const baseDate = new Date(todayStr);
      baseDate.setUTCHours(hours, minutes, 0, 0);
      const scheduledDate = new Date(baseDate.getTime() - hkOffset);
      const scheduledAt = scheduledDate.toISOString();

      if (r.start_date && new Date(scheduledAt) < new Date(r.start_date)) {
        return;
      }

      // Hide if scheduled_at is beyond duration_days
      if (r.start_date && r.duration_days) {
        const startDateMs = new Date(r.start_date).getTime();
        const startHkDate = new Date(startDateMs + hkOffset).toISOString().slice(0, 10);
        const firstCandBase = new Date(startHkDate);
        firstCandBase.setUTCHours(hours, minutes, 0, 0);
        const firstCandUtcMs = firstCandBase.getTime() - hkOffset;
        const startDelay = firstCandUtcMs <= startDateMs ? 1 : 0;
        const lastValidUtcMs = firstCandUtcMs + (startDelay + r.duration_days - 1) * 86400000;
        if (scheduledDate.getTime() > lastValidUtcMs) {
          return;
        }
      }

      const log = todayLogs.find((l) => {
        const logRemId =
          typeof l.elderly_medication_reminder === "string"
            ? l.elderly_medication_reminder
            : l.elderly_medication_reminder?.$id;

        if (logRemId !== r.$id) return false;

        const directMatch = l.scheduled_at === scheduledAt;
        if (directMatch) return true;

        const logDate = toHKDateStr(new Date(l.scheduled_at));
        const logTime = toHKTimeStr(new Date(l.scheduled_at));
        return logDate === todayStr && logTime === time;
      });

      const medications = Array.isArray(r.elderly_medication?.medication)
        ? r.elderly_medication.medication
        : r.elderly_medication?.medication
          ? [r.elderly_medication.medication]
          : [];

      // @ts-ignore
      const medName = medications[0]?.name || "Medication";
      // @ts-ignore
      const medUnit = medications[0]?.unit || "dose";
      // @ts-ignore
      const medDosage = `${r.elderly_medication?.dosage || 1} ${translateUnit(medUnit)}`;

      todoList.push({
        time,
        medicationName: medName,
        dosage: medDosage,
        status: log ? (log.status as string) : "pending",
      });
    });
  });

  todoList.sort((a, b) => a.time.localeCompare(b.time));

  if (todoList.length === 0) {
    if (language === "yue") return "你今日冇藥要食。";
    if (language === "zh") return "你今天没有药要吃。";
    return "You have no medications scheduled for today.";
  }

  const statusLabel = (s: string) => {
    if (language === "yue") {
      return s === "taken" ? "已食" : s === "missing" ? "漏咗" : "未食";
    }
    if (language === "zh") {
      return s === "taken" ? "已服" : s === "missing" ? "漏服" : "待服";
    }
    return s === "taken" ? "Taken" : s === "missing" ? "Missed" : "Pending";
  };

  const items = todoList.map((item) => {
    const time = item.time;
    const name = item.medicationName;
    const dosage = item.dosage;
    const status = statusLabel(item.status);
    if (language === "yue") {
      return `${time} ${name}（${dosage}）— ${status}`;
    }
    if (language === "zh") {
      return `${time} ${name}（${dosage}）— ${status}`;
    }
    return `${time} - ${name} (${dosage}): ${status}`;
  });

  if (language === "yue") {
    const pendingCount = todoList.filter(i => i.status === "pending").length;
    const takenCount = todoList.filter(i => i.status === "taken").length;
    let intro = `你今日有${todoList.length}次藥要食`;
    if (takenCount > 0 && pendingCount > 0) {
      intro += `，已經食咗${takenCount}次，仲有${pendingCount}次未食`;
    } else if (takenCount === todoList.length) {
      intro += `，全部都食晒喇，做得好！`;
    }
    return `${intro}：\n${items.join("\n")}`;
  }
  if (language === "zh") {
    const pendingCount = todoList.filter(i => i.status === "pending").length;
    const takenCount = todoList.filter(i => i.status === "taken").length;
    let intro = `你今天有${todoList.length}次药要吃`;
    if (takenCount > 0 && pendingCount > 0) {
      intro += `，已经吃了${takenCount}次，还有${pendingCount}次没吃`;
    } else if (takenCount === todoList.length) {
      intro += `，全部都吃完了，做得好！`;
    }
    return `${intro}：\n${items.join("\n")}`;
  }

  return `Here is your medication schedule for today:\n${items.join("\n")}`;
}

/**
 * Fetch medication reminders that the elderly has cancelled (active=false)
 * but not yet confirmed by the caregiver (is_finished=false).
 */
export async function fetchPendingCancelReminders(
  elderlyIds: string[],
): Promise<ElderlyMedicationReminder[]> {
  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID || elderlyIds.length === 0)
    return [];

  try {
    const response = await tablesDB.listRows<ElderlyMedicationReminder>({
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
    return response.rows;
  } catch (error) {
    console.error("Error fetching pending cancel reminders:", error);
    return [];
  }
}

/**
 * Caregiver confirms that a cancelled medication reminder is finished.
 * Sets is_finished=true and end_date=now.
 */
export async function confirmCancelMedication(
  reminderId: string,
): Promise<void> {
  if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return;

  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
    rowId: reminderId,
    data: {
      is_finished: true,
      end_date: new Date().toISOString(),
    },
  });

  await sendImmediateNotification(
    "Medication removed",
    "A cancelled medication was confirmed and removed",
    { type: "medication_action" },
  );
}
