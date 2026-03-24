import { Caregiver, CaregiverConnection, CaregiverElderly, Elderly, ElderlyConnections } from "@/types/appwrite";
import { ID, Query } from "react-native-appwrite";
import {
  CAREGIVER_CONNECTIONS_TABLE_ID,
  CAREGIVER_ELDERLY_TABLE_ID,
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  ELDERLY_CONNECTIONS_TABLE_ID,
  ELDERLY_TABLE_ID,
  tablesDB
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
 * For a caregiver user: get all linked elderly AND connected caregivers as contacts
 */
export async function getContactsForCaregiver(
  caregiverId: string,
): Promise<Contact[]> {
  try {
    // Fetch elderly contacts and caregiver contacts in parallel
    const [elderlyContacts, caregiverContacts] = await Promise.all([
      getElderlyContactsForCaregiver(caregiverId),
      getCaregiverContacts(caregiverId),
    ]);

    return [...elderlyContacts, ...caregiverContacts];
  } catch (error) {
    console.error("Error fetching contacts for caregiver:", error);
    return [];
  }
}

/**
 * Get linked elderly contacts for a caregiver (from caregiver_elderly table)
 */
async function getElderlyContactsForCaregiver(
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
    console.error("Error fetching elderly contacts for caregiver:", error);
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
 * Search for a caregiver by phone number.
 * Returns the caregiver if found, null otherwise.
 */
export async function searchCaregiverByPhone(
  phone: string,
): Promise<Caregiver | null> {
  try {
    const normalised = phone.replace(/\s+/g, "").replace(/^(\+852)/, "");
    const response = await tablesDB.listRows<Caregiver>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_TABLE_ID,
      queries: [Query.limit(100)],
    });
    const match = response.rows.find((c) => {
      const p = (c.phone ?? "").replace(/\s+/g, "").replace(/^(\+852)/, "");
      return p === normalised;
    });
    return match ?? null;
  } catch (error) {
    console.error("Error searching caregiver by phone:", error);
    return null;
  }
}

/**
 * Check if a caregiver–elderly relationship already exists.
 */
export async function relationshipExists(
  caregiverId: string,
  elderlyId: string,
): Promise<boolean> {
  try {
    const response = await tablesDB.listRows<CaregiverElderly>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_ELDERLY_TABLE_ID,
      queries: [
        Query.equal("caregiver", caregiverId),
        Query.equal("elderly", elderlyId),
        Query.limit(1),
      ],
    });
    return response.total > 0;
  } catch (error) {
    console.error("Error checking relationship:", error);
    return false;
  }
}

/**
 * Create a new caregiver–elderly relationship.
 * Returns true on success.
 */
export async function addCaregiverContact(
  caregiverId: string,
  elderlyId: string,
): Promise<boolean> {
  try {
    const exists = await relationshipExists(caregiverId, elderlyId);
    if (exists) return false;

    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_ELDERLY_TABLE_ID,
      rowId: ID.unique(),
      data: {
        caregiver: caregiverId,
        elderly: elderlyId,
      },
    });
    return true;
  } catch (error) {
    console.error("Error adding caregiver contact:", error);
    return false;
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

/**
 * Search for any user (elderly or caregiver) by phone number.
 * Returns the matched profile with its role, or null if not found.
 */
export async function searchUserByPhone(
  phone: string,
): Promise<{ role: "elderly"; data: Elderly } | { role: "caregiver"; data: Caregiver } | null> {
  const [elderly, caregiver] = await Promise.all([
    searchElderlyByPhone(phone),
    searchCaregiverByPhone(phone),
  ]);
  if (elderly) return { role: "elderly", data: elderly };
  if (caregiver) return { role: "caregiver", data: caregiver };
  return null;
}

// ────────────────────────────────────────────────────
// Elderly-to-Elderly connection helpers
// ────────────────────────────────────────────────────

/**
 * Search for an elderly user by phone number.
 * Returns the elderly if found, null otherwise.
 */
export async function searchElderlyByPhone(
  phone: string,
): Promise<Elderly | null> {
  try {
    const normalised = phone.replace(/\s+/g, "").replace(/^(\+852)/, "");
    const response = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.limit(100)],
    });
    const match = response.rows.find((e) => {
      const p = (e.phone ?? "").replace(/\s+/g, "").replace(/^(\+852)/, "");
      return p === normalised;
    });
    return match ?? null;
  } catch (error) {
    console.error("Error searching elderly by phone:", error);
    return null;
  }
}

/**
 * Check if an elderly-to-elderly connection already exists (in either direction).
 */
