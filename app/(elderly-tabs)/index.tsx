import { useAuth } from "@/lib/auth-context";
import {
  fetchElderlySchedulesForUser,
  getElderlyByUserId,
} from "@/lib/elderly";
import {
  checkAndMarkSkippedMedications,
  fetchActiveMedicationReminders,
  fetchDailyMedicationLogs,
  logMedicationAction,
} from "@/lib/medication_tracking";
import { getTodaySteps } from "@/lib/pedometer";
import {
  Elderly,
  ElderlyMedicationReminder,
  MedicationLogs,
  Schedule,
} from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { openURL } from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Avatar,
  Button,
  Card,
  Chip,
  List,
  Text,
  useTheme,
} from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type TodoItem = {
  reminder: ElderlyMedicationReminder;
  time: string; // HH:mm
  scheduledAt: string; // ISO String
  status: "pending" | "taken" | "missing";
  logId?: string;
  medicationName: string;
  dosage: string;
};

export default function ElderlyHome() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [elderlyProfile, setElderlyProfile] = React.useState<Elderly | null>(
    null,
  );
  const [reminders, setReminders] = React.useState<ElderlyMedicationReminder[]>(
    [],
  );
  const [todayLogs, setTodayLogs] = React.useState<MedicationLogs[]>([]);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [todaySteps, setTodaySteps] = React.useState<number>(0);

  const fetchElderlyData = React.useCallback(async () => {
    if (!user) return;

    try {
      // Check for skipped status first
      await checkAndMarkSkippedMedications(user.$id);

      // Get elderly profile
      const profile = await getElderlyByUserId(user.$id);
      setElderlyProfile(profile);

      if (profile) {
        // Fetch reminders and logs for "To Take Today"
        try {
          const [remindersData, logsData] = await Promise.all([
            fetchActiveMedicationReminders(user.$id),
            fetchDailyMedicationLogs(user.$id, new Date()),
          ]);
          setReminders(remindersData);
          setTodayLogs(logsData);
        } catch (err) {
          console.error("Error fetching medication reminders/logs:", err);
        }

        // Fetch schedules for this elderly
        try {
          const schedResponse = await fetchElderlySchedulesForUser(user.$id);
          setSchedules((schedResponse as Schedule[]).slice(0, 10));
        } catch {
          console.log("No schedules found");
          setSchedules([]);
        }

        // Fetch today's step count from Health Connect
        try {
          const steps = await getTodaySteps();
          setTodaySteps(steps);
        } catch (err) {
          console.log("Could not fetch today steps:", err);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching elderly data:", err);
    }
  }, [user]);

  React.useEffect(() => {
    fetchElderlyData();

    // Refresh when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        fetchElderlyData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchElderlyData]);

  // Compute "To Take Today" list
  const todoList = React.useMemo(() => {
    const list: TodoItem[] = [];
    const now = new Date();

    // Calculate Today in HK
    const hkOffset = 8 * 60 * 60 * 1000;
    const hkDate = new Date(now.getTime() + hkOffset);
    const todayStr = hkDate.toISOString().slice(0, 10); // YYYY-MM-DD in HK

    const toHKDateStr = (date: Date) =>
      new Date(date.getTime() + hkOffset).toISOString().slice(0, 10);

    const toHKTimeStr = (date: Date) => {
      const hk = new Date(date.getTime() + hkOffset);
      const hours = String(hk.getUTCHours()).padStart(2, "0");
      const minutes = String(hk.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    };

    reminders.forEach((r) => {
      r.reminder_times.forEach((time) => {
        // Construct scheduled time treating 'time' as HK Time
        const [hours, minutes] = time.split(":").map(Number);

        // Construct a base date using the HK date string, set to 00:00 UTC
        const baseDate = new Date(todayStr);
        baseDate.setUTCHours(hours, minutes, 0, 0);

        // Subtract 8 hours to convert HKT to UTC
        const scheduledDate = new Date(baseDate.getTime() - hkOffset);
        const scheduledAt = scheduledDate.toISOString();

        // Hide if scheduled_at is before start_date
        if (r.start_date && new Date(scheduledAt) < new Date(r.start_date)) {
          return;
        }

        // Find if logged
        const log = todayLogs.find((l) => {
          const logRemId =
            typeof l.elderly_medication_reminder === "string"
              ? l.elderly_medication_reminder
              : l.elderly_medication_reminder?.$id;

          if (logRemId !== r.$id) return false;

          const directMatch = l.scheduled_at === scheduledAt;
          if (directMatch) return true;

          const logDate = toHKDateStr(new Date(l.scheduled_at));
          const logTime = toHKTimeStr(new Date(l.scheduled_at));
          return logDate === todayStr && logTime === time;
        });

        // Helper to get medication name safely
        const medications = Array.isArray(r.elderly_medication?.medication)
          ? r.elderly_medication.medication
          : r.elderly_medication?.medication
            ? [r.elderly_medication.medication]
            : [];

        // @ts-ignore
        const medName = medications[0]?.name || "Medication";
        // @ts-ignore
        const medUnit = medications[0]?.unit || "dose";
        // @ts-ignore
        const medDosage = `${r.elderly_medication?.dosage || 1} ${medUnit}`;

        list.push({
          reminder: r,
          time,
          scheduledAt,
          status: log ? (log.status as any) : "pending",
          logId: log?.$id,
          medicationName: medName,
          dosage: medDosage,
        });
      });
    });

    // Sort by time
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }, [reminders, todayLogs]);

  const handleTakeMedication = async (item: TodoItem) => {
    try {
      const newStatus = item.status === "taken" ? "pending" : "taken";
      await logMedicationAction(
        user!.$id,
        item.reminder.$id,
        item.scheduledAt,
        newStatus,
      );
      await fetchElderlyData();
    } catch (error) {
      Alert.alert("Error", "Failed to update status");
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchElderlyData();
    setRefreshing(false);
  }, [fetchElderlyData]);

  const quickActions = [
    {
      icon: "robot" as IconName,
      label: "Chat with AI",
      color: "#673AB7",
      route: "chat",
    },
    {
      icon: "pill" as IconName,
      label: "My Medications",
      color: "#4CAF50",
      route: "medication",
    },
    {
      icon: "calendar-clock" as IconName,
      label: "My Schedule",
      color: "#2196F3",
      route: "schedule",
    },
    {
      icon: "account-group" as IconName,
      label: "Community",
      color: "#FF9800",
      route: "chat",
    },
  ];

  const handleEmergencyCall = () => {
    openURL("tel:999");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome Header */}
      <Card
        style={[
          styles.welcomeCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={styles.welcomeContent}>
          <Avatar.Icon
            size={60}
            icon="account-heart"
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={styles.welcomeText}>
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              Hello, {elderlyProfile?.name || user?.name || "there"}!
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              How are you feeling today?
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Emergency Button */}
      <Card style={[styles.emergencyCard, { backgroundColor: "#FF3B30" }]}>
        <Card.Content>
          <Button
            mode="contained"
            icon="phone-alert"
            onPress={handleEmergencyCall}
            style={styles.emergencyButton}
            labelStyle={styles.emergencyButtonText}
            contentStyle={styles.emergencyButtonContent}
          >
            Emergency Call (999)
          </Button>
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.quickActionsGrid}>
        {quickActions.map((action, index) => (
          <Card
            key={index}
            style={[
              styles.actionCard,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => router.push(action.route as never)}
          >
            <Card.Content style={styles.actionContent}>
              <MaterialCommunityIcons
                name={action.icon}
                size={40}
                color={action.color}
              />
              <Text variant="labelLarge" style={styles.actionLabel}>
                {action.label}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Today's Medications */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Today&apos;s Medications
      </Text>
      <Card
        style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
      >
        {todoList.length > 0 ? (
          todoList.slice(0, 3).map((item, index) => {
            const isTaken = item.status === "taken";
            return (
              <List.Item
                key={`${item.reminder.$id}-${item.time}-${index}`}
                title={`${item.medicationName} (${item.dosage})`}
                description={`Time: ${item.time}`}
                left={(props) => (
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons
                      name={isTaken ? "check-circle" : "clock-outline"}
                      size={28}
                      color={isTaken ? "#4CAF50" : theme.colors.primary}
                    />
                  </View>
                )}
                right={() => (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {!isTaken && (
                      <Button
                        mode="contained"
                        compact
                        onPress={() => handleTakeMedication(item)}
                        style={{ marginLeft: 8 }}
                      >
                        Take
                      </Button>
                    )}
                  </View>
                )}
                style={[styles.listItem, isTaken && { opacity: 0.6 }]}
              />
            );
          })
        ) : (
          <List.Item
            title="No medications scheduled"
            description="You are all set for today!"
            left={(props) => <List.Icon {...props} icon="pill-off" />}
          />
        )}
        <Button
          mode="text"
          onPress={() => router.push("/medication" as never)}
          style={styles.viewAllButton}
        >
          View Full Schedule
        </Button>
      </Card>

      {/* Upcoming Schedule */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Upcoming Schedule
      </Text>
      <Card
        style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
      >
        {schedules.length > 0 ? (
          schedules.slice(0, 3).map((schedule, index) => (
            <List.Item
              key={index}
              title={schedule.title || "Appointment"}
              description={
                schedule.description || schedule.time || "No details"
              }
              left={(props) => (
                <List.Icon {...props} icon="calendar-clock" color="#2196F3" />
              )}
              right={() => (
                <Chip
                  compact
                  style={{
                    backgroundColor:
                      schedule.status === "Completed"
                        ? "#4CAF5020"
                        : "#2196F320",
                  }}
                >
                  {schedule.status || "Upcoming"}
                </Chip>
              )}
            />
          ))
        ) : (
          <List.Item
            title="No upcoming events"
            description="Your schedule is clear"
            left={(props) => <List.Icon {...props} icon="calendar-blank" />}
          />
        )}
        <Button
          mode="text"
          onPress={() => router.push("/schedule" as never)}
          style={styles.viewAllButton}
        >
          View Full Schedule
        </Button>
      </Card>

      {/* Steps Today */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Steps Today
      </Text>
      <Card
        style={[styles.healthCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push("/steps" as never)}
      >
        <Card.Content style={styles.healthContent}>
          <View style={styles.healthItem}>
            <MaterialCommunityIcons
              name="shoe-print"
              size={32}
              color="#4CAF50"
            />
            <Text variant="labelMedium">Steps</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {todaySteps.toLocaleString()} steps
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  welcomeCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  welcomeContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  welcomeText: {
    marginLeft: 16,
    flex: 1,
  },
  emergencyCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  emergencyButton: {
    backgroundColor: "#FFFFFF",
  },
  emergencyButtonText: {
    color: "#FF3B30",
    fontSize: 18,
    fontWeight: "bold",
  },
  emergencyButtonContent: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  actionCard: {
    width: "48%",
    marginBottom: 12,
    borderRadius: 12,
  },
  actionContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  actionLabel: {
    marginTop: 8,
    textAlign: "center",
  },
  listCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  viewAllButton: {
    marginTop: 4,
  },
  listItem: {
    paddingVertical: 8,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  healthCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  healthContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  healthItem: {
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
});
