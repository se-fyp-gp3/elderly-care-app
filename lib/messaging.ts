import { DirectMessage } from "@/types/messaging";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    DIRECT_MESSAGES_TABLE_ID,
    safeSubscribe,
    tablesDB,
} from "./appwrite";
import { updatePresence } from "./presence";

/**
 * Build a deterministic conversation ID from two profile IDs.
 * Always returns the same string regardless of argument order.
 */
export function buildConversationId(
  profileIdA: string,
  profileIdB: string,
): string {
  return [profileIdA, profileIdB].sort().join("_");
}

/**
 * Send a direct message.
 */
export async function sendDirectMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: "caregiver" | "elderly";
  receiverId: string;
  body: string;
  messageType?: "text" | "voice";
  quotedMessageId?: string;
  quotedSenderName?: string;
  quotedBody?: string;
}): Promise<DirectMessage> {
  const now = new Date().toISOString();
  const data = {
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    sender_name: input.senderName,
    sender_role: input.senderRole,
    receiver_id: input.receiverId,
    body: input.body,
    created_at: now,
    is_read: false,
    message_type: input.messageType ?? "text",
    ...(input.quotedMessageId && {
      quoted_message_id: input.quotedMessageId,
      quoted_sender_name: input.quotedSenderName ?? "",
      quoted_body: input.quotedBody ?? "",
    }),
  };
  const doc = await tablesDB.createRow<DirectMessage>({
    databaseId: DATABASE_ID,
    tableId: DIRECT_MESSAGES_TABLE_ID,
    rowId: ID.unique(),
    data,
  });

  // Update sender's presence so they appear online after sending a message
  updatePresence(input.senderId, input.senderRole).catch(() => {});

  return doc as unknown as DirectMessage;
}

/**
 * Fetch messages for a conversation, ordered by creation time.
 * Uses cursor-based pagination.
 */
export async function fetchConversationMessages(
  conversationId: string,
  limit = 50,
  lastId?: string,
): Promise<DirectMessage[]> {
  const queries = [
    Query.equal("conversation_id", conversationId),
    Query.orderAsc("created_at"),
    Query.limit(limit),
  ];

  if (lastId) {
    queries.push(Query.cursorAfter(lastId));
  }

  const response = await tablesDB.listRows<DirectMessage>({
    databaseId: DATABASE_ID,
    tableId: DIRECT_MESSAGES_TABLE_ID,
    queries,
  });

  return response.rows as unknown as DirectMessage[];
}

/**
 * Mark all messages in a conversation as read for a specific receiver.
 */
export async function markConversationAsRead(
  conversationId: string,
  receiverId: string,
): Promise<void> {
  try {
    const unreadMessages = await tablesDB.listRows<DirectMessage>({
      databaseId: DATABASE_ID,
      tableId: DIRECT_MESSAGES_TABLE_ID,
      queries: [
        Query.equal("conversation_id", conversationId),
        Query.equal("receiver_id", receiverId),
        Query.equal("is_read", false),
        Query.limit(100),
      ],
    });

    for (const msg of unreadMessages.rows) {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: DIRECT_MESSAGES_TABLE_ID,
        rowId: msg.$id,
        data: { is_read: true },
      });
    }
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
}

/**
 * Get the count of unread messages for a user across all conversations.
 */
export async function getUnreadCount(receiverId: string): Promise<number> {
  try {
    const response = await tablesDB.listRows<DirectMessage>({
      databaseId: DATABASE_ID,
      tableId: DIRECT_MESSAGES_TABLE_ID,
      queries: [
        Query.equal("receiver_id", receiverId),
        Query.equal("is_read", false),
        Query.limit(1),
      ],
    });
    return response.total;
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}

/**
 * Get the last message for a given conversation.
 */
export async function getLastMessage(
  conversationId: string,
): Promise<DirectMessage | null> {
  try {
    const response = await tablesDB.listRows<DirectMessage>({
      databaseId: DATABASE_ID,
      tableId: DIRECT_MESSAGES_TABLE_ID,
      queries: [
        Query.equal("conversation_id", conversationId),
        Query.orderDesc("created_at"),
        Query.limit(1),
      ],
    });
    if (response.rows.length > 0) {
      return response.rows[0] as unknown as DirectMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to realtime updates for a conversation.
 * Returns an unsubscribe function.
 */
export function subscribeToConversation(
  conversationId: string,
  onMessage: (message: DirectMessage) => void,
): () => void {
  try {
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = safeSubscribe(channel, (response) => {
      const payload = response.payload as unknown as DirectMessage;
      if (payload?.conversation_id === conversationId) {
        onMessage(payload);
      }
    });
    return unsubscribe;
  } catch (error) {
    console.error("Error subscribing to conversation:", error);
    return () => {};
  }
}

/**
 * Subscribe to ALL incoming messages for a specific user (by receiver_id).
 * Used for global push notification triggering.
 * Returns an unsubscribe function.
 */
export function subscribeToUserMessages(
  myProfileId: string,
  onIncomingMessage: (message: DirectMessage) => void,
): () => void {
  try {
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = safeSubscribe(channel, (response) => {
      const payload = response.payload as unknown as DirectMessage;
      if (payload?.receiver_id === myProfileId && payload?.sender_id !== myProfileId) {
        onIncomingMessage(payload);
      }
    });
    return unsubscribe;
  } catch (error) {
    console.error("Error subscribing to user messages:", error);
    return () => {};
  }
}
