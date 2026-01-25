import { Elderly, ElderlyStatus } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { DATABASE_ID, ELDERLY_TABLE_ID, tablesDB } from "./appwrite";

export async function createElderlyProfile(
  data: Elderly,
): Promise<Elderly> {
  const document = await tablesDB.createRow<Elderly>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_TABLE_ID,
    rowId: ID.unique(),
    data: {
      user_id: data.user_id,
      name: data.name,
      phone: data.phone,
      birth: data.birth,
      status: ElderlyStatus.NORMAL,
    },
  });
  return document as unknown as Elderly;
}
export async function getElderlyByUserId(
  userId: string,
): Promise<Elderly | null> {
  try {
    const response = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("user_id", userId), Query.limit(1)],
    });
    if (response.total > 0) {
      return response.rows[0] as unknown as Elderly;
    }
    return null;
  } catch (error) {
    console.error("Error fetching elderly profile:", error);
    return null;
  }
}
