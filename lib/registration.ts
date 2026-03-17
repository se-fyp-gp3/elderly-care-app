import { Elderly } from "@/types/appwrite";
import type { Models } from "node-appwrite";
import { ExecutionMethod, ID, Query } from "react-native-appwrite";
import {
  DATABASE_ID,
  functions,
  REGISTRATION_REQUESTS_TABLE_ID,
  tablesDB,
} from "./appwrite";
import { getCaregiverByUserId, linkCaregiverToElderly } from "./caregiver";
import { createElderlyProfile, getElderlyByUserId } from "./elderly";

export type RegistrationRequest = Models.Row & {
  token: string;
  status: "pending" | "scanned" | "completed" | "cancelled";
  elderly_email: string | null;
  elderly_user_id: string | null;
  elderly_token_secret: string | null;
  caregiver_user_id: string | null;
};

/**
 * Create a new pending registration request with a unique token.
 * Called by the elderly device when showing the QR code.
 */
export async function createRegistrationRequest(
  token: string,
): Promise<RegistrationRequest> {
  const doc = await tablesDB.createRow<RegistrationRequest>({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      token,
      status: "pending",
      elderly_email: null,
      elderly_user_id: null,
      elderly_token_secret: null,
      caregiver_user_id: null,
    },
  });
  return doc as unknown as RegistrationRequest;
}

/**
 * Get a registration request by its token.
 * Used for polling on the elderly device.
 */
export async function getRegistrationRequest(
  token: string,
): Promise<RegistrationRequest | null> {
  try {
    const response = await tablesDB.listRows<RegistrationRequest>({
      databaseId: DATABASE_ID,
      tableId: REGISTRATION_REQUESTS_TABLE_ID,
      queries: [Query.equal("token", token), Query.limit(1)],
    });
    if (response.total > 0) {
      return response.rows[0] as unknown as RegistrationRequest;
    }
    return null;
  } catch (error) {
    console.error("Error fetching registration request:", error);
    return null;
  }
}

/**
 * Complete a registration request after the caregiver finishes registering the elderly.
 * Updates the document with credentials so the elderly device can auto-sign-in.
 */
export async function completeRegistrationRequest(
  docId: string,
  data: {
    elderlyEmail: string;
    elderlyUserId: string;
    elderlyTokenSecret: string;
    caregiverUserId: string;
  },
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: docId,
    data: {
      status: "completed",
      elderly_email: data.elderlyEmail,
      elderly_user_id: data.elderlyUserId,
      elderly_token_secret: data.elderlyTokenSecret,
      caregiver_user_id: data.caregiverUserId,
    },
  });
}

/**
 * Mark a registration request as scanned by the caregiver.
 */
export async function markRegistrationScanned(docId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: docId,
    data: { status: "scanned" },
  });
}

/**
 * Mark a registration request as cancelled by the caregiver.
 */
export async function cancelRegistrationRequest(docId: string): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: docId,
    data: { status: "cancelled" },
  });
}

/**
 * Delete a registration request.
 * Always called to clean up regardless of outcome.
 */
export async function deleteRegistrationRequest(docId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: REGISTRATION_REQUESTS_TABLE_ID,
      rowId: docId,
    });
  } catch (error: any) {
    // Silently ignore if already deleted (404)
    if (error?.code !== 404) {
      console.error("Error deleting registration request:", error);
    }
  }
}

/**
 * Full registration flow executed by the caregiver.
 * Creates an elderly Appwrite account, profile, and links to caregiver.
 */
