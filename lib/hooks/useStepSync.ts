/**
 * useStepSync Hook
 *
 * Manages step data synchronization for elderly users:
 * - Auto-sync every 30 minutes after app start
 * - Manual sync via button press
 * - Health API authorization flow
 * - Step count display state
 *
 * Designed for elderly users — provides clear loading/error states
 * and haptic feedback for manual interactions.
 */

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useAuth } from "../auth-context";
import { enableStepBackgroundSync } from "../background-step-sync";
import { getElderlyByUserId } from "../elderly";
import {
    DailyStepRecord,
    getStepHistory,
    getTodayStepRecord,
    performStepSync,
    requestHealthAuthorization,
    STEP_SYNC_INTERVAL_MS,
    StepDataSource,
} from "../step-sync";

export interface UseStepSyncReturn {
  /** Today's step count */
  todaySteps: number;
  /** Whether the step data is currently loading */
  isLoading: boolean;
  /** Whether a sync operation is in progress */
  isSyncing: boolean;
  /** Whether health API is authorized */
  isAuthorized: boolean;
  /** Error message if any */
  error: string | null;
  /** Last successful sync time (ISO string) */
  lastSyncTime: string | null;
  /** Data source name */
  source: StepDataSource | null;
  /** Step history records */
  stepHistory: DailyStepRecord[];
  /** Manually trigger step sync (for button press) */
  manualSync: () => Promise<void>;
  /** Silent sync for route/app lifecycle events */
  silentSync: (force?: boolean) => Promise<void>;
  /** Request health API authorization */
  authorize: () => Promise<boolean>;
  /** Refresh step history */
  refreshHistory: () => Promise<void>;
}

export function useStepSync(): UseStepSyncReturn {
  const { user } = useAuth();

  // State
  const [elderlyId, setElderlyId] = useState<string | null>(null);
  const [todaySteps, setTodaySteps] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [source, setSource] = useState<StepDataSource | null>(null);
  const [stepHistory, setStepHistory] = useState<DailyStepRecord[]>([]);

  // Refs for timer management
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Resolve elderlyId from current user ────────────────────

  useEffect(() => {
    async function resolveElderlyId() {
      if (!user) {
        setElderlyId(null);
        setIsLoading(false);
        return;
      }

      try {
        const profile = await getElderlyByUserId(user.$id);
        if (profile) {
          setElderlyId(profile.$id);
        } else {
          setElderlyId(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[useStepSync] Error resolving elderlyId:", err);
        setElderlyId(null);
        setIsLoading(false);
      }
    }

    resolveElderlyId();
  }, [user]);

  // ── Load existing step data from Appwrite ──────────────────

  const loadTodaySteps = useCallback(async () => {
    if (!elderlyId) return;

    try {
      const record = await getTodayStepRecord(elderlyId);
      if (record) {
        setTodaySteps(record.steps);
        setLastSyncTime(record.lastUpdated);
        setSource(record.source as StepDataSource);
      }
    } catch (err) {
      console.error("[useStepSync] Error loading today's steps:", err);
    } finally {
      setIsLoading(false);
    }
  }, [elderlyId]);

  useEffect(() => {
    if (elderlyId) {
      loadTodaySteps();
    }
  }, [elderlyId, loadTodaySteps]);

  // ── Load step history ──────────────────────────────────────

  const refreshHistory = useCallback(async () => {
    if (!elderlyId) return;

    try {
      const history = await getStepHistory(elderlyId, 30);
      setStepHistory(history);
    } catch (err) {
      console.error("[useStepSync] Error loading step history:", err);
    }
  }, [elderlyId]);

  useEffect(() => {
    if (elderlyId) {
      refreshHistory();
    }
  }, [elderlyId, refreshHistory]);

  // ── Health API Authorization ───────────────────────────────

  const authorize = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const granted = await requestHealthAuthorization();
      setIsAuthorized(granted);

      if (!granted) {
        setError(
          Platform.OS === "android"
            ? "Please allow Health Connect permissions to track steps"
            : "Please allow health data access to track steps",
        );
      }

      if (granted && elderlyId) {
        await enableStepBackgroundSync(elderlyId);
      }

      return granted;
    } catch (err: any) {
      console.error("[useStepSync] Authorization error:", err);
      setError("Unable to obtain health data permission");
      setIsAuthorized(false);
      return false;
    }
  }, []);

  // ── Core Sync Logic ────────────────────────────────────────

  const doSync = useCallback(
    async (
      options: { silent?: boolean; force?: boolean } = {},
    ) => {
      const { silent = false, force = false } = options;

      if (!elderlyId) return;
      if (!silent && isSyncing) return;
      if (!isAuthorized) return;

      if (!silent) {
        setIsSyncing(true);
        setError(null);
      }

      try {
        const result = await performStepSync(elderlyId, { force });

        if (result.success) {
          setTodaySteps(result.steps);
          setSource(result.source);
          if (result.lastUpdated) {
            setLastSyncTime(result.lastUpdated);
          }
          setError(null);

          if (!result.skipped) {
            refreshHistory();
          }
        } else {
          if (!silent) {
            setError(result.error || "Step sync failed");
          }
        }
      } catch (err: any) {
        console.error("[useStepSync] Sync error:", err);
        if (!silent) {
          setError("Step sync failed. Please try again later.");
        }
      } finally {
        if (!silent) {
          setIsSyncing(false);
        }
      }
    },
    [elderlyId, isAuthorized, isSyncing, refreshHistory],
  );

  // ── Manual Sync (with haptic feedback for elderly users) ──

  const manualSync = useCallback(async () => {
    // Haptic feedback when button is pressed — important for elderly UX
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics not available on all devices
    }

    // First ensure we're authorized
    if (!isAuthorized) {
      const granted = await authorize();
      if (!granted) return;
    }

    await doSync({ silent: false, force: true });

    // Success haptic feedback
    try {
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
    } catch {
      // Haptics not available
    }
  }, [isAuthorized, authorize, doSync]);

  const silentSync = useCallback(
    async (force: boolean = false) => {
      await doSync({ silent: true, force });
    },
    [doSync],
  );

  // ── Auto-Sync Timer (every 10 minutes) ─────────────────────

  useEffect(() => {
    if (!elderlyId || !isAuthorized) return;

    // Initial sync when first authorized
    doSync({ silent: true });

    // Set up 10-minute interval
    syncTimerRef.current = setInterval(() => {
      console.log("[useStepSync] Auto-sync triggered (10-min interval)");
      doSync({ silent: true });
    }, STEP_SYNC_INTERVAL_MS);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elderlyId, isAuthorized]);

  // ── App State Listener (sync on foreground return) ─────────

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        // Trigger sync when app comes back to foreground
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active" &&
          elderlyId &&
          isAuthorized
        ) {
          console.log(
            "[useStepSync] App returned to foreground → syncing steps",
          );
          doSync({ silent: true });
        }
        appStateRef.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [elderlyId, isAuthorized, doSync]);

  return {
    todaySteps,
    isLoading,
    isSyncing,
    isAuthorized,
    error,
    lastSyncTime,
    source,
    stepHistory,
    manualSync,
    silentSync,
    authorize,
    refreshHistory,
  };
}
