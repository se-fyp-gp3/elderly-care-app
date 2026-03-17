import { ScheduleEvent } from "@/lib/schedule";
import { ScheduleStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Avatar,
    Button,
    Divider,
    Surface,
    Text,
    useTheme,
} from "react-native-paper";
import { getStatusColor, getTypeIcon } from "./helpers";

interface ScheduleSingleEventCardProps {
  item: ScheduleEvent;
  onMarkDone: (taskId: string) => void;
  onUndoTask?: (taskId: string) => void;
  onRemind?: (item: ScheduleEvent) => void;
}

export default function ScheduleSingleEventCard({
  item,
  onMarkDone,
  onUndoTask,
  onRemind,
}: ScheduleSingleEventCardProps) {
  const theme = useTheme();

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{item.time}</Text>
        {(item.status === ScheduleStatus.COMPLETED ||
          item.status === ("completed" as any)) && (
          <MaterialCommunityIcons
            name="check-circle"
            size={16}
            color={theme.colors.primary}
            style={{ marginTop: 4 }}
          />
        )}
        {(item.status === ScheduleStatus.MISSED ||
          item.status === ("missed" as any)) && (
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
            { backgroundColor: getStatusColor(item.status, theme) },
          ]}
        />
      </View>

      <Surface
        style={[styles.eventCard, { backgroundColor: theme.colors.surface }]}
        elevation={1}
      >
        <View
          style={[
            styles.eventHeader,
            {
              borderLeftColor: getStatusColor(item.status, theme),
              borderLeftWidth: 4,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {item.title}
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
                {item.elderlyName}
              </Text>
            </View>
          </View>
          <Avatar.Icon
            size={40}
            icon={getTypeIcon(item.type)}
            style={{ backgroundColor: theme.colors.secondaryContainer }}
          />
        </View>
        <Divider />
        <View style={styles.eventBody}>
          <Text
            variant="bodyMedium"
            numberOfLines={2}
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {item.description}
          </Text>

          {(item.status === ScheduleStatus.PENDING ||
            item.status === ScheduleStatus.MISSED) && (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 12, gap: 8 }}>
              {onRemind && (
                <TouchableOpacity
                  onPress={() => onRemind(item)}
                  accessibilityRole="button"
                  accessibilityLabel="Set reminder for this event"
                  accessibilityHint="Sends you a reminder notification for this event"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.colors.secondaryContainer,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name="bell-ring-outline"
                    size={20}
                    color={theme.colors.secondary}
                  />
                </TouchableOpacity>
              )}
              <Button
                mode="contained-tonal"
                compact
                uppercase={false}
                onPress={() => onMarkDone(item.id)}
              >
                Mark Done
              </Button>
            </View>
          )}

          {(item.status === ScheduleStatus.COMPLETED ||
            item.status === ("completed" as any)) &&
            onUndoTask && (
            <View style={{ alignItems: "flex-end", marginTop: 12 }}>
              <Button
                mode="outlined"
                compact
                uppercase={false}
                icon="undo"
                onPress={() => onUndoTask(item.id)}
              >
                Undo
              </Button>
            </View>
          )}
        </View>
      </Surface>
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
  eventCard: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
  },
  eventHeader: {
    flexDirection: "row",
    padding: 12,
    alignItems: "center",
  },
  eventBody: {
    padding: 12,
  },
});
