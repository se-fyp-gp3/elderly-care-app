import VoiceCommandButton from "@/components/VoiceCommandButton";
import SimplifiedHomeView from "@/components/SimplifiedHomeView";
import { useAuth } from "@/lib/auth-context";
import { Contact, getContactsForElderly } from "@/lib/contacts";
import {
    fetchElderlySchedulesForUser,
    getElderlyByUserId,
} from "@/lib/elderly";
import { useStepSync } from "@/lib/hooks/useStepSync";
import {
    checkAndMarkSkippedMedications,
    fetchActiveMedicationReminders,
    fetchDailyMedicationLogs,
    logMedicationAction,
} from "@/lib/medication_tracking";
import {
    Elderly,
    ElderlyMedicationReminder,
    MedicationLogs,
    Schedule,
} from "@/types/appwrite";
import { UIVersion } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { openURL } from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    Alert,
    AppState,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import {
    Button,
    Card,
    Chip,
    List,
    Text,
    TouchableRipple,
    useTheme
} from "react-native-paper";

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
  const { user, preferences } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const uiVersion = (preferences.uiVersion as UIVersion) || UIVersion.Default;
  const isAccessible = uiVersion === UIVersion.Accessible;
  const {
    todaySteps,
    isLoading: stepsLoading,
    isSyncing,
    lastSyncTime,
    source: stepSource,
    manualSync,
  } = useStepSync();
  const [refreshing, setRefreshing] = React.useState(false);
  const [elderlyProfile, setElderlyProfile] = React.useState<Elderly | null>(
    null,
  );
  const [reminders, setReminders] = React.useState<ElderlyMedicationReminder[]>(
    [],
  );
  const [todayLogs, setTodayLogs] = React.useState<MedicationLogs[]>([]);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);

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

  // ── Contacts for simplified view ──
  const [simplifiedContacts, setSimplifiedContacts] = React.useState<Contact[]>([]);

  React.useEffect(() => {
    if (uiVersion !== UIVersion.Simplified) {
      // Clear contacts when not in simplified mode
      setSimplifiedContacts([]);
      return;
    }

    if (!elderlyProfile) {
      return;
    }

    (async () => {
      try {
        const contactData = await getContactsForElderly(elderlyProfile.$id);
        setSimplifiedContacts(contactData);
      } catch (e) {
        console.error("Error fetching contacts for simplified view:", e);
      }
    })();
  }, [elderlyProfile, uiVersion]);

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

  const handleEmergencyCall = () => {
    // Assume `elderly` contains the current user's elderly profile with an `emergency_contact` field
    // If no emergency contact is set, inform the user instead of attempting to call a hardcoded number.
    const emergencyNumber = (elderlyProfile as Elderly | null)?.emergency_contact;

    if (!emergencyNumber) {
      Alert.alert(
        "No Emergency Contact",
        "You do not have an emergency contact set. Please ask a caregiver or administrator to configure one for you.",
      );
      return;
    }

    Alert.alert(
      "Emergency Call",
      `Are you sure you want to call your emergency contact (${emergencyNumber})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call Now",
          style: "destructive",
          onPress: () => openURL(`tel:${emergencyNumber}`),
        },
      ],
    );
  };

  // ── Simplified version ──
  if (uiVersion === UIVersion.Simplified) {
    return (
      <SimplifiedHomeView
        elderlyProfile={elderlyProfile}
        userName={elderlyProfile?.name || user?.name || "there"}
        todoList={todoList}
        contacts={simplifiedContacts}
        onTakeMedication={handleTakeMedication}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  // ── Accessible version: scale up styles ──
  const accessibleStyles = isAccessible
    ? {
        greetingName: { fontSize: 28 },
        greetingSubtitle: { fontSize: 20 },
        sectionTitle: { fontSize: 24 },
      }
    : null;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Greeting */}
      <View style={styles.greetingSection}>
        <Text variant="headlineMedium" style={[styles.greetingName, accessibleStyles?.greetingName]}>
          Hello, {elderlyProfile?.name || user?.name || "there"}!
        </Text>
        <Text variant="bodyLarge" style={[styles.greetingSubtitle, accessibleStyles?.greetingSubtitle]}>
          How are you feeling today?
        </Text>
      </View>

      {/* Emergency Contact */}
      <Card
        style={styles.emergencyCard}
        onPress={handleEmergencyCall}
      >
        <Card.Content style={styles.emergencyCardContent}>
          <View style={styles.emergencyIconCircle}>
            <MaterialCommunityIcons name="phone-in-talk" size={28} color="#D32F2F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: "700", color: "#C62828" }}>
              Emergency Contact
            </Text>
            <Text variant="bodyMedium" style={{ color: "#999", marginTop: 2 }}>
              Tap to call your emergency contact
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#E57373" />
        </Card.Content>
      </Card>

      {/* Today's Medications */}
      <Text variant="titleLarge" style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}>
        Today&apos;s Medications
      </Text>
      {todoList.length > 0 ? (
        todoList.slice(0, 3).map((item, index) => {
          const isTaken = item.status === "taken";
          const isMissing = item.status === "missing";
          const accentColor = isTaken
            ? "#4CAF50"
            : isMissing
              ? "#E53935"
              : "#FF8F00";

          return (
            <View
              key={`${item.reminder.$id}-${item.time}-${index}`}
              style={[
                styles.medCard,
                { borderLeftColor: accentColor },
              ]}
            >
              <View style={styles.medCardTop}>
                <View
                  style={[
                    styles.medCardIcon,
                    { backgroundColor: isTaken ? "#E8F5E9" : "#EDE7F6" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={isTaken ? "check-circle" : "pill"}
                    size={26}
                    color={isTaken ? "#4CAF50" : "#5E35B1"}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                    {item.medicationName}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: "#666", marginTop: 2 }}>
                    {item.dosage}
                  </Text>
                </View>
                <View style={styles.medCardTime}>
                  <MaterialCommunityIcons name="clock-outline" size={15} color="#888" />
                  <Text variant="bodyMedium" style={{ color: "#555", marginLeft: 4, fontWeight: "600" }}>
                    {item.time}
                  </Text>
                </View>
              </View>
              {isTaken ? (
                <TouchableRipple
                  onPress={() => handleTakeMedication(item)}
                  style={styles.medCardDone}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#2E7D32" />
                    <Text style={{ color: "#2E7D32", fontSize: 14, fontWeight: "600" }}>
                      Taken — tap to undo
                    </Text>
                  </View>
                </TouchableRipple>
              ) : (
                <TouchableRipple
                  onPress={() => handleTakeMedication(item)}
                  style={[
                    styles.medCardAction,
                    { backgroundColor: isMissing ? "#E53935" : "#4CAF50" },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <MaterialCommunityIcons name="check-bold" size={20} color="#FFF" />
                    <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "bold" }}>
                      {isMissing ? "Take Now (Missed)" : "Mark as Taken"}
                    </Text>
                  </View>
                </TouchableRipple>
              )}
            </View>
          );
        })
      ) : (
        <Card style={[styles.listCard, { backgroundColor: theme.colors.surface }]}>
          <View style={{ alignItems: "center", padding: 28 }}>
            <MaterialCommunityIcons name="check-circle-outline" size={44} color="#A5D6A7" />
            <Text variant="bodyLarge" style={{ marginTop: 8, color: "#666" }}>
              No medications scheduled for today.
            </Text>
          </View>
        </Card>
      )}
      <Button
        mode="text"
        onPress={() => router.push("/medication" as never)}
        style={styles.viewAllButton}
      >
        View All Medications
      </Button>

      {/* Upcoming Schedule */}
      <Text variant="titleLarge" style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}>
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

      {/* Today's Steps */}
      <Text variant="titleLarge" style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}>
        Today&apos;s Steps
      </Text>
      <Card
        style={[styles.stepCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push("/health-data" as never)}
      >
        <Card.Content>
          <View style={styles.stepRow}>
            <View style={styles.stepIconCircle}>
              <MaterialCommunityIcons name="walk" size={32} color="#9C27B0" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              {stepsLoading ? (
                <ActivityIndicator size="small" color="#9C27B0" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <Text variant="headlineMedium" style={{ fontWeight: "bold", color: "#9C27B0" }}>
                    {todaySteps.toLocaleString()}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: "#888" }}>steps</Text>
                </View>
              )}
              <Text variant="labelSmall" style={{ color: "#999", marginTop: 2 }}>
                {lastSyncTime
                  ? `Updated ${new Date(lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Not synced yet"}
                {stepSource === "health_connect" ? " · Health Connect" : stepSource === "apple_healthkit" ? " · Apple Health" : ""}
              </Text>
            </View>
            <TouchableRipple
              onPress={(e) => { e.stopPropagation(); manualSync(); }}
              disabled={isSyncing}
              style={styles.stepSyncBtn}
              rippleColor="#9C27B040"
            >
              {isSyncing
                ? <ActivityIndicator size={20} color="#9C27B0" />
                : <MaterialCommunityIcons name="refresh" size={22} color="#9C27B0" />
              }
            </TouchableRipple>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
    <VoiceCommandButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  greetingSection: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  greetingName: {
    fontWeight: "bold",
    color: "#212121",
  },
  greetingSubtitle: {
    color: "#757575",
    marginTop: 4,
  },
  emergencyCard: {
    marginBottom: 20,
    borderRadius: 16,
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#FFCDD2",
    elevation: 1,
  },
  emergencyCardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 14,
  },
  emergencyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFEBEE",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 14,
  },
  stepCard: {
    borderRadius: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#9C27B015",
    justifyContent: "center",
    alignItems: "center",
  },
  stepSyncBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#9C27B010",
    justifyContent: "center",
    alignItems: "center",
  },
  listCard: {
    marginBottom: 20,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  viewAllButton: {
    marginBottom: 8,
  },
  medCard: {
    marginBottom: 12,
    borderRadius: 16,
    borderLeftWidth: 5,
    padding: 14,
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  medCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  medCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  medCardTime: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  medCardAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  medCardDone: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
  },
  bottomSpacer: {
    height: 40,
  },
});
