import type { Models } from "node-appwrite";

/**
 * A direct message between two users (caregiver <-> elderly).
 * Stored in the "direct_messages" collection.
 */
export type DirectMessage = Models.Row & {
  /** The conversation ID (deterministic, sorted pair of profile IDs) */
  conversation_id: string;
  /** Sender's profile doc ID (caregiver.$id or elderly.$id) */
  sender_id: string;
  /** Sender display name (denormalized for fast rendering) */
  sender_name: string;
  /** "caregiver" | "elderly" */
  sender_role: string;
  /** Receiver's profile doc ID */
  receiver_id: string;
  /** The text content (or base64 audio for voice messages) */
  body: string;
  /** ISO-8601 timestamp when the message was created */
  created_at: string;
  /** Whether the receiver has read the message */
  is_read: boolean;
  /** "text" | "voice" — defaults to "text" */
  message_type?: string;
  /** Quote/reply fields */
  quoted_message_id?: string;
  quoted_sender_name?: string;
  quoted_body?: string;
};

/**
 * A message within a group chat.
 * Stored in the "group_messages" collection.
 */
export type GroupMessage = Models.Row & {
  group_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "elderly" | "caregiver";
  body: string;
  created_at: string;
  message_type?: "text" | "voice" | "system";
  /** Array of profile IDs who have read this message */
  read_by?: string[];
  /** Quote/reply fields */
  quoted_message_id?: string;
  quoted_sender_name?: string;
  quoted_body?: string;
};

/**
 * A group chat.
 * Stored in the "groups" collection.
 */
export type Group = Models.Row & {
  name: string;
  avatar_file_id?: string;
  created_by: string;
  created_at: string;
  muted_by?: string[];
};

/**
 * A group member entry.
 * Stored in the "group_members" collection.
 */
export type GroupMember = Models.Row & {
  group_id: string;
  user_profile_id: string;
  user_name: string;
  user_role: "elderly" | "caregiver";
  member_role: "admin" | "member";
  joined_at: string;
  status: "active" | "invited" | "left";
};

/**
 * Read cursor for group unread tracking.
 * Stored in the "group_read_cursors" collection.
 */
export type GroupReadCursor = Models.Row & {
  group_id: string;
  user_profile_id: string;
  last_read_at: string;
};
