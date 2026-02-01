import {
    ElderlyMedicationReminder,
    Medication,
    MedicationLog,
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
import { getElderlyByUserId } from "./elderly";

export async function checkAndMarkSkippedMedications(
    userId: string
): Promise<void> {
    const now = new Date();
    // 1 minute buffer (reduced from 10m to be more responsive)
    const bufferTime = 1 * 60 * 1000; 
    
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
                 const [hours, minutes] = time.split(':').map(Number);
                 
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
                     const existingLog = todayLogs.find(l => {
                        const logRemId = (typeof l.elderly_medication_reminder === 'string') 
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
                     } else if (existingLog.status === 'pending') {
                         // Case 2: Log exists and is pending -> Update to MISSING
                         console.log(`Auto-marking MISSING (update): ${existingLog.$id}`);
                         updates.push(tablesDB.updateRow({
                             databaseId: DATABASE_ID,
                             tableId: MEDICATION_LOGS_TABLE_ID,
                             rowId: existingLog.$id,
                             data: {
                                 status: 'missing'
                             }
                         }));
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
        if (typeof row.elderly_medication === 'string') {
            elderlyMedicationIds.add(row.elderly_medication);
            pendingRowsIndices.push(index);
        }
        // If it's already an object, we proceed to Phase 2 directly
    });

    if (elderlyMedicationIds.size > 0) {
        try {
             // We can't use ELDERLY_MEDICATION_TABLE_ID directly if it's strictly typed or check limits
             // But let's assume we can fetch.
            const emResponse = await tablesDB.listRows<any>({ // Use any or ElderlyMedication type
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                queries: [
                    Query.equal('$id', Array.from(elderlyMedicationIds))
                ]
            });
            const emMap = new Map(emResponse.rows.map((r: any) => [r.$id, r]));
            
            rows.forEach(row => {
                if (typeof row.elderly_medication === 'string') {
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
    rows.forEach(row => {
        // Now row.elderly_medication should be an object if available
        if (row.elderly_medication && typeof row.elderly_medication !== 'string') {
             const meds = row.elderly_medication.medication;
             if (Array.isArray(meds)) {
                 meds.forEach((m: any) => {
                     if (typeof m === 'string') medicationIds.add(m);
                 });
             } else if (typeof meds === 'string') {
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
                queries: [
                    Query.equal('$id', ids)
                ]
            });
            medResponse.rows.forEach((m: any) => {
                fetchedMedications[m.$id] = m;
            });

            // Attach back
            rows.forEach(row => {
                if (row.elderly_medication && typeof row.elderly_medication !== 'string') {
                    const meds = row.elderly_medication.medication;
                    if (Array.isArray(meds)) {
                        const hydratedMeds: Medication[] = [];
                        meds.forEach((m: any) => {
                            if (typeof m === 'string') {
                                if (fetchedMedications[m]) hydratedMeds.push(fetchedMedications[m]);
                            } else {
                                hydratedMeds.push(m);
                            }
                        });
                        row.elderly_medication.medication = hydratedMeds;
                    } else if (typeof meds === 'string') {
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
): Promise<MedicationLog[]> {
  const profile = await getElderlyByUserId(userId);
  if (!profile?.$id) return [];

    // Use HK day boundary to match scheduled_at generation
    const hkOffset = 8 * 60 * 60 * 1000;
    const hkDate = new Date(date.getTime() + hkOffset);
    const hkDayStr = hkDate.toISOString().slice(0, 10);

    const hkBase = new Date(hkDayStr); // 00:00 UTC representing HK date
    const startOfDay = new Date(hkBase.getTime() - hkOffset); // 00:00 HK in UTC
    const endOfDay = new Date(startOfDay.getTime() + (24 * 60 * 60 * 1000) - 1);

  try {
    const response = await tablesDB.listRows<MedicationLog>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.greaterThanEqual("scheduled_at", startOfDay.toISOString()),
        Query.lessThanEqual("scheduled_at", endOfDay.toISOString()),
        Query.limit(500), // Increase limit to ensure we fetch all daily logs
      ],
    });
    return response.rows as unknown as MedicationLog[];
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
    const logs = await tablesDB.listRows<MedicationLog>({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        queries: [
            Query.equal("elderly_medication_reminder", reminderId),
            Query.equal("scheduled_at", scheduledAt),
            Query.limit(1)
        ]
    });

    if (logs.total > 0) {
        // Update existing log
        await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: MEDICATION_LOGS_TABLE_ID,
            rowId: logs.rows[0].$id,
            data: {
                status,
                taken_at: status === 'taken' ? new Date().toISOString() : null
            }
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
                taken_at: status === 'taken' ? new Date().toISOString() : null,
                status
            }
        });
    }
}

export async function deactivateMedicationReminder(
  userId: string,
  reminderId: string
): Promise<void> {
    if (!ELDERLY_MEDICATION_REMINDER_TABLE_ID) return;

    try {
        // 1. Deactivate Reminder
        await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
            rowId: reminderId,
            data: {
                active: false
            }
        });

        // 2. Hide/Update future or pending Logs
        const logs = await tablesDB.listRows<MedicationLog>({
            databaseId: DATABASE_ID,
            tableId: MEDICATION_LOGS_TABLE_ID,
            queries: [
                Query.equal("elderly_medication_reminder", reminderId),
                Query.equal("status", "pending")
            ]
        });

        for (const log of logs.rows) {
             await tablesDB.updateRow({
                 databaseId: DATABASE_ID,
                 tableId: MEDICATION_LOGS_TABLE_ID,
                 rowId: log.$id,
                 data: {
                     status: "skipped"
                 }
             });
        }

    } catch (error) {
        console.error("Error deactivating medication reminder:", error);
        throw error;
    }
}
