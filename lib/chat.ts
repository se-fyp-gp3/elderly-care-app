import type { ChatSession } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { CHAT_SESSION_TABLE_ID, DATABASE_ID, tablesDB } from "./appwrite";

export interface ChatSessionInput {
  userId: string;
  title: string;
  messages: string;
}

export async function createChatSession(
  input: ChatSessionInput,
): Promise<ChatSession> {
  const row = await tablesDB.createRow<ChatSession>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    rowId: ID.unique(),
    data: {
      user_id: input.userId,
      title: input.title,
      messages: input.messages,
    },
  });

  return row as unknown as ChatSession;
}

export async function updateChatSession(
  rowId: string,
  input: Pick<ChatSessionInput, "title" | "messages">,
): Promise<ChatSession> {
  const row = await tablesDB.updateRow<ChatSession>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    rowId,
    data: {
      title: input.title,
      messages: input.messages,
    },
  });

  return row as unknown as ChatSession;
}

export async function deleteChatSession(rowId: string): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    rowId,
  });
}

export async function listChatSessionsForUser(
  userId: string,
): Promise<ChatSession[]> {
  const response = await tablesDB.listRows<ChatSession>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    queries: [
      Query.equal("user_id", userId),
      Query.orderDesc("$updatedAt"),
      Query.limit(50),
    ],
  });

  return response.rows as unknown as ChatSession[];
}

export async function deleteChatsOlderThan(
  userId: string,
  days: number,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const response = await tablesDB.listRows<ChatSession>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    queries: [
      Query.equal("user_id", userId),
      Query.lessThan("$updatedAt", cutoff.toISOString()),
      Query.limit(100),
    ],
  });

  await Promise.all(
    response.rows.map((row) =>
      tablesDB.deleteRow({
        databaseId: DATABASE_ID,
        tableId: CHAT_SESSION_TABLE_ID,
        rowId: row.$id,
      }),
    ),
  );
}
