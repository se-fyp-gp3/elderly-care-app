import { CustomVoice, CustomVoiceStatus } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { CUSTOM_VOICE_TABLE_ID, DATABASE_ID, tablesDB } from "./appwrite";

export async function saveCustomVoiceRecord(input: {
  caregiverId: string;
  caregiverName: string;
  elderlyId: string;
  voiceId: string;
  status?: CustomVoiceStatus;
}): Promise<CustomVoice> {
  const now = new Date().toISOString();

  const row = await tablesDB.createRow<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: ID.unique(),
    data: {
      caregiver_id: input.caregiverId,
      caregiver_name: input.caregiverName,
      elderly_id: input.elderlyId,
      voice_id: input.voiceId,
      status: input.status ?? CustomVoiceStatus.READY,
      created_at: now,
      updated_at: now,
    },
  });

  return row as unknown as CustomVoice;
}

export async function updateCustomVoiceRecord(
  documentId: string,
  data: Partial<Pick<CustomVoice, "voice_id" | "status">>,
): Promise<CustomVoice> {
  const now = new Date().toISOString();

  const row = await tablesDB.updateRow<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: documentId,
    data: {
      ...data,
      updated_at: now,
    },
  });

  return row as unknown as CustomVoice;
}

export async function deleteCustomVoiceRecord(
  documentId: string,
): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: documentId,
  });
}

export async function getCustomVoicesForElderly(
  elderlyId: string,
): Promise<CustomVoice[]> {
  const response = await tablesDB.listRows<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    queries: [
      Query.equal("elderly_id", elderlyId),
      Query.equal("status", CustomVoiceStatus.READY),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ],
  });

  return response.rows as unknown as CustomVoice[];
}

export async function getCustomVoicesForCaregiver(
  caregiverId: string,
): Promise<CustomVoice[]> {
  const response = await tablesDB.listRows<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    queries: [
      Query.equal("caregiver_id", caregiverId),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ],
  });

  return response.rows as unknown as CustomVoice[];
}
