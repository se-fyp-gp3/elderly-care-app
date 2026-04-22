import { ExecutionMethod } from "react-native-appwrite";
import { CHAT_PUSH_FUNCTION_ID, functions } from "./appwrite";

type DirectChatPushPayload = {
  mode: "direct";
  receiverProfileId: string;
  senderId: string;
  senderName: string;
  senderRole: "elderly" | "caregiver";
  body: string;
  messageType: "text" | "voice" | "image";
};

type GroupChatPushPayload = {
  mode: "group";
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: "elderly" | "caregiver";
  body: string;
  messageType: "text" | "voice" | "image" | "system";
};

type ChatPushPayload = DirectChatPushPayload | GroupChatPushPayload;

async function executeChatPush(payload: ChatPushPayload): Promise<void> {
  if (!CHAT_PUSH_FUNCTION_ID) return;

  try {
    const result = await functions.createExecution({
      functionId: CHAT_PUSH_FUNCTION_ID,
      body: JSON.stringify(payload),
      method: ExecutionMethod.POST,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (result.responseStatusCode >= 400) {
      console.warn(
        "[ChatPush] Function execution failed",
        result.responseStatusCode,
        result.responseBody,
      );
    }
  } catch (error) {
    console.warn("[ChatPush] Failed to trigger chat push function", error);
  }
}

export function triggerDirectChatPush(payload: DirectChatPushPayload): void {
  void executeChatPush(payload);
}

export function triggerGroupChatPush(payload: GroupChatPushPayload): void {
  void executeChatPush(payload);
}