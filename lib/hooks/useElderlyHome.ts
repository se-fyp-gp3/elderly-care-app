import { useCallback, useState } from "react";
import { useElderlyProfile } from "./useElderlyProfile";
import { useMedications } from "./useMedications";
import { useSchedules } from "./useSchedules";

/**
 * Custom hook that combines profile, medications, and schedules
 * for the elderly home dashboard.
 *
 * This is a composite hook that orchestrates multiple data sources
 * and provides a unified interface for the home screen.
 */
export function useElderlyHome() {
  const [refreshing, setRefreshing] = useState(false);

  const {
    profile,
    name,
    isLoading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useElderlyProfile();

  const {
    medications,
    pendingMedications,
    isLoading: medicationsLoading,
    error: medicationsError,
    refetch: refetchMedications,
  } = useMedications({ limit: 10 });

  const {
    schedules,
    upcomingSchedules,
    isLoading: schedulesLoading,
    error: schedulesError,
    refetch: refetchSchedules,
    getStatusColor,
  } = useSchedules({ limit: 10 });

  /** Combined loading state */
  const isLoading = profileLoading || medicationsLoading || schedulesLoading;

  /** Combined error state */
  const error = profileError || medicationsError || schedulesError;

  /** Unified refresh for pull-to-refresh */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfile(),
      refetchMedications(),
      refetchSchedules(),
    ]);
    setRefreshing(false);
  }, [refreshProfile, refetchMedications, refetchSchedules]);

  /** Quick actions for the home screen */
  const quickActions = [
    {
      icon: "pill" as const,
      label: "My Medications",
      color: "#4CAF50",
      route: "medication",
      badge:
        pendingMedications.length > 0 ? pendingMedications.length : undefined,
    },
    {
      icon: "heart-pulse" as const,
      label: "My Health",
      color: "#F44336",
      route: "health-data",
    },
    {
      icon: "calendar-clock" as const,
      label: "My Schedule",
      color: "#2196F3",
      route: "schedule",
      badge:
        upcomingSchedules.length > 0 ? upcomingSchedules.length : undefined,
    },
    {
      icon: "phone-alert" as const,
      label: "Emergency",
      color: "#FF9800",
      route: "emergency",
    },
  ];

  return {
    /** Elderly profile */
    profile,
    /** Display name */
    name,
    /** All medications (limited to 10) */
    medications,
    /** Pending medications */
    pendingMedications,
    /** All schedules (limited to 10) */
    schedules,
    /** Upcoming schedules */
    upcomingSchedules,
    /** Quick action buttons config */
    quickActions,
    /** Combined loading state */
    isLoading,
    /** Refreshing state for pull-to-refresh */
    refreshing,
    /** First error encountered */
    error,
    /** Unified refresh handler */
    onRefresh,
    /** Get schedule status color */
    getStatusColor,
  };
}