export async function registerElderlyForCaregiver(params: {
  token: string;
  email: string;
  name: string;
  phone?: string;
  birthDate?: string;
  caregiverUserId: string;
}): Promise<void> {
  const { token, email, name, phone, birthDate, caregiverUserId } = params;

  // 1. Find the registration request document
  const request = await getRegistrationRequest(token);
  if (!request) {
    throw new Error("Registration request not found or expired.");
  }
  if (request.status === "completed") {
    throw new Error("This registration has already been completed.");
  }

  // 2. Create the elderly's Appwrite user account via server function (no password)
  const userPayload = {
    userId: ID.unique(),
    email,
    name,
    phone: phone || null,
  };

  const execution = await functions.createExecution({
    functionId: "699dbc63003c1b31c4bb",
    body: JSON.stringify(userPayload),
    xpath: "/users",
    method: ExecutionMethod.POST,
    headers: { "Content-Type": "application/json" },
  });

  // Parse the function response to get the created user object
  if (execution.responseStatusCode >= 400) {
    const errBody = JSON.parse(execution.responseBody || "{}");
    throw new Error(
      errBody.error ||
        `User creation failed (status ${execution.responseStatusCode})`,
    );
  }
  const createdUser = JSON.parse(execution.responseBody);
  const elderlyUserId = createdUser.$id;

  // 3a. Set the elderly's role label
  await functions.createExecution({
    functionId: "699dbc63003c1b31c4bb",
    body: JSON.stringify({ role: "elderly" }),
    xpath: `/users/${elderlyUserId}/labels`,
    method: ExecutionMethod.PUT,
  });

  // 3b. Set the elderly's role preference
  await functions.createExecution({
    functionId: "699dbc63003c1b31c4bb",
    body: JSON.stringify({ prefs: { role: "elderly" } }),
    xpath: `/users/${elderlyUserId}/prefs`,
    method: ExecutionMethod.PATCH,
  });

  // 4. Create the elderly profile in the database
  const elderlyProfile = await createElderlyProfile({
    user_id: elderlyUserId,
    name,
    phone: phone || null,
    birth: birthDate || null,
    gender: null,
    blood_type: null,
    emergency_contact: null,
  } as Elderly);

  // 5. Link the caregiver to this elderly
  const caregiver = await getCaregiverByUserId(caregiverUserId);
  if (caregiver) {
    await linkCaregiverToElderly(caregiver.$id, elderlyProfile.$id);
  }

  // 6. Create a custom token for the elderly user to sign in
  const tokenExecution = await functions.createExecution({
    functionId: "699dbc63003c1b31c4bb",
    body: JSON.stringify({ length: 64, expire: 900 }),
    xpath: `/users/${elderlyUserId}/token`,
    method: ExecutionMethod.POST,
    headers: { "Content-Type": "application/json" },
  });

  if (tokenExecution.responseStatusCode >= 400) {
    const errBody = JSON.parse(tokenExecution.responseBody || "{}");
    throw new Error(
      errBody.error ||
        `Token creation failed (status ${tokenExecution.responseStatusCode})`,
    );
  }
  const tokenResult = JSON.parse(tokenExecution.responseBody);

  // 7. Complete the registration request so the elderly device can sign in via token
  await completeRegistrationRequest(request.$id, {
    elderlyEmail: email,
    elderlyUserId,
    elderlyTokenSecret: tokenResult.secret,
    caregiverUserId,
  });
}

/**
 * Create a connection request for an already-registered elderly to pair with a caregiver.
 * The elderly_user_id is set upfront since the elderly is already signed in.
 */
export async function createConnectionRequest(
  token: string,
  elderlyUserId: string,
): Promise<RegistrationRequest> {
  const doc = await tablesDB.createRow<RegistrationRequest>({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      token,
      status: "pending",
      elderly_email: null,
      elderly_user_id: elderlyUserId,
      elderly_token_secret: null,
      caregiver_user_id: null,
    },
  });
  return doc as unknown as RegistrationRequest;
}

/**
 * Complete a connection request after the caregiver confirms the link.
 */
export async function completeConnectionRequest(
  docId: string,
  caregiverUserId: string,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: REGISTRATION_REQUESTS_TABLE_ID,
    rowId: docId,
    data: {
      status: "completed",
      caregiver_user_id: caregiverUserId,
    },
  });
}

/**
 * Full connection flow executed by the caregiver.
 * Links an existing elderly account to the caregiver.
 */
export async function connectCaregiverToElderly(params: {
  token: string;
  caregiverUserId: string;
}): Promise<void> {
  const { token, caregiverUserId } = params;

  const request = await getRegistrationRequest(token);
  if (!request) {
    throw new Error("Connection request not found or expired.");
  }
  if (request.status === "completed") {
    throw new Error("This connection has already been completed.");
  }
  if (!request.elderly_user_id) {
    throw new Error("Invalid connection request: missing elderly user.");
  }

  const elderlyProfile = await getElderlyByUserId(request.elderly_user_id);
  if (!elderlyProfile) {
    throw new Error("Elderly profile not found.");
  }

  const caregiver = await getCaregiverByUserId(caregiverUserId);
  if (!caregiver) {
    throw new Error("Caregiver profile not found.");
  }

  try {
    await linkCaregiverToElderly(caregiver.$id, elderlyProfile.$id);
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";

    const lowerMessage = message.toLowerCase();
    const isDuplicateError =
      lowerMessage.includes("duplicate") ||
      lowerMessage.includes("unique") ||
      lowerMessage.includes("already exists") ||
      lowerMessage.includes("already linked");

    if (!isDuplicateError) {
      // If it's not a duplicate/unique-constraint error, preserve existing behavior.
      throw error;
    }
    // If the caregiver is already linked to this elderly, we still want
    // to mark the connection request as completed so the UI can proceed.
  }

  await completeConnectionRequest(request.$id, caregiverUserId);
}
