import { Caregiver, CaregiverElderly, Elderly } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import { CAREGIVER_ELDERLY_TABLE_ID, CAREGIVER_TABLE_ID, DATABASE_ID, ELDERLY_TABLE_ID, tablesDB } from "./appwrite";

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

export async function linkCaregiverToElderly(
  caregiverId: string,
  elderlyId: string,
): Promise<void> {
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: CAREGIVER_ELDERLY_TABLE_ID,
    rowId: ID.unique(),
    data: {
      caregiver: caregiverId,
      elderly: elderlyId,
    },
  });
}

export async function getLinkedElderly(caregiverId: string): Promise<Elderly[]> {
  try {
    const response = await tablesDB.listRows<CaregiverElderly>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_ELDERLY_TABLE_ID,
      queries: [
        Query.equal("caregiver", caregiverId),
        Query.orderDesc("$createdAt"),
      ],
    });

    const rawItems = response.rows.flatMap((row) => row.elderly);
    const loadedElderly: Elderly[] = [];
    const idsToFetch: string[] = [];

    for (const item of rawItems) {
      if (typeof item === "string") {
        idsToFetch.push(item);
      } else if (item && typeof item === "object" && "$id" in item) {
        loadedElderly.push(item as Elderly);
      }
    }

    if (idsToFetch.length > 0) {
      const uniqueIds = [...new Set(idsToFetch)];
      const detailsResponse = await tablesDB.listRows<Elderly>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_TABLE_ID,
        queries: [Query.equal("$id", uniqueIds), Query.limit(100)],
      });
      loadedElderly.push(...detailsResponse.rows);
    }

    // Deduplicate
    return Array.from(
      new Map(loadedElderly.map((item) => [item.$id, item])).values(),
    );
  } catch (error) {
    console.error("Error fetching linked elderly:", error);
    return [];
  }
}

