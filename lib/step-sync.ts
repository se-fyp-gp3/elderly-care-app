/**
 * Step Sync Service
 *
 * Handles:
 * 1. Google Fit (Android) / Apple HealthKit (iOS) step count authorization & data retrieval
 * 2. Appwrite database upsert logic (one row per elderly per day)
 * 3. Fetching today's step count from native health APIs
 *
 * Only fetches current day's total cumulative steps.
 * Never modifies historical data.
 */

import { PermissionsAndroid, Platform } from "react-native";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    ELDERLY_DAILY_STEPS_TABLE_ID,
    tablesDB,
} from "./appwrite";

// ─── Types ──────────────────────────────────────────────────────────────

export type StepDataSource =
  | "health_connect"
  | "apple_healthkit"
  | "manual";

export interface StepSyncResult {
  success: boolean;
  steps: number;
  source: StepDataSource;
  error?: string;
}

export interface DailyStepRecord {
  $id: string;
  elderlyId: string;
  date: string;
  steps: number;
  lastUpdated: string;
  source: string;
  $createdAt: string;
  $updatedAt: string;
}

// ─── Date Helpers ───────────────────────────────────────────────────────

/** Get today's date in YYYY-MM-DD format (local timezone) */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Get start-of-day Date object for today (local timezone) */
function getStartOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

// ─── Native Health API Integration ─────────────────────────────────────

/**
 * Request authorization from the platform health API.
 * - Android: Google Fit
 * - iOS: Apple HealthKit
 *
 * Returns true if authorized successfully.
 */
export async function requestHealthAuthorization(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      return await requestHealthConnectAuthorization();
    } else if (Platform.OS === "ios") {
      return await requestHealthKitAuthorization();
    }
    console.warn("Step tracking not supported on this platform");
    return false;
  } catch (error) {
    console.error("Health authorization error:", error);
    return false;
  }
}

/**
 * Fetch today's total step count from the native health API.
 * Returns { steps, source } or throws on error.
 */
export async function fetchTodaySteps(): Promise<{
  steps: number;
  source: StepDataSource;
}> {
  if (Platform.OS === "android") {
    return await fetchHealthConnectSteps();
  } else if (Platform.OS === "ios") {
    return await fetchHealthKitSteps();
  }
  throw new Error("Step tracking not supported on this platform");
}

// ─── Health Connect (Android) ──────────────────────────────────────────

function getHealthConnectModule() {
  const mod = require("react-native-health-connect");
  return mod?.default ?? mod;
}

async function requestHealthConnectAuthorization(): Promise<boolean> {
  try {
    const hasPermission = await ensureActivityRecognitionPermission();
    if (!hasPermission) {
      console.warn(
        "[HealthConnect] Activity recognition permission denied"
      );
      return false;
    }

    const HealthConnect = getHealthConnectModule();

    if (HealthConnect?.initialize) {
      await HealthConnect.initialize();
    }

    const permissions = await HealthConnect.requestPermission([
      { accessType: "read", recordType: "Steps" },
    ]);

    return Array.isArray(permissions)
      ? permissions.some(
          (p: any) =>
            p.recordType === "Steps" && p.accessType === "read"
        )
      : false;
  } catch (error) {
    console.error("[HealthConnect] Authorization error:", error);
    return false;
  }
}

async function ensureActivityRecognitionPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      {
        title: "Activity Recognition Permission",
        message:
          "This app needs activity recognition to read your step count.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error("[HealthConnect] Permission request error:", error);
    return false;
  }
}

async function fetchHealthConnectSteps(): Promise<{
  steps: number;
  source: StepDataSource;
}> {
  try {
    const HealthConnect = getHealthConnectModule();

    const startOfToday = getStartOfToday();
    const now = new Date();

    const response = await HealthConnect.readRecords("Steps", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfToday.toISOString(),
        endTime: now.toISOString(),
      },
    });

    const records = response?.records ?? [];
    const totalSteps = records.reduce(
      (sum: number, record: any) => sum + (record?.count || 0),
      0
    );

    console.log("[HealthConnect] Today steps:", totalSteps);
    return { steps: totalSteps, source: "health_connect" };
  } catch (error) {
    console.error("[HealthConnect] Error fetching steps:", error);
    throw new Error("Failed to fetch steps from Health Connect");
  }
}

// ─── Apple HealthKit (iOS) ─────────────────────────────────────────────

function getAppleHealthKitModule() {
  const mod = require("react-native-health");
  return mod?.default ?? mod;
}

async function requestHealthKitAuthorization(): Promise<boolean> {
  try {
    const AppleHealthKit = getAppleHealthKitModule();

    return new Promise((resolve) => {
      const permissions = {
        permissions: {
          read: [AppleHealthKit.Constants.Permissions.StepCount],
          write: [], // We only read, never write
        },
      };

      AppleHealthKit.initHealthKit(
        permissions,
        (error: any) => {
          if (error) {
            console.warn("[HealthKit] Authorization denied:", error);
            resolve(false);
          } else {
            console.log("[HealthKit] Authorization successful");
            resolve(true);
          }
        }
      );
    });
  } catch (error) {
    console.error("[HealthKit] Authorization error:", error);
    return false;
  }
}

