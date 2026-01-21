import { users } from "./appwrite";
import { getElderlyByUserId } from "./elderly";
import { getCaregiverByUserId } from "./caregiver";

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

