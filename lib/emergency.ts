import type { EmergencyAlert } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
    DATABASE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
    tablesDB,
} from "./appwrite";

export async function createEmergencyAlert(data: {
  type: string;
  elderly_id: string;
  elderly_name: string;
  caregiver_user_id: string;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  description?: string;
}): Promise<EmergencyAlert> {
  const row = await tablesDB.createRow<EmergencyAlert>({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      type: data.type,
      elderly_id: data.elderly_id,
      elderly_name: data.elderly_name,
      caregiver_user_id: data.caregiver_user_id,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      location_name: data.location_name ?? null,
      status: "active",
      description: data.description ?? null,
      resolved_at: null,
      resolved_by: null,
    },
  });
  return row;
}

export async function fetchEmergencyAlerts(
  caregiverUserId: string,
): Promise<EmergencyAlert[]> {
  const response = await tablesDB.listRows<EmergencyAlert>({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    queries: [
      Query.equal("caregiver_user_id", caregiverUserId),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ],
  });
  return response.rows;
}

export async function resolveEmergencyAlert(
  alertId: string,
  resolvedBy: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    rowId: alertId,
    data: {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    },
  });
}

export async function updateAlertStatus(
  alertId: string,
  status: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    rowId: alertId,
    data: { status },
  });
}

/**
 * Fetch recent emergency alerts for a specific elderly person.
 * Returns latest alerts (active/investigating first, then resolved).
 */
export async function fetchAlertsByElderlyId(
  elderlyId: string,
  limit = 5,
): Promise<EmergencyAlert[]> {
  const response = await tablesDB.listRows<EmergencyAlert>({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    queries: [
      Query.equal("elderly_id", elderlyId),
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
    ],
  });
  return response.rows;
}
