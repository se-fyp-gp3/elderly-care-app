/**
 * Fall Detection Service
 *
 * Pattern: accelerometer detects sudden high-G spike → gyroscope confirms
 * rapid orientation change → brief stillness follows → trigger countdown.
 *
 * Uses expo-sensors (Accelerometer + Gyroscope).
 * Uses expo-task-manager + expo-location to keep sensors alive in background.
 */

import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

const BACKGROUND_LOCATION_TASK = "FALL_DETECTION_BG_LOCATION";

/* ── Thresholds ─────────────────────────────────────────── */
const ACCEL_SPIKE_THRESHOLD = 22; // m/s² total magnitude (lowered for better sensitivity)
const GYRO_RAPID_THRESHOLD = 3; // rad/s total rotation rate
const STILLNESS_THRESHOLD = 14; // m/s² — higher value = more forgiving stillness check
const STILLNESS_WINDOW_MS = 800; // must stay still for this long (reduced)
const SPIKE_TO_STILL_MAX_MS = 5000; // max gap between spike and stillness (increased)
const COOLDOWN_MS = 30_000; // ignore repeated triggers
const SENSOR_INTERVAL_MS = 100; // 10 Hz

/* ── State ──────────────────────────────────────────────── */
let accelSub: ReturnType<typeof Accelerometer.addListener> | null = null;
let gyroSub: ReturnType<typeof Gyroscope.addListener> | null = null;
let onFallDetected: (() => void) | null = null;

let spikeTime = 0;
let gyroConfirmed = false;
let stillStartTime = 0;
let lastTriggerTime = 0;
let isRunning = false;
let bgRunning = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/* ── Background Task (keeps process alive via foreground service) ── */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {
  // No-op: we only need the foreground service to keep the JS engine alive
  // so that the Accelerometer/Gyroscope listeners continue firing.
});

/* ── Core ───────────────────────────────────────────────── */

function reset() {
  spikeTime = 0;
  gyroConfirmed = false;
  stillStartTime = 0;
}

function handleAccelData(data: { x: number; y: number; z: number }) {
  const now = Date.now();
  const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);

  // Phase 1: detect spike
  if (spikeTime === 0) {
    if (mag > ACCEL_SPIKE_THRESHOLD) {
      spikeTime = now;
      gyroConfirmed = false;
      stillStartTime = 0;
    }
    return;
  }

  // Timeout – reset if too long after spike
  if (now - spikeTime > SPIKE_TO_STILL_MAX_MS) {
    reset();
    return;
  }

  // Phase 3: detect stillness (after gyro confirmed)
  if (gyroConfirmed) {
    const diff = Math.abs(mag - 9.8);
    if (diff < (STILLNESS_THRESHOLD - 9.8)) {
      // "still" means magnitude close to 1g
      if (stillStartTime === 0) stillStartTime = now;
      if (now - stillStartTime >= STILLNESS_WINDOW_MS) {
        // Cooldown check
        if (now - lastTriggerTime > COOLDOWN_MS) {
          lastTriggerTime = now;
          reset();
          onFallDetected?.();
        } else {
          reset();
        }
      }
    } else {
      stillStartTime = 0; // reset stillness timer if movement detected
    }
  }
}

function handleGyroData(data: { x: number; y: number; z: number }) {
  if (spikeTime === 0 || gyroConfirmed) return;
  const rate = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
  if (rate > GYRO_RAPID_THRESHOLD) {
    gyroConfirmed = true;
  }
}

/* ── Background Service ─────────────────────────────────── */

async function startBackgroundService() {
  if (bgRunning) return;
  if (Platform.OS !== "android") return; // iOS uses HealthKit / Apple Watch

  try {
    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      console.warn("[FallDetection] Foreground location permission denied");
      return;
    }

    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      console.warn("[FallDetection] Background location permission denied");
      return;
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    ).catch(() => false);

    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Lowest,
        timeInterval: 60_000, // 1 min – just to keep service alive
        distanceInterval: 0,
        deferredUpdatesInterval: 60_000,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: "跌倒偵測運行中",
          notificationBody: "正在背景監測，保障您的安全",
          notificationColor: "#4CAF50",
        },
      });
    }
    bgRunning = true;
  } catch (err) {
    console.warn("[FallDetection] Failed to start background service:", err);
  }
}

async function stopBackgroundService() {
  if (!bgRunning) return;
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    ).catch(() => false);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    console.warn("[FallDetection] Failed to stop background service:", err);
  }
  bgRunning = false;
}

/* ── Public API ─────────────────────────────────────────── */

export async function startFallDetection(
  callback: () => void,
): Promise<boolean> {
  if (isRunning) return true;

  onFallDetected = callback;
  reset();

  Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

  accelSub = Accelerometer.addListener(handleAccelData);
  gyroSub = Gyroscope.addListener(handleGyroData);
  isRunning = true;

  // Start background foreground-service to keep sensors alive
  await startBackgroundService();

  // Re-attach sensors when app returns to foreground (Android may suspend them)
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active" && isRunning) {
      // Re-ensure sensors are attached
      if (!accelSub) {
        Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        accelSub = Accelerometer.addListener(handleAccelData);
      }
      if (!gyroSub) {
        Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
        gyroSub = Gyroscope.addListener(handleGyroData);
      }
    }
  });

  return true;
}

export async function stopFallDetection() {
  accelSub?.remove();
  gyroSub?.remove();
  accelSub = null;
  gyroSub = null;
  onFallDetected = null;
  isRunning = false;
  reset();

  appStateSubscription?.remove();
  appStateSubscription = null;

  await stopBackgroundService();
}

export function isFallDetectionRunning(): boolean {
  return isRunning;
}
