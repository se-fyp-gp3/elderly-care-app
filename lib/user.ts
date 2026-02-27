import { functions } from "./appwrite";
import { getElderlyByUserId } from "./elderly";
import { getCaregiverByUserId } from "./caregiver";
import { ExecutionMethod } from "react-native-appwrite";

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
      functionId: "699dbc63003c1b31c4bb",
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
      functionId: "699dbc63003c1b31c4bb",
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