export async function elderlyConnectionExists(
  elderlyId1: string,
  elderlyId2: string,
): Promise<boolean> {
  try {
    // Check both directions: (id1, id2) and (id2, id1)
    const [fwd, rev] = await Promise.all([
      tablesDB.listRows<ElderlyConnections>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("elderly_id_1", elderlyId1),
          Query.equal("elderly_id_2", elderlyId2),
          Query.limit(1),
        ],
      }),
      tablesDB.listRows<ElderlyConnections>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("elderly_id_1", elderlyId2),
          Query.equal("elderly_id_2", elderlyId1),
          Query.limit(1),
        ],
      }),
    ]);
    return fwd.total > 0 || rev.total > 0;
  } catch (error) {
    console.error("Error checking elderly connection:", error);
    return false;
  }
}

/**
 * Create a new elderly-to-elderly connection request (pending approval).
 * Returns true on success, false if already exists.
 */
export async function addElderlyConnection(
  elderlyId1: string,
  elderlyId2: string,
): Promise<boolean> {
  try {
    const exists = await elderlyConnectionExists(elderlyId1, elderlyId2);
    if (exists) return false;

    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_CONNECTIONS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        elderly_id_1: elderlyId1,
        elderly_id_2: elderlyId2,
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });
    return true;
  } catch (error) {
    console.error("Error adding elderly connection:", error);
    return false;
  }
}

/**
 * Accept a pending connection request. Sets status to "active".
 */
export async function acceptElderlyConnection(
  connectionDocId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_CONNECTIONS_TABLE_ID,
    rowId: connectionDocId,
    data: { status: "active" },
  });
}

/**
 * Reject / decline a pending connection request. Deletes the row.
 */
export async function rejectElderlyConnection(
  connectionDocId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: ELDERLY_CONNECTIONS_TABLE_ID,
    rowId: connectionDocId,
    data: { status: "rejected" },
  });
}

/**
 * Get incoming pending connection requests for an elderly user.
 * These are rows where *this* user is elderly_id_2 and status = "pending".
 */
export async function getPendingConnectionRequests(
  elderlyId: string,
): Promise<{ connectionId: string; from: Elderly }[]> {
  try {
    const response = await tablesDB.listRows<ElderlyConnections>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_CONNECTIONS_TABLE_ID,
      queries: [
        Query.equal("elderly_id_2", elderlyId),
        Query.equal("status", "pending"),
        Query.limit(50),
      ],
    });

    if (response.rows.length === 0) return [];

    const senderIds = response.rows.map((r) => r.elderly_id_1);
    const unique = [...new Set(senderIds)];
    const details = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("$id", unique), Query.limit(100)],
    });

    const elderlyMap = new Map(details.rows.map((e) => [e.$id, e]));

    return response.rows
      .filter((r) => elderlyMap.has(r.elderly_id_1))
      .map((r) => ({
        connectionId: r.$id,
        from: elderlyMap.get(r.elderly_id_1)!,
      }));
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    return [];
  }
}

/**
 * Get all elderly contacts for an elderly user (from elderly_connections table).
 * Looks up connections in both directions.
 */
export async function getElderlyContacts(
  elderlyId: string,
): Promise<Contact[]> {
  try {
    // Fetch connections where this elderly is on either side
    const [asId1, asId2] = await Promise.all([
      tablesDB.listRows<ElderlyConnections>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("elderly_id_1", elderlyId),
          Query.equal("status", "active"),
          Query.limit(100),
        ],
      }),
      tablesDB.listRows<ElderlyConnections>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("elderly_id_2", elderlyId),
          Query.equal("status", "active"),
          Query.limit(100),
        ],
      }),
    ]);

    // Collect all connected elderly IDs
    const connectedIds = new Set<string>();
    for (const row of asId1.rows) connectedIds.add(row.elderly_id_2);
    for (const row of asId2.rows) connectedIds.add(row.elderly_id_1);

    if (connectedIds.size === 0) return [];

    // Fetch the elderly profiles
    const ids = [...connectedIds];
    const detailsResponse = await tablesDB.listRows<Elderly>({
      databaseId: DATABASE_ID,
      tableId: ELDERLY_TABLE_ID,
      queries: [Query.equal("$id", ids), Query.limit(100)],
    });

    return detailsResponse.rows.map((elderly) => ({
      id: elderly.$id,
      name: elderly.name || "Unknown",
      phone: elderly.phone,
      role: "elderly" as const,
      avatarLabel: (elderly.name || "??").substring(0, 2).toUpperCase(),
      status: elderly.status,
      lastActive: elderly.$updatedAt,
    }));
  } catch (error) {
    console.error("Error fetching elderly contacts:", error);
    return [];
  }
}

