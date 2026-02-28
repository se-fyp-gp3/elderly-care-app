/**
 * useSteps — Bridge hook for step count feature.
 *
 * Responsibilities:
 *  - Input validation (elderlyId must be non-empty, steps non-negative).
 *  - Permission pre-check (login + pedometer permission).
 *  - Debounce manual refresh (1 second).
 *  - Throttle auto sync (30 minutes).
 *  - Error classification → user-friendly Chinese messages.
 *  - Formatted return value for the UI layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useAuth } from "../auth-context";
import { getElderlyByUserId } from "../elderly";
import {
  getStepPermissionStatus,
  getStepSource,
  getTodaySteps,
  isStepCountingAvailable,
  requestStepPermission,
  showPermissionDeniedAlert,
} from "../pedometer";
import {
  fetchRecentSteps,
  fetchStepsForDate,
  getTodayDateString,
  upsertDailySteps,
} from "../steps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepsSyncState {
  /** Current elderly profile $id, null when not yet resolved */
  elderlyId: string | null;
  /** Today's step count as last synced */
  todaySteps: number;
  /** ISO timestamp of last successful sync */
  lastSyncedAt: string | null;
  /** Whether a sync operation is in progress */
  isSyncing: boolean;
  /** Whether auto-sync is enabled */
  autoSyncEnabled: boolean;
  /** Whether pedometer hardware is available */
  isAvailable: boolean;
  /** Permission status */
  permissionStatus: "granted" | "denied" | "undetermined" | "checking";
  /** User-facing error message (Chinese), null when no error */
  errorMessage: string | null;
  /** Recent 7 days of step records for chart display */
  recentSteps: { date: string; steps: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MANUAL_DEBOUNCE_MS = 1000; // 1 second debounce for manual refresh

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSteps() {
  const { user } = useAuth();

  // Resolved elderly profile ID
  const [elderlyId, setElderlyId] = useState<string | null>(null);

  // Step data
  const [todaySteps, setTodaySteps] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [recentSteps, setRecentSteps] = useState<
    { date: string; steps: number }[]
  >([]);

  // UI state
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    "granted" | "denied" | "undetermined" | "checking"
  >("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for debounce / throttle
  const lastManualSyncRef = useRef(0);
  const lastAutoSyncRef = useRef(0);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Resolve elderlyId from current user
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setElderlyId(null);
        return;
      }
      try {
        const profile = await getElderlyByUserId(user.$id);
        if (!cancelled && profile) {
          setElderlyId(profile.$id);
        }
      } catch {
        if (!cancelled) setElderlyId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // -------------------------------------------------------------------------
  // Check availability & permissions on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const available = await isStepCountingAvailable();
      setIsAvailable(available);

      if (!available) {
        setPermissionStatus("denied");
        return;
      }

      const status = await getStepPermissionStatus();
      setPermissionStatus(status);
    })();
  }, []);

  // -------------------------------------------------------------------------
  // Core sync function
  // -------------------------------------------------------------------------
  const syncSteps = useCallback(
    async (silent = false): Promise<boolean> => {
      // --- Input validation ---
      if (!elderlyId) {
        if (!silent) setErrorMessage("用户信息尚未加载，请稍后重试。");
        return false;
      }

      if (permissionStatus !== "granted") {
        if (!silent) {
          setErrorMessage("步数权限未开启，请前往系统设置开启。");
          showPermissionDeniedAlert();
        }
        return false;
      }

      setIsSyncing(true);
      setErrorMessage(null);

      try {
        // 1. Get steps from device
        const steps = await getTodaySteps();

        // Validate non-negative
        const safeSteps = Math.max(0, Math.floor(steps));

        // 2. Upsert to Appwrite
        const date = getTodayDateString();
        const source = getStepSource();
        await upsertDailySteps(elderlyId, date, safeSteps, source);

        // 3. Update local state
        setTodaySteps(safeSteps);
        setLastSyncedAt(new Date().toISOString());

        // 4. Refresh recent steps for chart
        try {
          const recent = await fetchRecentSteps(elderlyId, 7);
          setRecentSteps(
            recent.map((r) => ({ date: r.date, steps: r.steps })),
          );
        } catch {
          // Non-critical — ignore chart refresh failure
        }

        return true;
      } catch (error: any) {
        console.error("syncSteps error:", error);

        // Classify error for user-friendly message
        const msg = error?.message ?? "";
        if (
          msg.includes("Network") ||
          msg.includes("network") ||
          msg.includes("fetch") ||
          msg.includes("Failed to fetch")
        ) {
          setErrorMessage("网络连接异常，请检查网络后重试。");
        } else if (msg.includes("permission") || msg.includes("auth")) {
          setErrorMessage("步数权限获取失败，请前往系统设置开启。");
        } else {
          setErrorMessage("步数数据获取失败，请稍后重试。");
        }

        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [elderlyId, permissionStatus],
  );

  // -------------------------------------------------------------------------
  // Manual refresh (debounced 1s)
  // -------------------------------------------------------------------------
  const manualSync = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    if (now - lastManualSyncRef.current < MANUAL_DEBOUNCE_MS) {
      return false; // debounced
    }
    lastManualSyncRef.current = now;
    return syncSteps(false);
  }, [syncSteps]);

  // -------------------------------------------------------------------------
  // Request permission flow
  // -------------------------------------------------------------------------
  const requestPermission = useCallback(async () => {
    const status = await requestStepPermission();
    setPermissionStatus(status);
    if (status === "denied") {
      showPermissionDeniedAlert();
    }
    return status;
  }, []);

  // -------------------------------------------------------------------------
  // Auto-sync timer (30 min interval)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!autoSyncEnabled || !elderlyId || permissionStatus !== "granted") {
      // Clear existing timer
      if (autoSyncTimerRef.current) {
        clearInterval(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      return;
    }

    // Initial sync on mount / when enabled
    const now = Date.now();
    if (now - lastAutoSyncRef.current > AUTO_SYNC_INTERVAL_MS) {
      lastAutoSyncRef.current = now;
      syncSteps(true);
    }

    // Set interval
    autoSyncTimerRef.current = setInterval(() => {
      const current = Date.now();
      if (current - lastAutoSyncRef.current >= AUTO_SYNC_INTERVAL_MS) {
        lastAutoSyncRef.current = current;
        syncSteps(true);
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      if (autoSyncTimerRef.current) {
        clearInterval(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [autoSyncEnabled, elderlyId, permissionStatus, syncSteps]);

  // -------------------------------------------------------------------------
  // Re-sync when app comes to foreground
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (
        nextState === "active" &&
        autoSyncEnabled &&
        elderlyId &&
        permissionStatus === "granted"
      ) {
        syncSteps(true);
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [autoSyncEnabled, elderlyId, permissionStatus, syncSteps]);

  // -------------------------------------------------------------------------
  // Load persisted data on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!elderlyId) return;

    let cancelled = false;
    (async () => {
      try {
        const date = getTodayDateString();
        const [todayRecord, recent] = await Promise.all([
          fetchStepsForDate(elderlyId, date),
          fetchRecentSteps(elderlyId, 7),
        ]);

        if (cancelled) return;

        if (todayRecord) {
          setTodaySteps(todayRecord.steps);
          setLastSyncedAt(todayRecord.lastUpdated);
        }

        setRecentSteps(
          recent.map((r: { date: string; steps: number }) => ({
            date: r.date,
            steps: r.steps,
          })),
        );
      } catch (err) {
        console.error("useSteps initial load error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [elderlyId]);

  // -------------------------------------------------------------------------
  // Toggles
  // -------------------------------------------------------------------------
  const toggleAutoSync = useCallback((enabled: boolean) => {
    setAutoSyncEnabled(enabled);
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------
  const state: StepsSyncState = {
    elderlyId,
    todaySteps,
    lastSyncedAt,
    isSyncing,
    autoSyncEnabled,
    isAvailable,
    permissionStatus,
    errorMessage,
    recentSteps,
  };

  return {
    ...state,
    manualSync,
    toggleAutoSync,
    requestPermission,
  };
}
