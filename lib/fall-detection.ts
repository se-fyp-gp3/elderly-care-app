/**
 * Fall Detection Service
 *
 * Two detection paths:
 *   Path A (impact): accelerometer spike + gyroscope rotation → stillness
 *   Path B (freefall): freefall (near 0 g) → impact → stillness (no gyro needed)
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
type FallDetectionProfile = {
  name: string;
  accelSpikeThreshold: number;
  gyroRapidThreshold: number;
  gyroWindowMs: number;
  freefallThreshold: number;
  freefallMinMs: number;
  freefallImpactThreshold: number;
  stillnessToleranceG: number;
  stillnessWindowMs: number;
  spikeToStillMaxMs: number;
  sensorIntervalMs: number;
};

const DEFAULT_PROFILE: FallDetectionProfile = {
  name: "default",
  accelSpikeThreshold: 1.55,
  gyroRapidThreshold: 1.5,
  gyroWindowMs: 1000,
  freefallThreshold: 0.45,
  freefallMinMs: 80,
  freefallImpactThreshold: 1.35,
  stillnessToleranceG: 0.22,
  stillnessWindowMs: 500,
  spikeToStillMaxMs: 5000,
  sensorIntervalMs: 50,
};

const MI10_ULTRA_PROFILE: FallDetectionProfile = {
  name: "mi-10-ultra",
  accelSpikeThreshold: 1.25,
  gyroRapidThreshold: 1.1,
  gyroWindowMs: 1600,
  freefallThreshold: 0.65,
  freefallMinMs: 40,
  freefallImpactThreshold: 1.15,
  stillnessToleranceG: 0.3,
  stillnessWindowMs: 350,
  spikeToStillMaxMs: 6000,
  sensorIntervalMs: 20,
};

const COOLDOWN_MS = 30_000; // ignore repeated triggers

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
let accelerometerAvailable = true;
let gyroscopeAvailable = true;
let activeProfile: FallDetectionProfile = DEFAULT_PROFILE;
let activeDeviceModel = "unknown";

// Freefall state
let freefallStart = 0;
let freefallConfirmed = false;

// Gyro look-back: track last time gyro was high (allows detecting rotation BEFORE spike)
let lastHighGyroTime = 0;

/* ── Background Task (keeps process alive via foreground service) ── */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {
  // No-op: we only need the foreground service to keep the JS engine alive
  // so that the Accelerometer/Gyroscope listeners continue firing.
});

