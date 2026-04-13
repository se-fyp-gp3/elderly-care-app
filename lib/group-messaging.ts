import { GroupMessage, GroupReadCursor } from "@/types/messaging";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    GROUP_MESSAGES_TABLE_ID,
    GROUP_READ_CURSORS_TABLE_ID,
    safeSubscribe,
    tablesDB
} from "./appwrite";

/**
 * Send a message in a group chat.
 */
export async function sendGroupMessage(input: {
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: "elderly" | "caregiver";
  body: string;
  messageType?: "text" | "voice" | "image" | "system";
  quotedMessageId?: string;
  quotedSenderName?: string;
  quotedBody?: string;
}): Promise<GroupMessage> {
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    group_id: input.groupId,
    sender_id: input.senderId,
    sender_name: input.senderName,
    sender_role: input.senderRole,
    body: input.body,
    created_at: now,
    message_type: input.messageType ?? "text",
  };
  if (input.quotedMessageId) {
    data.quoted_message_id = input.quotedMessageId;
    data.quoted_sender_name = input.quotedSenderName ?? "";
    data.quoted_body = input.quotedBody ?? "";
  }
  const doc = await tablesDB.createRow<GroupMessage>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MESSAGES_TABLE_ID,
    rowId: ID.unique(),
    data: data as any,
  });
  return doc as unknown as GroupMessage;
}

/**
 * Fetch messages for a group, ordered by creation time.
 * Uses cursor-based pagination.
 */
export async function fetchGroupMessages(
  groupId: string,
  limit = 50,
  lastId?: string,
): Promise<GroupMessage[]> {
  const queries = [
    Query.equal("group_id", groupId),
    Query.orderAsc("created_at"),
    Query.limit(limit),
  ];

  if (lastId) {
    queries.push(Query.cursorAfter(lastId));
  }

  const response = await tablesDB.listRows<GroupMessage>({
    databaseId: DATABASE_ID,
    tableId: GROUP_MESSAGES_TABLE_ID,
    queries,
  });

  return response.rows as unknown as GroupMessage[];
}

/**
 * Get the last message in a group (for chat list preview).
 */
export async function getLastGroupMessage(
  groupId: string,
): Promise<GroupMessage | null> {
  try {
    const response = await tablesDB.listRows<GroupMessage>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MESSAGES_TABLE_ID,
      queries: [
        Query.equal("group_id", groupId),
        Query.orderDesc("created_at"),
        Query.limit(1),
      ],
    });
    return response.rows.length > 0
      ? (response.rows[0] as unknown as GroupMessage)
      : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to realtime updates for a group's messages.
 * Returns an unsubscribe function.
 */
export function subscribeToGroupMessages(
  groupId: string,
  onMessage: (message: GroupMessage) => void,
): () => void {
  try {
    const channel = `databases.${DATABASE_ID}.collections.${GROUP_MESSAGES_TABLE_ID}.documents`;
    return safeSubscribe(channel, (response) => {
      const payload = response.payload as unknown as GroupMessage;
      if (payload?.group_id === groupId) {
        onMessage(payload);
      }
    });
  } catch (error) {
    console.error("Error subscribing to group messages:", error);
    return () => {};
  }
}

/**
 * Mark all group messages as read by this user.
 * Appends profileId to read_by array for messages that don't already include it.
 */
export async function markGroupMessagesAsRead(
  groupId: string,
  profileId: string,
): Promise<void> {
  try {
    const msgs = await tablesDB.listRows<GroupMessage>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MESSAGES_TABLE_ID,
      queries: [
        Query.equal("group_id", groupId),
        Query.orderDesc("created_at"),
        Query.limit(100),
      ],
    });
    const unread = (msgs.rows as unknown as GroupMessage[]).filter(
      (m) => m.sender_id !== profileId && !(m.read_by ?? []).includes(profileId),
    );
    await Promise.all(
      unread.map((m) =>
        tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: GROUP_MESSAGES_TABLE_ID,
          rowId: m.$id,
          data: { read_by: [...(m.read_by ?? []), profileId] },
        }),
      ),
    );
  } catch (error) {
    console.error("Error marking group messages as read:", error);
  }
}

/**
 * Update the read cursor for a user in a group.
 * Upserts: creates if not exists, updates if exists.
 */
export async function updateGroupReadCursor(
  groupId: string,
  profileId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Check if cursor already exists
    const existing = await tablesDB.listRows<GroupReadCursor>({
      databaseId: DATABASE_ID,
      tableId: GROUP_READ_CURSORS_TABLE_ID,
      queries: [
        Query.equal("group_id", groupId),
        Query.equal("user_profile_id", profileId),
        Query.limit(1),
      ],
    });

    if (existing.rows.length > 0) {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: GROUP_READ_CURSORS_TABLE_ID,
        rowId: existing.rows[0].$id,
        data: { last_read_at: now },
      });
    } else {
      await tablesDB.createRow<GroupReadCursor>({
        databaseId: DATABASE_ID,
        tableId: GROUP_READ_CURSORS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          group_id: groupId,
          user_profile_id: profileId,
          last_read_at: now,
        },
      });
    }
  } catch (error) {
    console.error("Error updating group read cursor:", error);
  }
}

/**
 * Get the unread count for a user in a specific group.
 */
export async function getGroupUnreadCount(
  groupId: string,
  profileId: string,
): Promise<number> {
  try {
    // Get cursor
    const cursorResp = await tablesDB.listRows<GroupReadCursor>({
      databaseId: DATABASE_ID,
      tableId: GROUP_READ_CURSORS_TABLE_ID,
      queries: [
        Query.equal("group_id", groupId),
        Query.equal("user_profile_id", profileId),
        Query.limit(1),
      ],
    });

    const queries = [
      Query.equal("group_id", groupId),
      Query.limit(1),
    ];

    if (cursorResp.rows.length > 0) {
      const lastRead = cursorResp.rows[0].last_read_at;
      queries.push(Query.greaterThan("created_at", lastRead));
    }

    // Exclude own messages from unread count
    queries.push(Query.notEqual("sender_id", profileId));

    const response = await tablesDB.listRows<GroupMessage>({
      databaseId: DATABASE_ID,
      tableId: GROUP_MESSAGES_TABLE_ID,
      queries,
    });

    return response.total;
  } catch (error) {
    console.error("Error getting group unread count:", error);
    return 0;
  }
}
