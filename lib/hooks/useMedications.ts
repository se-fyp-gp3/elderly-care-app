import { ElderlyMedication, ElderlyMedicationStatus } from "@/types/appwrite";
import { useCallback, useEffect, useState } from "react";
import { Query } from "react-native-appwrite";
import {
  DATABASE_ID,
  ELDERLY_MEDICATION_TABLE_ID,
  tablesDB,
} from "../appwrite";
import { useAuth } from "../auth-context";
import { getElderlyByUserId } from "../elderly";

interface UseMedicationsOptions {
  /** Maximum number of medications to fetch. Default: 50 */
  limit?: number;
  /** Auto-fetch on mount. Default: true */
  autoFetch?: boolean;
}

/**
 * Custom hook to fetch and manage medications for the current elderly user.
 * Provides filtering helpers and refresh functionality.
 */
export function useMedications(options: UseMedicationsOptions = {}) {
  const { limit = 50, autoFetch = true } = options;
  const { user } = useAuth();

  const [medications, setMedications] = useState<ElderlyMedication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMedications = useCallback(async () => {
    if (!user) {
      setMedications([]);
      setIsLoading(false);
      return;
    }

    setError(null);

    try {
      const profile = await getElderlyByUserId(user.$id);

      if (profile) {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          queries: [Query.limit(limit), Query.orderDesc("$createdAt")],
        });
        setMedications(response.rows as unknown as ElderlyMedication[]);
      } else {
        setMedications([]);
      }
    } catch (err) {
      console.error("Error fetching medications:", err);
      setError("Failed to load medications");
      setMedications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetchMedications();
    }
  }, [fetchMedications, autoFetch]);

  /** Pull-to-refresh handler */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMedications();
    setRefreshing(false);
  }, [fetchMedications]);

  /** Get pending medications (not completed) */
  const pendingMedications = medications.filter(
    (m) => m.status !== ElderlyMedicationStatus.COMPLETED,
  );

  /** Get completed medications */
  const completedMedications = medications.filter(
    (m) => m.status === ElderlyMedicationStatus.COMPLETED,
  );

  /** Get PRN (as needed) medications */
  const prnMedications = medications.filter((m) => m.is_prn === true);

  /** Get regular (non-PRN) medications */
  const regularMedications = medications.filter((m) => m.is_prn !== true);

  return {
    /** All medications */
    medications,
    /** Filtered: pending medications */
    pendingMedications,
    /** Filtered: completed medications */
    completedMedications,
    /** Filtered: PRN (as needed) medications */
    prnMedications,
    /** Filtered: regular scheduled medications */
    regularMedications,
    /** Loading state for initial fetch */
    isLoading,
    /** Refreshing state for pull-to-refresh */
    refreshing,
    /** Error message if fetch failed */
    error,
    /** Refresh function for pull-to-refresh */
    onRefresh,
    /** Manual fetch trigger */
    refetch: fetchMedications,
    /** Total count */
    count: medications.length,
    /** Pending count */
    pendingCount: pendingMedications.length,
  };
}
