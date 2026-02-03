import { users } from "./appwrite";
import { getElderlyByUserId } from "./elderly";
import { getCaregiverByUserId } from "./caregiver";
import { UserPreferences } from "@/types/user";

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
    await users.updateLabels({ userId: userId, labels: [role] });
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
    const user = await users.get<UserPreferences>({ userId });
    const currentLabels = user.labels || [];
    const updatedLabels = currentLabels.filter((label) => label !== role);
    await users.updateLabels({ userId: userId, labels: updatedLabels });
  } catch (error) {
    console.error("Error removing role label:", error);
    throw error;
  }
}