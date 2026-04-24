import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { performStepSync } from "./step-sync";

export const STEP_SYNC_BACKGROUND_TASK = "STEP_SYNC_BACKGROUND_TASK";
export const STEP_SYNC_BACKGROUND_MIN_INTERVAL_MINUTES = 15;

const STEP_SYNC_BACKGROUND_CONFIG_KEY = "step-sync-background-config";

type StoredStepSyncConfig = {
  elderlyId: string;
  enabled: boolean;
};

async function readStoredConfig(): Promise<StoredStepSyncConfig | null> {
  try {
    const rawValue = await AsyncStorage.getItem(STEP_SYNC_BACKGROUND_CONFIG_KEY);
    if (!rawValue) return null;
    return JSON.parse(rawValue) as StoredStepSyncConfig;
  } catch (error) {
    console.warn("[StepBackgroundSync] Failed to read stored config", error);
    return null;
  }
}

async function writeStoredConfig(config: StoredStepSyncConfig | null): Promise<void> {
  try {
    if (!config) {
      await AsyncStorage.removeItem(STEP_SYNC_BACKGROUND_CONFIG_KEY);
      return;
    }

    await AsyncStorage.setItem(
      STEP_SYNC_BACKGROUND_CONFIG_KEY,
      JSON.stringify(config),
    );
  } catch (error) {
    console.warn("[StepBackgroundSync] Failed to persist config", error);
  }
}

if (!TaskManager.isTaskDefined(STEP_SYNC_BACKGROUND_TASK)) {
  TaskManager.defineTask(STEP_SYNC_BACKGROUND_TASK, async () => {
    try {
      const config = await readStoredConfig();
      if (!config?.enabled || !config.elderlyId) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      const result = await performStepSync(config.elderlyId, {
        force: true,
        minIntervalMs: 0,
      });

      return result.success
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Failed;
    } catch (error) {
      console.error("[StepBackgroundSync] Background worker failed", error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

async function canUseBackgroundTaskApi(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) return false;

  const status = await BackgroundTask.getStatusAsync();
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}

export async function enableStepBackgroundSync(elderlyId: string): Promise<boolean> {
  if (!elderlyId) return false;

  const available = await canUseBackgroundTaskApi();
  await writeStoredConfig({ elderlyId, enabled: available });

  if (!available) {
    return false;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    STEP_SYNC_BACKGROUND_TASK,
  );

  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(STEP_SYNC_BACKGROUND_TASK, {
      minimumInterval: STEP_SYNC_BACKGROUND_MIN_INTERVAL_MINUTES,
    });
  }

  return true;
}

export async function disableStepBackgroundSync(): Promise<void> {
  await writeStoredConfig(null);

  if (Platform.OS === "web") return;

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    STEP_SYNC_BACKGROUND_TASK,
  );

  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(STEP_SYNC_BACKGROUND_TASK);
  }
}

export async function getStepBackgroundSyncState(): Promise<{
  available: boolean;
  registered: boolean;
}> {
  const available = await canUseBackgroundTaskApi();
  const registered = available
    ? await TaskManager.isTaskRegisteredAsync(STEP_SYNC_BACKGROUND_TASK)
    : false;

  return { available, registered };
}