// ────────────────────────────────────────────────────
// Caregiver-to-Caregiver connection helpers
// ────────────────────────────────────────────────────

/**
 * Check if a caregiver-to-caregiver connection already exists (in either direction).
 */
export async function caregiverConnectionExists(
  caregiverId1: string,
  caregiverId2: string,
): Promise<boolean> {
  try {
    const [fwd, rev] = await Promise.all([
      tablesDB.listRows<CaregiverConnection>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("caregiver_id_1", caregiverId1),
          Query.equal("caregiver_id_2", caregiverId2),
          Query.limit(1),
        ],
      }),
      tablesDB.listRows<CaregiverConnection>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("caregiver_id_1", caregiverId2),
          Query.equal("caregiver_id_2", caregiverId1),
          Query.limit(1),
        ],
      }),
    ]);
    return fwd.total > 0 || rev.total > 0;
  } catch (error) {
    console.error("Error checking caregiver connection:", error);
    return false;
  }
}

/**
 * Create a new caregiver-to-caregiver connection.
 * Returns true on success, false if already exists.
 */
export async function addCaregiverConnection(
  caregiverId1: string,
  caregiverId2: string,
): Promise<boolean> {
  try {
    const exists = await caregiverConnectionExists(caregiverId1, caregiverId2);
    if (exists) return false;

    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_CONNECTIONS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        caregiver_id_1: caregiverId1,
        caregiver_id_2: caregiverId2,
        status: "active",
        created_at: new Date().toISOString(),
      },
    });
    return true;
  } catch (error) {
    console.error("Error adding caregiver connection:", error);
    return false;
  }
}

/**
 * Get all caregiver contacts for a caregiver (from caregiver_connections table).
 * Looks up connections in both directions.
 */
export async function getCaregiverContacts(
  caregiverId: string,
): Promise<Contact[]> {
  try {
    const [asId1, asId2] = await Promise.all([
      tablesDB.listRows<CaregiverConnection>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("caregiver_id_1", caregiverId),
          Query.equal("status", "active"),
          Query.limit(100),
        ],
      }),
      tablesDB.listRows<CaregiverConnection>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_CONNECTIONS_TABLE_ID,
        queries: [
          Query.equal("caregiver_id_2", caregiverId),
          Query.equal("status", "active"),
          Query.limit(100),
        ],
      }),
    ]);

    const connectedIds = new Set<string>();
    for (const row of asId1.rows) connectedIds.add(row.caregiver_id_2);
    for (const row of asId2.rows) connectedIds.add(row.caregiver_id_1);

    if (connectedIds.size === 0) return [];

    const ids = [...connectedIds];

    // 1. Try to find them as Caregivers
    const caregiverResponse = await tablesDB.listRows<Caregiver>({
      databaseId: DATABASE_ID,
      tableId: CAREGIVER_TABLE_ID,
      queries: [Query.equal("$id", ids), Query.limit(100)],
    });
    
    const caregivers = caregiverResponse.rows;
    const foundIds = new Set(caregivers.map((c) => c.$id));
    
    // 2. Identify missing IDs and try to find them as Elderly
    const missingIds = ids.filter((id) => !foundIds.has(id));
    let elderlyList: Elderly[] = [];
    
    if (missingIds.length > 0) {
      const elderlyResponse = await tablesDB.listRows<Elderly>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_TABLE_ID,
        queries: [Query.equal("$id", missingIds), Query.limit(100)],
      });
      elderlyList = elderlyResponse.rows;
    }

    const contactsFromCaregivers: Contact[] = caregivers.map((c) => ({
      id: c.$id,
      name: c.name || "Unknown",
      phone: c.phone,
      role: "caregiver" as const,
      avatarLabel: (c.name || "??").substring(0, 2).toUpperCase(),
      lastActive: c.$updatedAt,
    }));

    const contactsFromElderly: Contact[] = elderlyList.map((e) => ({
      id: e.$id,
      name: e.name || "Unknown",
      phone: e.phone,
      role: "elderly" as const,
      avatarLabel: (e.name || "??").substring(0, 2).toUpperCase(),
      status: e.status,
      lastActive: e.$updatedAt,
    }));

    return [...contactsFromCaregivers, ...contactsFromElderly];
  } catch (error) {
    console.error("Error fetching caregiver contacts:", error);
    return [];
  }
}
