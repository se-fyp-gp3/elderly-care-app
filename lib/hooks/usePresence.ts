import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "../auth-context";
import { getCaregiverByUserId } from "../caregiver";
import { getElderlyByUserId } from "../elderly";
import { HEARTBEAT_INTERVAL_MS, updatePresence } from "../presence";

/**
 * Maintains a periodic "heartbeat" that writes the current time to the user's
 * `last_active` field while the app is in the foreground.
 *
 * Place this hook once in each tab-layout so it runs whenever the user has
 * the app open.
 *
 * Behaviour:
 *  - Immediately pings on mount and whenever the app returns to the foreground.
 *  - Sends a heartbeat every HEARTBEAT_INTERVAL_MS (30 s) while active.
 *  - Stops the interval when the app goes to the background (the last ping
 *    will have been ≤30 s ago, so the user naturally times out after
 *    ONLINE_THRESHOLD_MS seconds of inactivity).
 */
export function usePresence() {
  const { user, preferences } = useAuth();
  const role = preferences.role as "elderly" | "caregiver" | undefined;

  const profileIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve the profile document ID once (cached in ref).
  useEffect(() => {
    if (!user || !role) return;

    let cancelled = false;

    (async () => {
      try {
        if (role === "elderly") {
          const profile = await getElderlyByUserId(user.$id);
          if (!cancelled && profile) profileIdRef.current = profile.$id;
        } else {
          const profile = await getCaregiverByUserId(user.$id);
          if (!cancelled && profile) profileIdRef.current = profile.$id;
        }

        // Send the first heartbeat as soon as we know who we are.
        if (!cancelled && profileIdRef.current) {
          updatePresence(profileIdRef.current, role);
        }
      } catch {
        // Profile lookup failed — nothing we can do.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, role]);

  // Heartbeat interval + AppState listener
  useEffect(() => {
    if (!role) return;

    const ping = () => {
      if (profileIdRef.current) {
        updatePresence(profileIdRef.current, role);
      }
    };

    // Start the heartbeat interval
    const startInterval = () => {
      stopInterval();
      intervalRef.current = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        ping(); // immediate ping on resume
        startInterval();
      } else {
        stopInterval();
      }
    };

    // Only run while the app is currently active
    if (AppState.currentState === "active") {
      startInterval();
    }

    const subscription = AppState.addEventListener("change", handleAppState);

    return () => {
      stopInterval();
      subscription.remove();
    };
  }, [role]);
}
