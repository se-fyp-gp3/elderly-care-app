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
  /** The text content */
  body: string;
  /** ISO-8601 timestamp when the message was created */
  created_at: string;
  /** Whether the receiver has read the message */
  is_read: boolean;
};
