import { Caregiver, CaregiverElderly, Elderly } from "@/types/appwrite";
import { Query } from "react-native-appwrite";
import {
  CAREGIVER_ELDERLY_TABLE_ID,
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  ELDERLY_TABLE_ID,
  tablesDB,
} from "./appwrite";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  role: "elderly" | "caregiver";
  avatarLabel: string;
  status?: string | null;
  lastActive?: string;
}

/**
 * For a caregiver user: get all linked elderly as contacts
 */
export async function getContactsForCaregiver(
  caregiverId: string,
): Promise<Contact[]> {
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

    const uniqueElderly = Array.from(
      new Map(loadedElderly.map((item) => [item.$id, item])).values(),
    );

    return uniqueElderly.map((elderly) => ({
      id: elderly.$id,
      name: elderly.name || "Unknown",
      phone: elderly.phone,
      role: "elderly" as const,
      avatarLabel: (elderly.name || "??").substring(0, 2).toUpperCase(),
      status: elderly.status,
      lastActive: elderly.$updatedAt,
    }));
  } catch (error) {
    console.error("Error fetching contacts for caregiver:", error);
    return [];
  }
}

/**
 * For an elderly user: get all linked caregivers as contacts
 */
export async function getContactsForElderly(
  elderlyId: string,
): Promise<Contact[]> {
  try {
    const response = await tablesDB.listRows<CaregiverElderly>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_ELDERLY_TABLE_ID,
      queries: [
        Query.equal("elderly", elderlyId),
        Query.orderDesc("$createdAt"),
      ],
    });

    const rawItems = response.rows.flatMap((row) => row.caregiver);
    const loadedCaregivers: Caregiver[] = [];
    const idsToFetch: string[] = [];

    for (const item of rawItems) {
      if (typeof item === "string") {
        idsToFetch.push(item);
      } else if (item && typeof item === "object" && "$id" in item) {
        loadedCaregivers.push(item as Caregiver);
      }
    }

    if (idsToFetch.length > 0) {
      const uniqueIds = [...new Set(idsToFetch)];
      const detailsResponse = await tablesDB.listRows<Caregiver>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_TABLE_ID,
        queries: [Query.equal("$id", uniqueIds), Query.limit(100)],
      });
      loadedCaregivers.push(...detailsResponse.rows);
    }

    const uniqueCaregivers = Array.from(
      new Map(loadedCaregivers.map((item) => [item.$id, item])).values(),
    );

    return uniqueCaregivers.map((caregiver) => ({
      id: caregiver.$id,
      name: caregiver.name || "Unknown",
      phone: caregiver.phone,
      role: "caregiver" as const,
      avatarLabel: (caregiver.name || "??").substring(0, 2).toUpperCase(),
      lastActive: caregiver.$updatedAt,
    }));
  } catch (error) {
    console.error("Error fetching contacts for elderly:", error);
    return [];
  }
}

/**
 * Format a timestamp to a relative time string
 */
export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