async function fetchHealthKitSteps(): Promise<{
  steps: number;
  source: StepDataSource;
}> {
  try {
    const AppleHealthKit = getAppleHealthKitModule();

    const startOfToday = getStartOfToday();

    return new Promise((resolve, reject) => {
      const options = {
        date: startOfToday.toISOString(),
        includeManuallyAdded: true,
      };

      AppleHealthKit.getStepCount(
        options,
        (error: any, results: { value: number }) => {
          if (error) {
            console.error("[HealthKit] Error fetching steps:", error);
            reject(new Error("Failed to fetch steps from HealthKit"));
          } else {
            const steps = Math.round(results?.value || 0);
            console.log("[HealthKit] Today steps:", steps);
            resolve({ steps, source: "apple_healthkit" });
          }
        }
      );
    });
  } catch (error) {
    console.error("[HealthKit] Error:", error);
    throw new Error("Failed to fetch steps from HealthKit");
  }
}

// ─── Appwrite Database Operations ──────────────────────────────────────

/**
 * Query today's step record for a specific elderly user.
 * Returns the record if found, null otherwise.
 */
export async function getTodayStepRecord(
  elderlyId: string
): Promise<DailyStepRecord | null> {
  const today = getTodayDateString();
  return getStepRecordByDate(elderlyId, today);
}

/**
 * Query step record for a specific elderly user on a specific date.
 */
export async function getStepRecordByDate(
  elderlyId: string,
  date: string
): Promise<DailyStepRecord | null> {
  try {
    const response = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
      queries: [
        Query.equal("elderlyId", elderlyId),
        Query.equal("date", date),
        Query.limit(1),
      ],
    });

    if (response.total > 0) {
      return response.rows[0] as unknown as DailyStepRecord;
    }
    return null;
  } catch (error) {
    console.error("[StepSync] Error querying step record:", error);
    return null;
  }
}

/**
 * Query step history for an elderly user (paginated, most recent first).
 */
export async function getStepHistory(
  elderlyId: string,
  limit: number = 30
): Promise<DailyStepRecord[]> {
  try {
    const response = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
      queries: [
        Query.equal("elderlyId", elderlyId),
        Query.orderDesc("date"),
        Query.limit(limit),
      ],
    });

    return response.rows as unknown as DailyStepRecord[];
  } catch (error) {
    console.error("[StepSync] Error querying step history:", error);
    return [];
  }
}

/**
 * Upsert today's step count for an elderly user.
 *
 * Business rules:
 * - If no record exists for today → CREATE new row
 * - If record exists for today → UPDATE steps + lastUpdated only
 * - NEVER modify records for dates other than today
 */
export async function syncStepsToAppwrite(
  elderlyId: string,
  steps: number,
  source: StepDataSource
): Promise<DailyStepRecord | null> {
  const today = getTodayDateString();
  const now = new Date().toISOString();

  try {
    // Check if a record already exists for today
    const existingRecord = await getTodayStepRecord(elderlyId);

    if (existingRecord) {
      // UPDATE existing row — only modify steps + lastUpdated + source
      console.log(
        `[StepSync] Updating existing record ${existingRecord.$id}: ${existingRecord.steps} → ${steps}`
      );

      const updated = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
        rowId: existingRecord.$id,
        data: {
          steps: steps,
          lastUpdated: now,
          source: source,
        },
      });

      return updated as unknown as DailyStepRecord;
    } else {
      // CREATE new row for today
      console.log(
        `[StepSync] Creating new record for ${elderlyId} on ${today}: ${steps} steps`
      );

      try {
        const created = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
          rowId: ID.unique(),
          data: {
            elderlyId: elderlyId,
            date: today,
            steps: steps,
            lastUpdated: now,
            source: source,
          },
        });

        return created as unknown as DailyStepRecord;
      } catch (createError: any) {
        // Race condition: another sync created the row between our
        // check and this insert.  Fall back to an update instead.
        if (createError?.code === 409 || createError?.message?.includes("already exists")) {
          console.warn(
            "[StepSync] Row was created by a concurrent sync, retrying as update…"
          );
          const retryRecord = await getTodayStepRecord(elderlyId);
          if (retryRecord) {
            const updated = await tablesDB.updateRow({
              databaseId: DATABASE_ID,
              tableId: ELDERLY_DAILY_STEPS_TABLE_ID,
              rowId: retryRecord.$id,
              data: {
                steps: steps,
                lastUpdated: now,
                source: source,
              },
            });
            return updated as unknown as DailyStepRecord;
          }
        }
        throw createError;
      }
    }
  } catch (error) {
    console.error("[StepSync] Error syncing steps to Appwrite:", error);
    return null;
  }
}

/**
 * Full sync flow: Fetch from native health API → Sync to Appwrite.
 *
 * This is the main entry point for both automatic and manual sync.
 */
export async function performStepSync(
  elderlyId: string
): Promise<StepSyncResult> {
  try {
    // 1. Fetch today's steps from the native health API
    const { steps, source } = await fetchTodaySteps();

    // 2. Sync to Appwrite (upsert)
    const record = await syncStepsToAppwrite(elderlyId, steps, source);

    if (record) {
      return { success: true, steps, source };
    } else {
      return {
        success: false,
        steps: 0,
        source,
        error: "Failed to save steps to database",
      };
    }
  } catch (error: any) {
    console.error("[StepSync] Full sync error:", error);
    return {
      success: false,
      steps: 0,
      source:
        Platform.OS === "android"
          ? "health_connect"
          : "apple_healthkit",
      error: error.message || "Unknown error during step sync",
    };
  }
}
