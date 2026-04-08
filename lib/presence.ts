import { formatRelativeTime } from "./contacts";
import {
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  ELDERLY_TABLE_ID,
  tablesDB,
} from "./appwrite";

/** How often we ping the server while the app is in the foreground. */
export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * If a user's last_active is older than this, they are considered offline.
 * Should be > HEARTBEAT_INTERVAL_MS to tolerate network jitter.
 */
export const ONLINE_THRESHOLD_MS = 90_000; // 90 seconds

/**
 * Update the current user's `last_active` timestamp in their profile document.
 * Called periodically by the heartbeat hook and on key user actions (e.g. sending a message).
 */
export async function updatePresence(
  profileId: string,
  role: "elderly" | "caregiver",
): Promise<void> {
  const tableId = role === "elderly" ? ELDERLY_TABLE_ID : CAREGIVER_TABLE_ID;
  try {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId,
      rowId: profileId,
      data: { last_active: new Date().toISOString() },
    });
  } catch (error) {
    // Silently swallow — heartbeat failures should not crash the app
    console.warn("Presence update failed:", error);
  }
}

/**
 * Determine whether a user should be shown as "online" based on their
 * last_active timestamp.
 */
export function isUserOnline(lastActive?: string | null): boolean {
  if (!lastActive) return false;
  try {
    return Date.now() - new Date(lastActive).getTime() < ONLINE_THRESHOLD_MS;
  } catch {
    return false;
  }
}

/**
 * Human-readable description of a user's presence.
 * @param lastActive  ISO-8601 timestamp (or null/undefined)
 * @param t           i18next translation function
 */
export function formatPresence(
  lastActive: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!lastActive) return "";
  if (isUserOnline(lastActive)) return t("common.online");
  return t("common.lastSeen", { time: formatRelativeTime(lastActive) });
}
