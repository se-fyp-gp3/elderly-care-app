import { ImagePickerAsset } from "expo-image-picker";
import { ExecutionMethod } from "react-native-appwrite";
import { ID as AppwriteID, CAREGIVER_TABLE_ID, DATABASE_ID, ELDERLY_TABLE_ID, functions, ROLE_MANAGEMENT_FUNCTION_ID, storage, tablesDB, USER_ICON_BUCKET_ID } from "./appwrite";
import { getCaregiverByUserId } from "./caregiver";
import { getElderlyByUserId } from "./elderly";

export async function checkProfileExists(
  userId: string,
  role: "elderly" | "caregiver",
): Promise<boolean> {
  if (role === "elderly") {
    const profile = await getElderlyByUserId(userId);
    return profile !== null;
  } else {
    const profile = await getCaregiverByUserId(userId);
    return profile !== null;
  }
}

export function hasLabel(
  userLabels: string[] | undefined,
  label: string,
): boolean {
  if (!userLabels || userLabels.length === 0) {
    return false;
  }
  return userLabels.includes(label);
}

export function hasTrialLabel(userLabels: string[] | undefined): boolean {
  return hasLabel(userLabels, "trial");
}

export async function addRoleLabel(
  userId: string,
  role: "elderly" | "caregiver",
): Promise<void> {
  try {
    const result = await functions.createExecution({
      functionId: ROLE_MANAGEMENT_FUNCTION_ID,
      body: JSON.stringify({
        role,
      }),
      xpath: `/users/${userId}/labels`,
      method: ExecutionMethod.POST,
    });
    console.log("Role label added successfully:", result);
  } catch (error) {
    console.error("Error adding role label:", error);
    throw error;
  }
}

export async function removeRoleLabel(
  userId: string,
  role: "elderly" | "caregiver",
): Promise<void> {
  try {
    const result = await functions.createExecution({
      functionId: ROLE_MANAGEMENT_FUNCTION_ID,
      body: JSON.stringify({
        role,
      }),
      xpath: `/users/${userId}/labels`,
      method: ExecutionMethod.DELETE,
    });
    console.log("Role label removed successfully:", result);
  } catch (error) {
    console.error("Error removing role label:", error);
    throw error;
  }
}

/**
 * Upload an avatar image to the user_icon bucket.
 * Returns the file ID.
 */
export async function uploadAvatar(asset: ImagePickerAsset): Promise<string> {
  const uri = asset.uri;
  const fileName = asset.fileName || `avatar_${Date.now()}.jpg`;
  const mimeType = asset.mimeType || "image/jpeg";

  const file = {
    name: fileName,
    type: mimeType,
    size: asset.fileSize || 0,
    uri,
  };

  const result = await storage.createFile(USER_ICON_BUCKET_ID, AppwriteID.unique(), file);
  return result.$id;
}

/**
 * Update the avatar_file_id field on an elderly or caregiver profile.
 */
export async function updateProfileAvatar(
  profileId: string,
  role: "elderly" | "caregiver",
  fileId: string,
): Promise<void> {
  const tableId = role === "elderly" ? ELDERLY_TABLE_ID : CAREGIVER_TABLE_ID;
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId,
    rowId: profileId,
    data: { avatar_file_id: fileId },
  });
}

export function isProfileAvatarSchemaMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes('Unknown attribute: "avatar_file_id"');
}

/**
 * Build a URL for a user avatar from a file ID in the user_icon bucket.
 */
export function buildAvatarUrl(fileId: string): URL {
  return storage.getFileViewURL(USER_ICON_BUCKET_ID, fileId);
}
