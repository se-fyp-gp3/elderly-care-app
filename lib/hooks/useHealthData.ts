import { HealthData } from "@/types/appwrite";
import { useCallback, useEffect, useState } from "react";
import { Query } from "react-native-appwrite";
import { DATABASE_ID, HEALTH_DATA_TABLE_ID, tablesDB } from "../appwrite";
import { useAuth } from "../auth-context";
import { getElderlyByUserId } from "../elderly";

interface UseHealthDataOptions {
  /** Maximum number of records to fetch. Default: 50 */
  limit?: number;
  /** Auto-fetch on mount. Default: true */
  autoFetch?: boolean;
}

interface HealthMetric {
  icon: string;
  label: string;
  value: string;
  color: string;
  type: string;
}

/**
 * Custom hook to fetch and manage health data for the current elderly user.
 * Provides health metrics summary and record management.
 */
export function useHealthData(options: UseHealthDataOptions = {}) {
  const { limit = 50, autoFetch = true } = options;
  const { user } = useAuth();

  const [healthData, setHealthData] = useState<HealthData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = useCallback(async () => {
    if (!user) {
      setHealthData([]);
      setIsLoading(false);
      return;
    }

    setError(null);

    try {
      const profile = await getElderlyByUserId(user.$id);

      if (profile) {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: HEALTH_DATA_TABLE_ID,
          queries: [Query.limit(limit), Query.orderDesc("$createdAt")],
        });
        setHealthData(response.rows as unknown as HealthData[]);
      } else {
        setHealthData([]);
      }
    } catch (err) {
      console.error("Error fetching health data:", err);
      setError("Failed to load health data");
      setHealthData([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetchHealthData();
    }
  }, [fetchHealthData, autoFetch]);

  /** Pull-to-refresh handler */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHealthData();
    setRefreshing(false);
  }, [fetchHealthData]);

  /** Get records by type */
  const getRecordsByType = useCallback(
    (type: string): HealthData[] => {
      return healthData.filter((record) => record.type === type);
    },
    [healthData],
  );

  /** Get the latest record of a specific type */
  const getLatestByType = useCallback(
    (type: string): HealthData | null => {
      const records = getRecordsByType(type);
      return records.length > 0 ? records[0] : null;
    },
    [getRecordsByType],
  );

  /** Default health metrics with icons */
  const defaultMetrics: HealthMetric[] = [
    {
      icon: "heart-pulse",
      label: "Heart Rate",
      value: "-- bpm",
      color: "#F44336",
      type: "heart_rate",
    },
    {
      icon: "thermometer",
      label: "Temperature",
      value: "-- °C",
      color: "#FF9800",
      type: "temperature",
    },
    {
      icon: "water",
      label: "Blood Pressure",
      value: "--/-- mmHg",
      color: "#2196F3",
      type: "blood_pressure",
    },
    {
      icon: "scale-bathroom",
      label: "Weight",
      value: "-- kg",
      color: "#4CAF50",
      type: "weight",
    },
    {
      icon: "walk",
      label: "Steps Today",
      value: "-- steps",
      color: "#9C27B0",
      type: "steps",
    },
    {
      icon: "sleep",
      label: "Sleep",
      value: "-- hrs",
      color: "#3F51B5",
      type: "sleep",
    },
  ];

  /** Get recent records (last 5) */
  const recentRecords = healthData.slice(0, 5);

  return {
    /** All health data records */
    healthData,
    /** Recent records (last 5) */
    recentRecords,
    /** Default health metrics for display */
    defaultMetrics,
    /** Loading state for initial fetch */
    isLoading,
    /** Refreshing state for pull-to-refresh */
    refreshing,
    /** Error message if fetch failed */
    error,
    /** Refresh function for pull-to-refresh */
    onRefresh,
    /** Manual fetch trigger */
    refetch: fetchHealthData,
    /** Get records filtered by type */
    getRecordsByType,
    /** Get latest record of a specific type */
    getLatestByType,
    /** Total count */
    count: healthData.length,
  };
}
