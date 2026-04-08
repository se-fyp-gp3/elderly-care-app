import { MedicationItem } from "@/components/MedicationCard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import {
    Avatar,
    Button,
    Card,
    IconButton,
    Text,
    useTheme,
} from "react-native-paper";

interface TimeSlotCardProps {
  timeSlot: string;
  meds: MedicationItem[];
  groupElderlyId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemindLater: (medId: string) => void;
  onConfirmTaking: (med: MedicationItem) => void;
  onUndoTaking: (med: MedicationItem) => void;
  setNoteText: (text: string) => void;
}

export default function TimeSlotCard({
  timeSlot,
  meds,
  isExpanded,
  onToggleExpand,
  onRemindLater,
  onConfirmTaking,
  onUndoTaking,
  setNoteText,
}: TimeSlotCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const totalMeds = meds.length;
  const completedMeds = meds.filter((m) => m.status === "completed").length;
  const missedMeds = meds.filter((m) => m.status === "missed").length;
  const allDone = completedMeds === totalMeds;
  const progress = totalMeds > 0 ? completedMeds / totalMeds : 0;

  let summaryText = "";
  let summaryIcon = "information-outline";
  if (allDone) {
    summaryText = t('medication.allTaken');
    summaryIcon = "check-circle";
  } else if (missedMeds > 0 && completedMeds + missedMeds === totalMeds) {
    summaryText = `${missedMeds} ${t('common.missed').toLowerCase()}`;
    summaryIcon = "alert-circle-outline";
  } else {
    const pendingCount = totalMeds - completedMeds - missedMeds;
    summaryText = `${pendingCount} ${t('common.pending').toLowerCase()}`;
    if (missedMeds > 0) summaryText += ` · ${missedMeds} ${t('common.missed').toLowerCase()}`;
    summaryIcon = "clock-outline";
  }

  return (
    <Card
      style={{
        marginBottom: 16,
        backgroundColor: theme.colors.elevation.level1,
      }}
    >
      <Card.Title
        title={timeSlot}
        titleStyle={{ fontWeight: "bold", fontSize: 20 }}
        subtitle={`${totalMeds} ${t('medication.medications', { count: totalMeds })}`}
        left={(props) => (
          <Avatar.Icon
            {...props}
            icon="clock-outline"
            size={40}
            style={{
              backgroundColor: allDone
                ? "#E8F5E9"
                : missedMeds > 0
                  ? theme.colors.errorContainer
                  : theme.colors.primaryContainer,
            }}
            color={
              allDone
                ? "#4CAF50"
                : missedMeds > 0
                  ? theme.colors.error
                  : theme.colors.onPrimaryContainer
            }
          />
        )}
        right={() => (
          <IconButton
            icon={isExpanded ? "chevron-up" : "chevron-down"}
            onPress={onToggleExpand}
            size={24}
          />
        )}
      />
      <Card.Content>
        {/* Summary bar */}
        {!isExpanded && (
          <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.7}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: allDone
                  ? theme.colors.primaryContainer
                  : missedMeds > 0
                    ? theme.colors.errorContainer
                    : theme.colors.surfaceVariant,
                borderRadius: 8,
              }}
            >
              {/* Progress bar */}
              <View
                style={{
                  width: 48,
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
                    backgroundColor: allDone
                      ? "#4CAF50"
                      : theme.colors.primary,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text
                variant="labelMedium"
                style={{
                  fontWeight: "bold",
                  marginRight: 12,
                  color: allDone
                    ? theme.colors.onPrimaryContainer
                    : missedMeds > 0
                      ? theme.colors.onErrorContainer
                      : theme.colors.onSurfaceVariant,
                }}
              >
                {completedMeds}/{totalMeds}
              </Text>
              <MaterialCommunityIcons
                name={summaryIcon as any}
                size={16}
                color={
                  allDone
                    ? "#4CAF50"
                    : missedMeds > 0
                      ? theme.colors.error
                      : theme.colors.onSurfaceVariant
                }
                style={{ marginRight: 4 }}
              />
              <Text
                variant="bodySmall"
                style={{
                  color: allDone
                    ? "#4CAF50"
                    : missedMeds > 0
                      ? theme.colors.error
                      : theme.colors.onSurfaceVariant,
                  flex: 1,
                }}
              >
                {summaryText}
              </Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={18}
                color={theme.colors.outline}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Medications in this time slot — visible when expanded */}
        {isExpanded &&
          meds.map((med, index) => (
            <View
              key={med.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 12,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: theme.colors.surfaceVariant,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <Avatar.Icon
                  icon="pill"
                  size={32}
                  style={{
                    backgroundColor:
                      med.status === "completed"
                        ? "#E8F5E9"
                        : theme.colors.primaryContainer,
                    marginRight: 10,
                  }}
                  color={
                    med.status === "completed"
                      ? "#4CAF50"
                      : theme.colors.onPrimaryContainer
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ fontWeight: "600" }}>
                    {med.name}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.outline }}
                  >
                    {med.dosage} • {med.frequency}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor:
                      med.status === "completed"
                        ? theme.colors.primaryContainer
                        : med.status === "missed"
                          ? theme.colors.errorContainer
                          : theme.colors.surfaceVariant,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginRight: 4,
                  }}
                >
                  <Text
                    style={{
                      color:
                        med.status === "completed"
                          ? theme.colors.onPrimaryContainer
                          : med.status === "missed"
                            ? theme.colors.onErrorContainer
                            : theme.colors.onSurfaceVariant,
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    {med.status === "completed"
                      ? t('common.taken')
                      : med.status === "pending"
                        ? t('common.pending')
                        : med.status.charAt(0).toUpperCase() +
                          med.status.slice(1)}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {med.status === "pending" || med.status === "missed" ? (
                  <>
                    <IconButton
                      icon="bell-outline"
                      size={20}
                      onPress={() => onRemindLater(med.id)}
                      style={{ margin: 0 }}
                    />
                    <Button
                      mode="contained"
                      compact
                      onPress={() => {
                        onConfirmTaking(med);
                        setNoteText(med.notes || "");
                      }}
                      style={{ marginLeft: 4 }}
                    >
                      {t('medication.take')}
                    </Button>
                  </>
                ) : (
                  med.status === "completed" && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={16}
                        color={theme.colors.primary}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        variant="bodySmall"
                        style={{
                          color: theme.colors.outline,
                          marginRight: 8,
                        }}
                      >
                        {med.takenAtIso
                          ? new Date(med.takenAtIso).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : med.lastTaken}
                      </Text>
                      <Button
                        icon="undo"
                        compact
                        mode="text"
                        onPress={() => onUndoTaking(med)}
                        labelStyle={{ fontSize: 12 }}
                      >
                        {t('medication.undo')}
                      </Button>
                    </View>
                  )
                )}
              </View>
            </View>
          ))}
      </Card.Content>
    </Card>
  );
}
