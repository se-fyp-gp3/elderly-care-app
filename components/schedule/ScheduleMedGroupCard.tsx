import { ScheduleEvent } from "@/lib/schedule";
import { ScheduleStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import {
    Avatar,
    Button,
    Card,
    Divider,
    IconButton,
    Text,
    useTheme,
} from "react-native-paper";
import { getStatusColor } from "./helpers";
import { DisplayItem } from "./types";

type MedGroupData = Extract<DisplayItem, { kind: "medGroup" }>;

interface ScheduleMedGroupCardProps {
  group: MedGroupData;
  onTakeMedication: (event: ScheduleEvent) => void;
  onUndoMedication: (event: ScheduleEvent) => void;
  onRemindMedication: (event: ScheduleEvent) => void;
}

export default function ScheduleMedGroupCard({
  group,
  onTakeMedication,
  onUndoMedication,
  onRemindMedication,
}: ScheduleMedGroupCardProps) {
  const theme = useTheme();

  const allCompleted = group.events.every(
    (e) =>
      String(e.status).toLowerCase() ===
      ScheduleStatus.COMPLETED.toLowerCase(),
  );
  const anyMissed = group.events.some(
    (e) =>
      String(e.status).toLowerCase() === ScheduleStatus.MISSED.toLowerCase(),
  );
  const groupStatus = allCompleted
    ? ScheduleStatus.COMPLETED
    : anyMissed
      ? ScheduleStatus.MISSED
      : ScheduleStatus.PENDING;
  const completedCount = group.events.filter(
    (e) =>
      String(e.status).toLowerCase() ===
      ScheduleStatus.COMPLETED.toLowerCase(),
  ).length;

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{group.time}</Text>
        {allCompleted && (
          <MaterialCommunityIcons
            name="check-circle"
            size={16}
            color={theme.colors.primary}
            style={{ marginTop: 4 }}
          />
        )}
        {!allCompleted && anyMissed && (
          <MaterialCommunityIcons
            name="alert-circle"
            size={16}
            color={theme.colors.error}
            style={{ marginTop: 4 }}
          />
        )}
      </View>

      <View style={styles.timelineLineContainer}>
        <View
          style={[
            styles.timelineLine,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <View
          style={[
            styles.timelineDot,
            { backgroundColor: getStatusColor(groupStatus, theme) },
          ]}
        />
      </View>

      <Card
        style={{
          flex: 1,
          marginLeft: 8,
          marginBottom: 20,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
          }}
        >
          <Avatar.Icon
            icon="pill"
            size={40}
            style={{
              backgroundColor: allCompleted
                ? "#E8F5E9"
                : anyMissed
                  ? theme.colors.errorContainer
                  : theme.colors.secondaryContainer,
              marginRight: 12,
            }}
            color={
              allCompleted
                ? "#4CAF50"
                : anyMissed
                  ? theme.colors.error
                  : theme.colors.onSecondaryContainer
            }
          />
          <View style={{ flex: 1 }}>
            <Text
              variant="titleMedium"
              style={{ fontWeight: "bold", fontSize: 16 }}
            >
              {group.events.length} medication
              {group.events.length > 1 ? "s" : ""}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <MaterialCommunityIcons
                name="account"
                size={14}
                color={theme.colors.secondary}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.secondary, marginLeft: 4 }}
              >
                {group.elderlyName}
              </Text>
            </View>
          </View>
        </View>
        {/* Progress bar */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                flex: 1,
                height: 4,
                backgroundColor: "rgba(0,0,0,0.1)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${(completedCount / group.events.length) * 100}%`,
                  height: "100%",
                  backgroundColor: allCompleted
                    ? "#4CAF50"
                    : theme.colors.primary,
                  borderRadius: 2,
                }}
              />
            </View>
            <Text
              variant="labelSmall"
              style={{ marginLeft: 8, color: theme.colors.outline }}
            >
              {completedCount}/{group.events.length}
            </Text>
          </View>
        </View>
        <Divider />
        <Card.Content>
          {group.events.map((med, index) => (
            <View
              key={med.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 10,
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
                  size={28}
                  style={{
                    backgroundColor:
                      String(med.status).toLowerCase() ===
                      ScheduleStatus.COMPLETED.toLowerCase()
                        ? "#E8F5E9"
                        : theme.colors.primaryContainer,
                    marginRight: 8,
                  }}
                  color={
                    String(med.status).toLowerCase() ===
                    ScheduleStatus.COMPLETED.toLowerCase()
                      ? "#4CAF50"
                      : theme.colors.onPrimaryContainer
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ fontWeight: "600" }}>
                    {med.title}
                  </Text>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: theme.colors.outline }}
                  >
                    {med.description}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor:
                      String(med.status).toLowerCase() ===
                      ScheduleStatus.COMPLETED.toLowerCase()
                        ? theme.colors.primaryContainer
                        : String(med.status).toLowerCase() ===
                            ScheduleStatus.MISSED.toLowerCase()
                          ? theme.colors.errorContainer
                          : theme.colors.surfaceVariant,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginRight: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "bold",
                      color:
                        String(med.status).toLowerCase() ===
                        ScheduleStatus.COMPLETED.toLowerCase()
                          ? theme.colors.onPrimaryContainer
                          : String(med.status).toLowerCase() ===
                              ScheduleStatus.MISSED.toLowerCase()
                            ? theme.colors.onErrorContainer
                            : theme.colors.onSurfaceVariant,
                    }}
                  >
                    {String(med.status).toLowerCase() ===
                    ScheduleStatus.COMPLETED.toLowerCase()
                      ? "Taken"
                      : String(med.status).toLowerCase() ===
                          ScheduleStatus.MISSED.toLowerCase()
                        ? "Missed"
                        : "Pending"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {String(med.status).toLowerCase() ===
                  ScheduleStatus.PENDING.toLowerCase() ||
                String(med.status).toLowerCase() ===
                  ScheduleStatus.MISSED.toLowerCase() ? (
                  <>
                    <IconButton
                      icon="bell-outline"
                      size={18}
                      onPress={() => onRemindMedication(med)}
                      style={{ margin: 0 }}
                    />
                    <Button
                      mode="contained"
                      compact
                      onPress={() => onTakeMedication(med)}
                      labelStyle={{ fontSize: 12 }}
                    >
                      Take
                    </Button>
                  </>
                ) : (
                  <Button
                    icon="undo"
                    compact
                    mode="text"
                    onPress={() => onUndoMedication(med)}
                    labelStyle={{ fontSize: 12 }}
                  >
                    Undo
                  </Button>
                )}
              </View>
            </View>
          ))}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  timelineRow: {
    flexDirection: "row",
    marginBottom: 0,
  },
  timeColumn: {
    width: 50,
    alignItems: "flex-end",
    paddingRight: 12,
    paddingTop: 16,
  },
  timeText: {
    fontWeight: "bold",
    color: "#666",
  },
  timelineLineContainer: {
    width: 20,
    alignItems: "center",
  },
  timelineLine: {
    width: 2,
    flex: 1,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: "absolute",
    top: 20,
    zIndex: 1,
    borderWidth: 2,
    borderColor: "white",
  },
});
