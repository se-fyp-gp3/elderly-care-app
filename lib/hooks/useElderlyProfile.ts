import { Elderly } from "@/types/appwrite";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import { getElderlyByUserId } from "../elderly";

/**
 * Custom hook to fetch and manage the elderly profile for the current user.
 * Encapsulates profile loading state, error handling, and refresh logic.
 */
export function useElderlyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Elderly | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const elderlyProfile = await getElderlyByUserId(user.$id);
      setProfile(elderlyProfile);
    } catch (err) {
      console.error("Error fetching elderly profile:", err);
      setError("Failed to load profile");
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const refresh = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    refresh,
    /** Convenience getters */
    name: profile?.name ?? user?.name ?? "User",
    userId: user?.$id ?? null,
  };
}
