/**
 * Step data abstraction using Android Health Connect.
 *
 * Reads step count records from Health Connect on Android.
 * Uses `react-native-health-connect` to interact with the Health Connect API.
 */

import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from "react-native-health-connect";
import { Alert, Linking } from "react-native";

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export type StepPermissionStatus = "granted" | "denied" | "undetermined";

let _initialized = false;

/**
 * Ensure Health Connect SDK is initialized (call once before any operation).
 */
async function ensureInitialized(): Promise<boolean> {
  if (_initialized) return true;
  try {
    const ok = await initialize();
    _initialized = ok;
    return ok;
  } catch (error) {
    console.error("Health Connect initialize error:", error);
    return false;
  }
}

/**
 * Request Health Connect step read permissions.
 * Returns the final permission status.
 */
export async function requestStepPermission(): Promise<StepPermissionStatus> {
  try {
    const inited = await ensureInitialized();
    if (!inited) return "denied";

    const granted = await requestPermission([
      { accessType: "read", recordType: "Steps" },
    ]);

    // If any Steps read permission was granted
    const hasSteps = granted.some(
      (p) => p.recordType === "Steps" && p.accessType === "read",
    );
    return hasSteps ? "granted" : "denied";
  } catch (error) {
    console.error("requestStepPermission error:", error);
    return "denied";
  }
}

/**
 * Check current Health Connect permission status.
 * We try to read today's records — if it succeeds we have permission.
 */
export async function getStepPermissionStatus(): Promise<StepPermissionStatus> {
  try {
    const inited = await ensureInitialized();
    if (!inited) return "denied";

    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      return "denied";
    }

    // Attempt a small read to check permissions
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0,
    );

    await readRecords("Steps", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfDay.toISOString(),
        endTime: now.toISOString(),
      },
    });

    return "granted";
  } catch {
    return "undetermined";
  }
}

/**
 * Guide user to system settings to enable Health Connect permissions.
 */
export function openPermissionSettings(): void {
  // Open Health Connect app settings
  Linking.openURL("market://details?id=com.google.android.apps.healthdata").catch(
    () => Linking.openSettings(),
  );
}

/**
 * Show a user-friendly alert when permission is denied.
 */
export function showPermissionDeniedAlert(): void {
  Alert.alert(
    "需要步数权限",
    "请开启 Health Connect（健康连接）中的步数读取权限，以便记录您的步数。",
    [
      { text: "稍后再说", style: "cancel" },
      { text: "前往设置", onPress: openPermissionSettings },
    ],
  );
}

// ---------------------------------------------------------------------------
// Step Count Retrieval
// ---------------------------------------------------------------------------

/**
 * Determine the data source label.
 */
export function getStepSource(): string {
  return "Health Connect";
}

/**
 * Check whether Health Connect is available on this device.
 */
export async function isStepCountingAvailable(): Promise<boolean> {
  try {
    const inited = await ensureInitialized();
    if (!inited) return false;

    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/**
 * Get today's total step count from Health Connect.
 */
export async function getTodaySteps(): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0,
  );

  try {
    const inited = await ensureInitialized();
    if (!inited) return 0;

    const result = await readRecords("Steps", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfDay.toISOString(),
        endTime: now.toISOString(),
      },
    });

    // Sum up all step records for today
    let totalSteps = 0;
    for (const record of result.records) {
      totalSteps += record.count;
    }
    return totalSteps;
  } catch (error) {
    console.warn("getTodaySteps error:", error);
    return 0;
  }
}

/**
 * Watch steps is not supported with Health Connect (no real-time streaming).
 * Returns a no-op unsubscribe function.
 * The hook uses polling via auto-sync instead.
 */
export function watchSteps(
  _callback: (steps: number) => void,
): () => void {
  // Health Connect doesn't support real-time step watching.
  // Step updates are handled via periodic sync in useSteps hook.
  return () => {};
}
