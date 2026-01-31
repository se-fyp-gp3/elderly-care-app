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
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
    
    // We only care about user's logs
    const profile = await getElderlyByUserId(userId);
    if (!profile?.$id) return;
    
    try {
        const response = await tablesDB.listRows<MedicationLog>({
            databaseId: DATABASE_ID,
            tableId: MEDICATION_LOGS_TABLE_ID,
            queries: [
                Query.equal("elderly", profile.$id),
                Query.equal("status", "pending"),
                Query.lessThan("scheduled_at", tenMinutesAgo.toISOString()),
                Query.limit(100) 
            ]
        });

        const updates = response.rows.map(log => 
             tablesDB.updateRow({
                 databaseId: DATABASE_ID,
                 tableId: MEDICATION_LOGS_TABLE_ID,
                 rowId: log.$id,
                 data: {
                     status: 'skipped'
                 }
             })
        );
        
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

  // Start of day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  // End of day
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const response = await tablesDB.listRows<MedicationLog>({
      databaseId: DATABASE_ID,
      tableId: MEDICATION_LOGS_TABLE_ID,
      queries: [
        Query.equal("elderly", profile.$id),
        Query.greaterThanEqual("scheduled_at", startOfDay.toISOString()),
        Query.lessThanEqual("scheduled_at", endOfDay.toISOString()),
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
