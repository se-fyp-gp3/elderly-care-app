import { MedicationItem } from "@/components/MedicationCard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";

interface ElderlyGroupSummaryProps {
  medications: MedicationItem[];
}

export default function ElderlyGroupSummary({
  medications,
}: ElderlyGroupSummaryProps) {
  const theme = useTheme();

  if (medications.length === 0) return null;

  const totalMeds = medications.length;
  const completedMeds = medications.filter(
    (m) => m.status === "completed",
  ).length;
  const missedMedsCount = medications.filter(
    (m) => m.status === "missed",
  ).length;
  const nextPending = [...medications]
    .sort((a, b) => a.time.localeCompare(b.time))
    .find((m) => m.status === "pending");
  const allDone = completedMeds === totalMeds;
  const progress = totalMeds > 0 ? completedMeds / totalMeds : 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: allDone
          ? theme.colors.primaryContainer
          : missedMedsCount > 0 && !nextPending
            ? theme.colors.errorContainer
            : theme.colors.surfaceVariant,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 12,
      }}
    >
      {/* Progress bar */}
      <View
        style={{
          width: 56,
          height: 6,
          backgroundColor: "rgba(0,0,0,0.1)",
          borderRadius: 3,
          marginRight: 10,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            backgroundColor: allDone ? "#4CAF50" : theme.colors.primary,
            borderRadius: 3,
          }}
        />
      </View>
      <Text
        variant="labelMedium"
        style={{
          fontWeight: "bold",
          marginRight: 10,
          color: allDone
            ? theme.colors.onPrimaryContainer
            : missedMedsCount > 0 && !nextPending
              ? theme.colors.onErrorContainer
              : theme.colors.onSurfaceVariant,
        }}
      >
        {completedMeds}/{totalMeds}
      </Text>
      <MaterialCommunityIcons
        name={
          allDone
            ? "check-circle"
            : nextPending
              ? "clock-outline"
              : "alert-circle-outline"
        }
        size={14}
        color={
          allDone
            ? "#4CAF50"
            : missedMedsCount > 0 && !nextPending
              ? theme.colors.error
              : theme.colors.onSurfaceVariant
        }
        style={{ marginRight: 4 }}
      />
      <Text
        variant="bodySmall"
        style={{
          flex: 1,
          color: allDone
            ? "#4CAF50"
            : missedMedsCount > 0 && !nextPending
              ? theme.colors.error
              : theme.colors.onSurfaceVariant,
        }}
      >
        {allDone
          ? "All taken today"
          : nextPending
            ? `Next: ${nextPending.time} ${nextPending.name}${missedMedsCount > 0 ? ` · ${missedMedsCount} missed` : ""}`
            : missedMedsCount === 1
              ? `1 missed · ${medications.find((m) => m.status === "missed")?.name || ""}`
              : `${missedMedsCount} missed`}
      </Text>
    </View>
  );
}
