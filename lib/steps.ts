/**
 * Appwrite data layer for Elderly Daily Steps.
 *
 * Implements "one row per elderly per day" upsert logic:
 *   - Query by elderlyId + date (YYYY-MM-DD).
 *   - If a row exists → update steps, lastUpdated, source.
 *   - If no row exists → create a new one.
 *
 * All table/database IDs are read from environment variables via appwrite.ts.
 */

import { ElderlyDailySteps } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
  DATABASE_ID,
  ELDERLY_DAILY_STEPS_TABLE_ID,
  tablesDB,
} from "./appwrite";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return today's date string in YYYY-MM-DD format (HK timezone, UTC+8).
 */
export function getTodayDateString(): string {
  const now = new Date();
  const hkOffset = 8 * 60 * 60 * 1000;
  const hkDate = new Date(now.getTime() + hkOffset);
  return hkDate.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetch the step record for a given elderly + date.
 * Returns `null` when no record exists yet.
 */
export async function fetchStepsForDate(
  elderlyId: string,
  date: string,
): Promise<ElderlyDailySteps | null> {
  const response = await tablesDB.listRows<ElderlyDailySteps>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
    queries: [
      Query.equal("elderlyId", elderlyId),
      Query.equal("date", date),
      Query.limit(1),
    ],
  });

  const rows = response.rows as unknown as ElderlyDailySteps[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Fetch recent step records for chart / history display.
 */
export async function fetchRecentSteps(
  elderlyId: string,
  days = 7,
): Promise<ElderlyDailySteps[]> {
  const response = await tablesDB.listRows<ElderlyDailySteps>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
    queries: [
      Query.equal("elderlyId", elderlyId),
      Query.orderDesc("date"),
      Query.limit(days),
    ],
  });

  return response.rows as unknown as ElderlyDailySteps[];
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Create-or-update the daily step row for a given elderly user.
 *
 * @param elderlyId - Elderly profile document $id
 * @param date      - YYYY-MM-DD date string
 * @param steps     - Total step count (non-negative integer)
 * @param source    - "HealthKit" | "Health Connect" | "Pedometer"
 */
export async function upsertDailySteps(
  elderlyId: string,
  date: string,
  steps: number,
  source: string,
): Promise<ElderlyDailySteps> {
  const now = new Date().toISOString();

  const existing = await fetchStepsForDate(elderlyId, date);

  if (existing) {
    // Update the existing row
    const updated = await tablesDB.updateRow<ElderlyDailySteps>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
      rowId: existing.$id,
      data: {
        steps,
        lastUpdated: now,
        source,
      },
    });
    return updated as unknown as ElderlyDailySteps;
  }

  // Create a new row
  const created = await tablesDB.createRow<ElderlyDailySteps>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      elderlyId,
      date,
      steps,
      lastUpdated: now,
      source,
    },
  });

  return created as unknown as ElderlyDailySteps;
}
