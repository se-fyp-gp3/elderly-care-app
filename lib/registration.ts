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
import { createElderlyProfile } from "./elderly";

export type RegistrationRequest = Models.Row & {
  token: string;
  status: "pending" | "completed";
  elderly_email: string | null;
  elderly_password: string | null;
  elderly_user_id: string | null;
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
      elderly_password: null,
      elderly_user_id: null,
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
    elderlyPassword: string;
    elderlyUserId: string;
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
      elderly_password: data.elderlyPassword,
      elderly_user_id: data.elderlyUserId,
      caregiver_user_id: data.caregiverUserId,
    },
  });
}

/**
 * Delete a registration request after the elderly device has signed in.
 * Removes the temporary credentials from the database.
 */
export async function deleteRegistrationRequest(docId: string): Promise<void> {
  try {
    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: REGISTRATION_REQUESTS_TABLE_ID,
      rowId: docId,
    });
  } catch (error) {
    console.error("Error deleting registration request:", error);
  }
}

/**
 * Full registration flow executed by the caregiver.
 * Creates an elderly Appwrite account, profile, and links to caregiver.
 */
export async function registerElderlyForCaregiver(params: {
  token: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  birthDate?: string;
  caregiverUserId: string;
}): Promise<void> {
  const { token, email, password, name, phone, birthDate, caregiverUserId } =
    params;

  // 1. Find the registration request document
  const request = await getRegistrationRequest(token);
  if (!request) {
    throw new Error("Registration request not found or expired.");
  }
  if (request.status === "completed") {
    throw new Error("This registration has already been completed.");
  }

  // 2. Create the elderly's Appwrite user account via server function
  const userPayload = {
    userId: ID.unique(),
    email,
    password,
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
  await createElderlyProfile({
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
    await linkCaregiverToElderly(caregiver.$id, elderlyUserId);
  }

  // 6. Complete the registration request so the elderly device can sign in
  await completeRegistrationRequest(request.$id, {
    elderlyEmail: email,
    elderlyPassword: password,
    elderlyUserId,
    caregiverUserId,
  });
}
