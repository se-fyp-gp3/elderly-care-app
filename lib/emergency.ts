import type { Caregiver, Elderly, EmergencyAlert } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
    CAREGIVER_TABLE_ID,
    DATABASE_ID,
    ELDERLY_TABLE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
    tablesDB,
} from "./appwrite";

const ALERT_FETCH_LIMIT = 100;

function normalizeLocationName(alert: Pick<EmergencyAlert, "location_name" | "latitude" | "longitude">) {
  if (alert.location_name?.trim()) {
    return alert.location_name.trim();
  }

  if (alert.latitude != null && alert.longitude != null) {
    return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
  }

  return null;
}

async function findCaregiverByIdentifier(
  identifier: string,
): Promise<Caregiver | null> {
  const byRowId = await tablesDB.listRows<Caregiver>({
    databaseId: DATABASE_ID,
    tableId: CAREGIVER_TABLE_ID,
    queries: [Query.equal("$id", identifier), Query.limit(1)],
  });

  if (byRowId.rows[0]) {
    return byRowId.rows[0];
  }

  const byUserId = await tablesDB.listRows<Caregiver>({
    databaseId: DATABASE_ID,
    tableId: CAREGIVER_TABLE_ID,
    queries: [Query.equal("user_id", identifier), Query.limit(1)],
  });

  return byUserId.rows[0] ?? null;
}

async function getCaregiverIdentifiers(caregiverUserId: string) {
  const identifiers = new Set<string>([caregiverUserId]);
  const caregiver = await findCaregiverByIdentifier(caregiverUserId);

  if (caregiver?.$id) {
    identifiers.add(caregiver.$id);
  }

  if (caregiver?.user_id) {
    identifiers.add(caregiver.user_id);
  }

  return [...identifiers];
}

async function getElderlyNameMap(elderlyIds: string[]) {
  if (!elderlyIds.length) {
    return new Map<string, string>();
  }

  const response = await tablesDB.listRows<Elderly>({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_TABLE_ID,
    queries: [Query.equal("$id", elderlyIds), Query.limit(elderlyIds.length)],
  });

  return new Map(
    response.rows
      .filter((row) => row?.$id && row.name?.trim())
      .map((row) => [row.$id, row.name.trim()]),
  );
}

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
  const caregiver = await findCaregiverByIdentifier(data.caregiver_user_id);
  const caregiverUserId = caregiver?.user_id ?? data.caregiver_user_id;

  const row = await tablesDB.createRow<EmergencyAlert>({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      type: data.type,
      elderly_id: data.elderly_id,
      elderly_name: data.elderly_name,
      caregiver_user_id: caregiverUserId,
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
  const caregiverIdentifiers = await getCaregiverIdentifiers(caregiverUserId);
  const response = await tablesDB.listRows<EmergencyAlert>({
    databaseId: DATABASE_ID,
    tableId: EMERGENCY_ALERTS_TABLE_ID,
    queries: [
      Query.equal("caregiver_user_id", caregiverIdentifiers),
      Query.orderDesc("$createdAt"),
      Query.limit(ALERT_FETCH_LIMIT),
    ],
  });

  const elderlyIds = [...new Set(response.rows.map((row) => row.elderly_id).filter(Boolean))];
  const elderlyNameMap = await getElderlyNameMap(elderlyIds);

  return response.rows.map((row) => ({
    ...row,
    elderly_name:
      row.elderly_name?.trim() ||
      elderlyNameMap.get(row.elderly_id) ||
      "Unknown",
    location_name: normalizeLocationName(row),
  }));
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
