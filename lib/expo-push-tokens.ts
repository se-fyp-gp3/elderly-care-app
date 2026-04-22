import { ExpoPushToken } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { DATABASE_ID, EXPO_PUSH_TOKENS_TABLE_ID, tablesDB } from "./appwrite";

export type PushTokenRole = "elderly" | "caregiver";

type UpsertExpoPushTokenInput = {
  profileId: string;
  userId: string;
  role: PushTokenRole;
  expoPushToken: string;
  platform: "android" | "ios";
};

export async function upsertExpoPushToken(
  input: UpsertExpoPushTokenInput,
): Promise<void> {
  if (!EXPO_PUSH_TOKENS_TABLE_ID || !input.expoPushToken.trim()) {
    return;
  }

  const now = new Date().toISOString();
  const data = {
    profile_id: input.profileId,
    user_id: input.userId,
    role: input.role,
    expo_push_token: input.expoPushToken.trim(),
    platform: input.platform,
    active: true,
    last_seen_at: now,
    updated_at: now,
  };

  const existing = await tablesDB.listRows<ExpoPushToken>({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    queries: [
      Query.equal("expo_push_token", [data.expo_push_token]),
      Query.limit(1),
    ],
  });

  if (existing.rows.length > 0) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      rowId: existing.rows[0].$id,
      data,
    });
    return;
  }

  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    rowId: ID.unique(),
    data,
  });
}

export async function deactivateExpoPushToken(
  expoPushToken: string | null | undefined,
): Promise<void> {
  if (!EXPO_PUSH_TOKENS_TABLE_ID || !expoPushToken?.trim()) {
    return;
  }

  const existing = await tablesDB.listRows<ExpoPushToken>({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    queries: [
      Query.equal("expo_push_token", [expoPushToken.trim()]),
      Query.limit(1),
    ],
  });

  if (!existing.rows.length) {
    return;
  }

  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    rowId: existing.rows[0].$id,
    data: {
      active: false,
      updated_at: new Date().toISOString(),
    },
  });
}