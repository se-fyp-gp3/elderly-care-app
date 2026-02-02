import { Schedule, ScheduleStatus } from "@/types/appwrite";
import { useCallback, useEffect, useState } from "react";
import { Query } from "react-native-appwrite";
import { DATABASE_ID, SCHEDULE_TABLE_ID, tablesDB } from "../appwrite";
import { useAuth } from "../auth-context";
import { getElderlyByUserId } from "../elderly";

interface UseSchedulesOptions {
  /** Maximum number of schedules to fetch. Default: 50 */
  limit?: number;
  /** Auto-fetch on mount. Default: true */
  autoFetch?: boolean;
}

/**
 * Custom hook to fetch and manage schedules for the current elderly user.
 * Provides filtering by status and refresh functionality.
 */
export function useSchedules(options: UseSchedulesOptions = {}) {
  const { limit = 50, autoFetch = true } = options;
  const { user } = useAuth();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!user) {
      setSchedules([]);
      setIsLoading(false);
      return;
    }

    setError(null);

    try {
      const profile = await getElderlyByUserId(user.$id);

      if (profile) {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: SCHEDULE_TABLE_ID,
          queries: [Query.limit(limit), Query.orderDesc("$createdAt")],
        });
        setSchedules(response.rows as unknown as Schedule[]);
      } else {
        setSchedules([]);
      }
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setError("Failed to load schedules");
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetchSchedules();
    }
  }, [fetchSchedules, autoFetch]);

  /** Pull-to-refresh handler */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSchedules();
    setRefreshing(false);
  }, [fetchSchedules]);

  /** Get upcoming schedules (pending) */
  const upcomingSchedules = schedules.filter(
    (s) =>
      s.status !== ScheduleStatus.COMPLETED &&
      s.status !== ScheduleStatus.MISSED,
  );

  /** Get completed schedules */
  const completedSchedules = schedules.filter(
    (s) => s.status === ScheduleStatus.COMPLETED,
  );

  /** Get missed schedules */
  const missedSchedules = schedules.filter(
    (s) => s.status === ScheduleStatus.MISSED,
  );

  /** Get past schedules (completed or missed) */
  const pastSchedules = schedules.filter(
    (s) =>
      s.status === ScheduleStatus.COMPLETED ||
      s.status === ScheduleStatus.MISSED,
  );

  /** Get status color for UI */
  const getStatusColor = (status: ScheduleStatus | string | null): string => {
    switch (status) {
      case ScheduleStatus.COMPLETED:
        return "#4CAF50";
      case ScheduleStatus.MISSED:
        return "#F44336";
      case ScheduleStatus.PENDING:
      default:
        return "#2196F3";
    }
  };

  return {
    /** All schedules */
    schedules,
    /** Filtered: upcoming/pending schedules */
    upcomingSchedules,
    /** Filtered: completed schedules */
    completedSchedules,
    /** Filtered: missed schedules */
    missedSchedules,
    /** Filtered: past schedules (completed + missed) */
    pastSchedules,
    /** Loading state for initial fetch */
    isLoading,
    /** Refreshing state for pull-to-refresh */
    refreshing,
    /** Error message if fetch failed */
    error,
    /** Refresh function for pull-to-refresh */
    onRefresh,
    /** Manual fetch trigger */
    refetch: fetchSchedules,
    /** Helper: get status color */
    getStatusColor,
    /** Total count */
    count: schedules.length,
    /** Upcoming count */
    upcomingCount: upcomingSchedules.length,
  };
}
