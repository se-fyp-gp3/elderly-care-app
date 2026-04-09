import { Account, Client } from "appwrite";
import {
  Account as AccountReactNative,
  Client as ClientReactNative,
  Functions,
  ID,
  Storage,
  TablesDB,
} from "react-native-appwrite";

export const APPWRITE_ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT!;
export const APPWRITE_PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID!;
const APPWRITE_PLATFORM = process.env.EXPO_PUBLIC_APPWRITE_PLATFORM!;
const APPWRITE_DEV_KEY = process.env.EXPO_PRIVATE_APPWRITE_DEV_KEY!;

export const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setDevKey(APPWRITE_DEV_KEY);

export const clientReactNative = new ClientReactNative()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setPlatform(APPWRITE_PLATFORM)
  .setDevKey(APPWRITE_DEV_KEY);

export const account = new AccountReactNative(clientReactNative);
export const accountWeb = new Account(client);
export const tablesDB = new TablesDB(clientReactNative);
export const functions = new Functions(clientReactNative);
export const storage = new Storage(clientReactNative);
export { ID };

export const VOICE_MESSAGES_BUCKET_ID = "voice-messages";
export const CUSTOM_VOICE_TABLE_ID =
  process.env.EXPO_PUBLIC_CUSTOM_VOICE_TABLE_ID || "custom_voice";
export const MOMENTS_MEDIA_BUCKET_ID =
  process.env.EXPO_PUBLIC_MOMENTS_MEDIA_BUCKET_ID || "moments-media";

export const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID!;
export const ELDERLY_TABLE_ID = process.env.EXPO_PUBLIC_ELDERLY_TABLE_ID!;
export const CAREGIVER_TABLE_ID = process.env.EXPO_PUBLIC_CAREGIVER_TABLE_ID!;
export const CAREGIVER_ELDERLY_TABLE_ID =
  process.env.EXPO_PUBLIC_CAREGIVER_ELDERLY_TABLE_ID!;
export const ELDERLY_MEDICATION_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_MEDICATION_TABLE_ID!;
export const HEALTH_DATA_TABLE_ID =
  process.env.EXPO_PUBLIC_HEALTH_DATA_TABLE_ID!;
export const MEDICATION_TABLE_ID = process.env.EXPO_PUBLIC_MEDICATION_TABLE_ID!;
export const ELDERLY_MEDICATION_REMINDER_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_MEDICATION_REMINDER_TABLE_ID!;
export const SCHEDULE_TABLE_ID = process.env.EXPO_PUBLIC_SCHEDULE_TABLE_ID!;
export const SCHEDULE_CATEGORY_TABLE_ID =
  process.env.EXPO_PUBLIC_SCHEDULE_CATEGORY_TABLE_ID!;
export const SCHEDULE_MEDICATION_TABLE_ID =
  process.env.EXPO_PUBLIC_SCHEDULE_MEDICATION_TABLE_ID!;
export const MEDICATION_LOGS_TABLE_ID =
  process.env.EXPO_PUBLIC_MEDICATION_LOGS_TABLE_ID!;
export const CHAT_SESSION_TABLE_ID =
  process.env.EXPO_PUBLIC_CHAT_SESSIONS_TABLE_ID!;
export const DIRECT_MESSAGES_TABLE_ID =
  process.env.EXPO_PUBLIC_DIRECT_MESSAGES_TABLE_ID!;
export const REGISTRATION_REQUESTS_TABLE_ID =
  process.env.EXPO_PUBLIC_REGISTRATION_REQUESTS_TABLE_ID!;
export const ELDERLY_DAILY_STEPS_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_DAILY_STEPS_TABLE_ID!;
export const ELDERLY_CONNECTIONS_TABLE_ID =
  process.env.EXPO_PUBLIC_ELDERLY_CONNECTIONS_TABLE_ID!;
export const CAREGIVER_CONNECTIONS_TABLE_ID =
  process.env.EXPO_PUBLIC_CAREGIVER_CONNECTIONS_TABLE_ID || "caregiver_connections";

export const MOMENTS_TABLE_ID = process.env.EXPO_PUBLIC_MOMENTS_TABLE_ID || "moments";
export const MOMENTS_COMMENTS_TABLE_ID = process.env.EXPO_PUBLIC_MOMENTS_COMMENTS_TABLE_ID || "moments_comments";
export const EMERGENCY_ALERTS_TABLE_ID = process.env.EXPO_PUBLIC_EMERGENCY_ALERTS_TABLE_ID || "emergency_alerts";

export const ROLE_MANAGEMENT_FUNCTION_ID =
  process.env.EXPO_PUBLIC_ROLE_MANAGEMENT_FUNCTION_ID!;
export const VOICE_CLONE_FUNCTION_ID =
  process.env.EXPO_PUBLIC_VOICE_CLONE_FUNCTION_ID!;

export interface RealtimeResponse {
  events: string[];
  payload: any;
}

/**
 * Safe wrapper around `clientReactNative.subscribe` that catches
 * INVALID_STATE_ERR thrown when the WebSocket is not yet open
 * (e.g. during rapid page transitions). On failure it retries once
 * after a short delay.  Also patches the global error handler so
 * that the SDK's internal WebSocket-ping INVALID_STATE_ERR is
 * silently swallowed instead of crashing / flooding the console.
 */
let _wsPatchApplied = false;
function patchWebSocketErrors() {
  if (_wsPatchApplied) return;
  _wsPatchApplied = true;

  const _origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data: string | ArrayBuffer | Blob | ArrayBufferView) {
    if (this.readyState !== WebSocket.OPEN) return;
    try {
      return _origSend.call(this, data);
    } catch {
      // Silently ignore INVALID_STATE_ERR from stale WebSocket
    }
  };                                                  
}

export function safeSubscribe(
  channel: string,
  callback: (response: RealtimeResponse) => void,
): () => void {
  patchWebSocketErrors();

  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  const doSubscribe = () => {
    if (disposed) return;
    try {
      unsubscribe = clientReactNative.subscribe(channel, callback);
    } catch (err: any) {
      console.warn("[Realtime] subscribe failed, retrying in 1s:", err?.message);
      const timer = setTimeout(() => {
        if (disposed) return;
        try {
          unsubscribe = clientReactNative.subscribe(channel, callback);
        } catch (retryErr) {
          console.warn("[Realtime] retry also failed:", retryErr);
        }
      }, 1000);
      // If cleanup runs before retry fires, cancel it
      unsubscribe = () => clearTimeout(timer);
    }
  };

  doSubscribe();

  return () => {
    disposed = true;
    try {
      unsubscribe?.();
    } catch {
      // Ignore errors during unsubscribe
    }
  };
}
