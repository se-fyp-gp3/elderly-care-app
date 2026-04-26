import { Caregiver, CaregiverElderly, Elderly, EmergencyAlert } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
    CAREGIVER_ELDERLY_TABLE_ID,
    CAREGIVER_TABLE_ID,
    DATABASE_ID,
    ELDERLY_TABLE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
    tablesDB,
} from "./appwrite";
import { triggerUserPush } from "./chat-push";

export type CaregiverActivityAlertType =
  | "cg_med_add"
  | "cg_med_cancel"
  | "cg_sched_add";

export function isCaregiverActivityAlertType(
  type?: string | null,
): type is CaregiverActivityAlertType {
  return (
    type === "cg_med_add" ||
    type === "cg_med_cancel" ||
    type === "cg_sched_add"
  );
}

async function resolveElderlyName(
  elderlyId: string,
  fallbackName?: string,
): Promise<string> {
  if (fallbackName?.trim()) return fallbackName.trim();

  try {
    const response = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("$id", [elderlyId]), Query.limit(1)],
    });

    return response.rows[0]?.name || "Elderly user";
  } catch {
    return "Elderly user";
  }
}

async function getLinkedCaregiversForElderly(elderlyId: string): Promise<Caregiver[]> {
  const links = await tablesDB.listRows<CaregiverElderly>({
    databaseId: DATABASE_ID,
    tableId: CAREGIVER_ELDERLY_TABLE_ID,
    queries: [Query.equal("elderly", elderlyId), Query.equal("isConnection", true), Query.limit(100)],
  });

  const caregivers: Caregiver[] = [];
  const caregiverIds = new Set<string>();

  for (const row of links.rows) {
    const related = row.caregiver;
    if (Array.isArray(related)) {
      for (const item of related) {
        if (typeof item === "string") caregiverIds.add(item);
        else if (item && typeof item === "object" && "$id" in item) caregivers.push(item as Caregiver);
      }
      continue;
    }

    if (typeof related === "string") caregiverIds.add(related);
    else if (related && typeof related === "object" && "$id" in related) caregivers.push(related as Caregiver);
  }

  if (caregiverIds.size > 0) {
    const fetched = await tablesDB.listRows<Caregiver>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_TABLE_ID,
      queries: [Query.equal("$id", Array.from(caregiverIds)), Query.limit(100)],
    });
    caregivers.push(...fetched.rows);
  }

  return Array.from(new Map(caregivers.map((caregiver) => [caregiver.$id, caregiver])).values());
}

export async function emitCaregiverActivityAlerts(params: {
  elderlyId: string;
  elderlyName?: string;
  type: CaregiverActivityAlertType;
  description: string;
  medicationName?: string;
  reminderTimes?: string[];
  scheduleTitle?: string;
  scheduledAt?: string;
}): Promise<void> {
  try {
    const caregivers = await getLinkedCaregiversForElderly(params.elderlyId);
    if (caregivers.length === 0) return;

    const elderlyName = await resolveElderlyName(
      params.elderlyId,
      params.elderlyName,
    );

    const { title, body, screen } = buildCaregiverActivityNotificationContent({
      elderlyName,
      type: params.type,
      description: params.description,
    });

    const caregiverUserIds = caregivers
      .map((caregiver) => caregiver.user_id)
      .filter((userId): userId is string => !!userId);

    if (caregiverUserIds.length > 0) {
      triggerUserPush({
        mode: "users",
        recipientUserIds: caregiverUserIds,
        title,
        body,
        data: {
          type: "caregiver_activity",
          screen,
          elderlyId: params.elderlyId,
          elderlyName,
          activityType: params.type,
          medicationName: params.medicationName ?? null,
          reminderTimes: params.reminderTimes ?? null,
          scheduleTitle: params.scheduleTitle ?? null,
          scheduledAt: params.scheduledAt ?? null,
        },
      });
    }

    await Promise.all(
      caregivers
        .filter((caregiver) => !!caregiver.user_id)
        .map((caregiver) =>
          tablesDB.createRow<EmergencyAlert>({
            databaseId: DATABASE_ID,
            tableId: EMERGENCY_ALERTS_TABLE_ID,
            rowId: ID.unique(),
            data: {
              type: params.type,
              elderly_id: params.elderlyId,
              elderly_name: elderlyName,
              caregiver_user_id: caregiver.user_id,
              latitude: null,
              longitude: null,
              location_name: null,
              status: "unread",
              description: params.description,
              resolved_at: null,
              resolved_by: null,
            },
          }),
        ),
    );
  } catch (error) {
    console.warn("[CaregiverActivityAlerts] Failed to emit caregiver alert", error);
  }
}

export async function pushToLinkedCaregiversForElderly(params: {
  elderlyId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const caregivers = await getLinkedCaregiversForElderly(params.elderlyId);
    const caregiverUserIds = caregivers
      .map((caregiver) => caregiver.user_id)
      .filter((userId): userId is string => !!userId);

    if (caregiverUserIds.length === 0) {
      return;
    }

    triggerUserPush({
      mode: "users",
      recipientUserIds: caregiverUserIds,
      title: params.title,
      body: params.body,
      data: params.data,
    });
  } catch (error) {
    console.warn("[CaregiverActivityAlerts] Failed to push caregiver notification", error);
  }
}

function buildCaregiverActivityNotificationContent(params: {
  elderlyName: string;
  type: CaregiverActivityAlertType;
  description?: string | null;
}): {
  title: string;
  body: string;
  screen: "medication" | "schedule";
} {
  if (params.type === "cg_sched_add") {
    return {
      title: `${params.elderlyName} added a schedule`,
      body: params.description || "A new schedule was added.",
      screen: "schedule",
    };
  }

  if (params.type === "cg_med_cancel") {
    return {
      title: `${params.elderlyName} cancelled a medication`,
      body: params.description || "A medication reminder was cancelled.",
      screen: "medication",
    };
  }

  return {
    title: `${params.elderlyName} added a medication`,
    body: params.description || "A new medication was added.",
    screen: "medication",
  };
}

export function getCaregiverActivityNotificationContent(alert: EmergencyAlert): {
  title: string;
  body: string;
  screen: "medication" | "schedule";
} {
  return buildCaregiverActivityNotificationContent({
    elderlyName: alert.elderly_name,
    type: alert.type as CaregiverActivityAlertType,
    description: alert.description,
  });
}