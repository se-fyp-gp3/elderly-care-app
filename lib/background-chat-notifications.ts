import type { DirectMessage, GroupMessage } from "@/types/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    DIRECT_MESSAGES_TABLE_ID,
    GROUP_MESSAGES_TABLE_ID,
    tablesDB,
} from "./appwrite";
import { getGroupsForUser } from "./groups";
import { sendImmediateNotification } from "./notifications";

export const CHAT_NOTIFICATIONS_BACKGROUND_TASK =
  "CHAT_NOTIFICATIONS_BACKGROUND_TASK";
export const CHAT_NOTIFICATIONS_BACKGROUND_MIN_INTERVAL_MINUTES = 15;

const CHAT_BACKGROUND_CONFIG_KEY = "chat-background-notifications-config";
const CHAT_BACKGROUND_STATE_KEY = "chat-background-notifications-state";
const MAX_SEEN_MESSAGE_IDS = 200;

type StoredChatBackgroundConfig = {
  profileId: string;
  enabled: boolean;
};

type StoredChatBackgroundState = {
  lastCheckedAt?: string;
  seenMessageIds: string[];
};

function buildSeenMessageId(kind: "direct" | "group", messageId: string): string {
  return `${kind}:${messageId}`;
}

async function readStoredConfig(): Promise<StoredChatBackgroundConfig | null> {
  try {
    const rawValue = await AsyncStorage.getItem(CHAT_BACKGROUND_CONFIG_KEY);
    if (!rawValue) return null;
    return JSON.parse(rawValue) as StoredChatBackgroundConfig;
  } catch (error) {
    console.warn("[ChatBackgroundNotifications] Failed to read config", error);
    return null;
  }
}

async function writeStoredConfig(
  config: StoredChatBackgroundConfig | null,
): Promise<void> {
  try {
    if (!config) {
      await AsyncStorage.removeItem(CHAT_BACKGROUND_CONFIG_KEY);
      return;
    }

    await AsyncStorage.setItem(
      CHAT_BACKGROUND_CONFIG_KEY,
      JSON.stringify(config),
    );
  } catch (error) {
    console.warn(
      "[ChatBackgroundNotifications] Failed to persist config",
      error,
    );
  }
}

async function readStoredState(): Promise<StoredChatBackgroundState> {
  try {
    const rawValue = await AsyncStorage.getItem(CHAT_BACKGROUND_STATE_KEY);
    if (!rawValue) {
      return { seenMessageIds: [] };
    }

    const parsed = JSON.parse(rawValue) as StoredChatBackgroundState;
    return {
      lastCheckedAt: parsed.lastCheckedAt,
      seenMessageIds: Array.isArray(parsed.seenMessageIds)
        ? parsed.seenMessageIds
        : [],
    };
  } catch (error) {
    console.warn("[ChatBackgroundNotifications] Failed to read state", error);
    return { seenMessageIds: [] };
  }
}

async function writeStoredState(
  state: StoredChatBackgroundState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CHAT_BACKGROUND_STATE_KEY,
      JSON.stringify({
        ...state,
        seenMessageIds: state.seenMessageIds.slice(-MAX_SEEN_MESSAGE_IDS),
      }),
    );
  } catch (error) {
    console.warn("[ChatBackgroundNotifications] Failed to persist state", error);
  }
}

async function markMessageAsSeenInternal(
  seenMessageId: string,
): Promise<void> {
  const state = await readStoredState();
  if (state.seenMessageIds.includes(seenMessageId)) {
    return;
  }

  state.seenMessageIds.push(seenMessageId);
  await writeStoredState(state);
}

export async function markDirectMessageNotificationSeen(
  messageId: string,
): Promise<void> {
  await markMessageAsSeenInternal(buildSeenMessageId("direct", messageId));
}

export async function markGroupMessageNotificationSeen(
  messageId: string,
): Promise<void> {
  await markMessageAsSeenInternal(buildSeenMessageId("group", messageId));
}

async function processDirectMessageNotifications(
  profileId: string,
  lastCheckedAt: string | undefined,
  seenMessageIds: Set<string>,
): Promise<string[]> {
  const queries = [
    Query.equal("receiver_id", profileId),
    Query.orderDesc("created_at"),
    Query.limit(20),
  ];

  if (lastCheckedAt) {
    queries.push(Query.greaterThan("created_at", lastCheckedAt));
  }

  const response = await tablesDB.listRows<DirectMessage>({
    databaseId: DATABASE_ID,
    tableId: DIRECT_MESSAGES_TABLE_ID,
    queries,
  });

  const notifiedIds: string[] = [];
  const messages = [...(response.rows as unknown as DirectMessage[])].reverse();
  for (const message of messages) {
    const seenId = buildSeenMessageId("direct", message.$id);
    if (seenMessageIds.has(seenId)) {
      continue;
    }

    await sendImmediateNotification(
      message.sender_name || "New Message",
      message.message_type === "voice"
        ? "Sent a voice message"
        : message.body || "Sent a message",
      {
        type: "direct_message",
        contactId: message.sender_id,
        contactName: message.sender_name,
        contactRole: message.sender_role,
      },
    );

    notifiedIds.push(seenId);
    seenMessageIds.add(seenId);
  }

  return notifiedIds;
}

