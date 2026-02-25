import type { Models } from "node-appwrite";

export type DirectMessage = Models.Row & {
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "caregiver" | "elderly";
  receiver_id: string;
  body: string;
  created_at: string;
  is_read: boolean;
};