function getDeviceModelName(): string {
  if (Platform.OS !== "android") return "non-android";

  const constants = Platform.constants as {
    Brand?: string;
    Manufacturer?: string;
    Model?: string;
  };

  return [constants.Manufacturer, constants.Brand, constants.Model]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function selectFallDetectionProfile(): FallDetectionProfile {
  const model = getDeviceModelName();
  activeDeviceModel = model;

  if (model.includes("mi 10 ultra") || model.includes("m2007j1sc")) {
    return MI10_ULTRA_PROFILE;
  }

  return DEFAULT_PROFILE;
}

/* ── Core ───────────────────────────────────────────────── */

function reset() {
  spikeTime = 0;
  gyroConfirmed = false;
  stillStartTime = 0;
  freefallStart = 0;
  freefallConfirmed = false;
}

function handleAccelData(data: { x: number; y: number; z: number }) {
  const now = Date.now();
  const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);

  // ── Before spike detected: look for freefall or spike ──
  if (spikeTime === 0) {
    // Freefall tracking (Path B)
    if (mag < activeProfile.freefallThreshold) {
      if (freefallStart === 0) freefallStart = now;
      if (!freefallConfirmed && now - freefallStart >= activeProfile.freefallMinMs) {
        freefallConfirmed = true;
      }
      return; // still in freefall, wait for impact
    }

    // Exited low-g zone — check for impact after freefall (Path B)
    if (freefallConfirmed && mag > activeProfile.freefallImpactThreshold) {
      spikeTime = now;
      gyroConfirmed = true; // freefall + impact = skip gyro requirement
      freefallStart = 0;
      freefallConfirmed = false;
      stillStartTime = 0;
      return;
    }

    // Reset freefall if magnitude is normal and no freefall was confirmed
    freefallStart = 0;
    freefallConfirmed = false;

    // Normal spike detection (Path A)
    if (mag > activeProfile.accelSpikeThreshold) {
      spikeTime = now;
      // Check if gyro was recently high (rotation happened just before impact)
      gyroConfirmed = !gyroscopeAvailable || now - lastHighGyroTime < activeProfile.gyroWindowMs;
      stillStartTime = 0;
    }
    return;
  }

  // ── After spike detected ──

  // Timeout – reset if too long after spike
  if (now - spikeTime > activeProfile.spikeToStillMaxMs) {
    reset();
    return;
  }

  // Stillness check (after gyro confirmed or freefall path)
  if (gyroConfirmed) {
    const diff = Math.abs(mag - 1);
    if (diff < activeProfile.stillnessToleranceG) {
      // Expo Accelerometer reports in g-force, so "still" means magnitude close to 1 g.
      if (stillStartTime === 0) stillStartTime = now;
      if (now - stillStartTime >= activeProfile.stillnessWindowMs) {
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
  if (!gyroscopeAvailable) return;

  const now = Date.now();
  const rate = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);

  if (rate > activeProfile.gyroRapidThreshold) {
    lastHighGyroTime = now;
    // If spike already detected but gyro not yet confirmed (Path A)
    if (spikeTime > 0 && !gyroConfirmed) {
      gyroConfirmed = true;
    }
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

export async function getFallDetectionDiagnostics() {
  activeProfile = selectFallDetectionProfile();

  const [accel, gyro] = await Promise.all([
    Accelerometer.isAvailableAsync().catch(() => false),
    Gyroscope.isAvailableAsync().catch(() => false),
  ]);

  accelerometerAvailable = accel;
  gyroscopeAvailable = gyro;

  return {
    accelerometerAvailable: accel,
    gyroscopeAvailable: gyro,
    deviceModel: activeDeviceModel,
    profileName: activeProfile.name,
    sensorIntervalMs: activeProfile.sensorIntervalMs,
    isRunning,
    backgroundServiceRunning: bgRunning,
  };
}

export function triggerFallDetectionTest() {
  onFallDetected?.();
}

export async function startFallDetection(
  callback: () => void,
): Promise<boolean> {
  if (isRunning) return true;

  onFallDetected = callback;
  reset();

  const diagnostics = await getFallDetectionDiagnostics();
  if (!diagnostics.accelerometerAvailable) {
    console.warn("[FallDetection] Accelerometer unavailable on this device");
    onFallDetected = null;
    return false;
  }
  if (!diagnostics.gyroscopeAvailable) {
    console.warn("[FallDetection] Gyroscope unavailable; using accelerometer-only fallback");
  }

  Accelerometer.setUpdateInterval(activeProfile.sensorIntervalMs);
  if (gyroscopeAvailable) {
    Gyroscope.setUpdateInterval(activeProfile.sensorIntervalMs);
  }

  accelSub = Accelerometer.addListener(handleAccelData);
  gyroSub = gyroscopeAvailable ? Gyroscope.addListener(handleGyroData) : null;
  isRunning = true;

  // Start background foreground-service to keep sensors alive
  await startBackgroundService();

  // Re-attach sensors when app returns to foreground (Android may suspend them)
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active" && isRunning) {
      // Re-ensure sensors are attached
      if (!accelSub) {
        Accelerometer.setUpdateInterval(activeProfile.sensorIntervalMs);
        accelSub = Accelerometer.addListener(handleAccelData);
      }
      if (gyroscopeAvailable && !gyroSub) {
        Gyroscope.setUpdateInterval(activeProfile.sensorIntervalMs);
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
