import { ScheduleStatus } from "@/types/appwrite";
import { MD3Theme } from "react-native-paper";

export function getStatusColor(status: string, theme: MD3Theme): string {
  if (status === ScheduleStatus.COMPLETED) return theme.colors.primary;
  if (status === ScheduleStatus.MISSED) return theme.colors.error;
  return theme.colors.secondary;
}

export function getTypeIcon(type: string): string {
  switch (type) {
    case "medication":
      return "pill";
    case "appointment":
      return "doctor";
    case "meal":
      return "food";
    case "activity":
      return "walk";
    case "checkup":
      return "heart-pulse";
    default:
      return "calendar-check";
  }
}