async function processGroupMessageNotifications(
  profileId: string,
  lastCheckedAt: string | undefined,
  seenMessageIds: Set<string>,
): Promise<string[]> {
  const groups = await getGroupsForUser(profileId);
  if (!groups.length) {
    return [];
  }

  const groupIds = groups.map((group) => group.$id);
  const groupNameMap = new Map(groups.map((group) => [group.$id, group.name]));
  const queries = [
    Query.equal("group_id", groupIds),
    Query.notEqual("sender_id", profileId),
    Query.orderDesc("created_at"),
    Query.limit(20),
  ];

  if (lastCheckedAt) {
    queries.push(Query.greaterThan("created_at", lastCheckedAt));
  }

  const response = await tablesDB.listRows<GroupMessage>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MESSAGES_TABLE_ID,
    queries,
  });

  const notifiedIds: string[] = [];
  const messages = [...(response.rows as unknown as GroupMessage[])].reverse();
  for (const message of messages) {
    const seenId = buildSeenMessageId("group", message.$id);
    if (seenMessageIds.has(seenId)) {
      continue;
    }

    const groupName = groupNameMap.get(message.group_id) || "Group chat";
    const messageBody =
      message.message_type === "voice"
        ? `${message.sender_name}: Sent a voice message`
        : message.message_type === "system"
          ? message.body || "Group updated"
          : `${message.sender_name}: ${message.body || "Sent a message"}`;

    await sendImmediateNotification(groupName, messageBody, {
      type: "group_message",
      groupId: message.group_id,
      groupName,
    });

    notifiedIds.push(seenId);
    seenMessageIds.add(seenId);
  }

  return notifiedIds;
}

async function runChatBackgroundNotificationPoll(): Promise<boolean> {
  const config = await readStoredConfig();
  if (!config?.enabled || !config.profileId) {
    return true;
  }

  const state = await readStoredState();
  const seenMessageIds = new Set(state.seenMessageIds);
  const [directIds, groupIds] = await Promise.all([
    processDirectMessageNotifications(
      config.profileId,
      state.lastCheckedAt,
      seenMessageIds,
    ),
    processGroupMessageNotifications(
      config.profileId,
      state.lastCheckedAt,
      seenMessageIds,
    ),
  ]);

  await writeStoredState({
    lastCheckedAt: new Date().toISOString(),
    seenMessageIds: Array.from(seenMessageIds).concat(directIds, groupIds),
  });

  return true;
}

if (!TaskManager.isTaskDefined(CHAT_NOTIFICATIONS_BACKGROUND_TASK)) {
  TaskManager.defineTask(CHAT_NOTIFICATIONS_BACKGROUND_TASK, async () => {
    try {
      const success = await runChatBackgroundNotificationPoll();
      return success
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Failed;
    } catch (error) {
      console.error(
        "[ChatBackgroundNotifications] Background worker failed",
        error,
      );
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

async function canUseBackgroundTaskApi(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) return false;

  const status = await BackgroundTask.getStatusAsync();
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}

export async function enableChatBackgroundNotifications(
  profileId: string,
): Promise<boolean> {
  if (!profileId) return false;

  const available = await canUseBackgroundTaskApi();
  await writeStoredConfig({ profileId, enabled: available });

  const currentState = await readStoredState();
  await writeStoredState({
    lastCheckedAt: currentState.lastCheckedAt || new Date().toISOString(),
    seenMessageIds: currentState.seenMessageIds,
  });

  if (!available) {
    return false;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    CHAT_NOTIFICATIONS_BACKGROUND_TASK,
  );

  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(CHAT_NOTIFICATIONS_BACKGROUND_TASK, {
      minimumInterval: CHAT_NOTIFICATIONS_BACKGROUND_MIN_INTERVAL_MINUTES,
    });
  }

  return true;
}

export async function disableChatBackgroundNotifications(): Promise<void> {
  await writeStoredConfig(null);

  if (Platform.OS === "web") return;

  const taskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!taskManagerAvailable) return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    CHAT_NOTIFICATIONS_BACKGROUND_TASK,
  );

  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(CHAT_NOTIFICATIONS_BACKGROUND_TASK);
  }
}