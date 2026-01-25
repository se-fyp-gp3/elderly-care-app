import { Caregiver } from "@/types/appwrite";
import { CAREGIVER_TABLE_ID, DATABASE_ID, tablesDB } from "./appwrite";
import { ID, Query } from "react-native-appwrite";

export async function createCaregiverProfile(
  data: Caregiver,
): Promise<Caregiver> {
  const doc = await tablesDB.createRow<Caregiver>({
    databaseId: DATABASE_ID,
    tableId: CAREGIVER_TABLE_ID,
    rowId: ID.unique(),
    data: {
      user_id: data.user_id,
      name: data.name,
      phone: data.phone,
      birth: data.birth,
    },
  });
  return doc as unknown as Caregiver;
}
export async function getCaregiverByUserId(
  userId: string,
): Promise<Caregiver | null> {
  try {
    const response = await tablesDB.listRows<Caregiver>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_TABLE_ID,
      queries: [Query.equal("user_id", userId), Query.limit(1)],
    });
    if (response.total > 0) {
      return response.rows[0] as unknown as Caregiver;
    }
    return null;
  } catch (error) {
    console.error("Error fetching caregiver profile:", error);
    return null;
  }
}
