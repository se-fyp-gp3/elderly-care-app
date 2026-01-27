import type { ChatSessionRow } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { CHAT_SESSION_TABLE_ID, DATABASE_ID, tablesDB } from "./appwrite";

export interface ChatSessionInput {
  userId: string;
  chatId: string;
  title: string;
  messages: string;
  updatedAt: string;
}

export async function createChatSession(
  input: ChatSessionInput,
): Promise<ChatSessionRow> {
  const row = await tablesDB.createRow<ChatSessionRow>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    rowId: ID.unique(),
    data: {
      user_id: input.userId,
      chat_id: input.chatId,
      title: input.title,
      messages: input.messages,
      updated_at: input.updatedAt,
    },
  });

  return row as unknown as ChatSessionRow;
}

export async function updateChatSession(
  rowId: string,
  input: Pick<ChatSessionInput, "title" | "messages" | "updatedAt">,
): Promise<ChatSessionRow> {
  const row = await tablesDB.updateRow<ChatSessionRow>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    rowId,
    data: {
      title: input.title,
      messages: input.messages,
      updated_at: input.updatedAt,
    },
  });

  return row as unknown as ChatSessionRow;
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
): Promise<ChatSessionRow[]> {
  const response = await tablesDB.listRows<ChatSessionRow>({
    databaseId: DATABASE_ID,
    tableId: CHAT_SESSION_TABLE_ID,
    queries: [
      Query.equal("user_id", userId),
      Query.orderDesc("$updatedAt"),
      Query.limit(50),
    ],
  });

  return response.rows as unknown as ChatSessionRow[];
}

export async function deleteChatsOlderThan(
  userId: string,
  days: number,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const response = await tablesDB.listRows<ChatSessionRow>({
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
