import SimplifiedHomeView from "@/components/SimplifiedHomeView";
import VoiceCommandButton from "@/components/VoiceCommandButton";
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
import { translateUnit } from "@/lib/schedule";
import {
  Elderly,
  ElderlyMedicationReminder,
  MedicationLogs,
  Schedule,
} from "@/types/appwrite";
import { UIVersion } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { openURL } from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { t } = useTranslation();
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

        // Fetch schedules for this elderly (exclude medication type, today+tomorrow only)
        try {
          const schedResponse = await fetchElderlySchedulesForUser(user.$id);
          const now = new Date();
          const todayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );
          const tomorrowEnd = new Date(todayStart);
          tomorrowEnd.setDate(tomorrowEnd.getDate() + 2); // end of tomorrow

          const nonMedSchedules = (schedResponse as Schedule[]).filter((s) => {
            if (s.type === "medication") return false;
            if (!s.time) return false;
            const t = new Date(s.time);
            return t >= todayStart && t < tomorrowEnd;
          });
          // Sort by time ascending
          nonMedSchedules.sort(
            (a, b) => new Date(a.time!).getTime() - new Date(b.time!).getTime(),
          );
          setSchedules(nonMedSchedules.slice(0, 10));
        } catch {
          console.log("No schedules found");
          setSchedules([]);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching elderly data:", err);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      fetchElderlyData();
    }, [fetchElderlyData]),
  );

  React.useEffect(() => {
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
  const [simplifiedContacts, setSimplifiedContacts] = React.useState<Contact[]>(
    [],
  );

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

        // Hide if scheduled_at is beyond duration_days
        if (r.start_date && r.duration_days) {
          const startDateMs = new Date(r.start_date).getTime();
          const startHkDate = new Date(startDateMs + hkOffset)
            .toISOString()
            .slice(0, 10);
          const firstCandBase = new Date(startHkDate);
          firstCandBase.setUTCHours(hours, minutes, 0, 0);
          const firstCandUtcMs = firstCandBase.getTime() - hkOffset;
          const startDelay = firstCandUtcMs <= startDateMs ? 1 : 0;
          const lastValidUtcMs =
            firstCandUtcMs + (startDelay + r.duration_days - 1) * 86400000;
          if (scheduledDate.getTime() > lastValidUtcMs) {
            return;
          }
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
        const medDosage = `${r.elderly_medication?.dosage || 1} ${translateUnit(medUnit)}`;

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
      Alert.alert("Error", t("common.failedUpdateStatus"));
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
    const emergencyNumber = (elderlyProfile as Elderly | null)
      ?.emergency_contact;

    if (!emergencyNumber) {
      Alert.alert(
        t("home.noEmergencyContact"),
        t("home.noEmergencyContactDesc"),
      );
      return;
    }

    Alert.alert(
      t("home.emergencyCall"),
      t("home.emergencyCallConfirm", { number: emergencyNumber }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("home.callNow"),
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
          <Text
            variant="headlineMedium"
            style={[
              styles.greetingName,
              { color: theme.colors.onSurface },
              accessibleStyles?.greetingName,
            ]}
          >
            Hello, {elderlyProfile?.name || user?.name || t("common.there")}!
          </Text>
          <Text
            variant="bodyLarge"
            style={[
              styles.greetingSubtitle,
              { color: theme.colors.onSurfaceVariant },
              accessibleStyles?.greetingSubtitle,
            ]}
          >
            {t("home.howAreYou")}
          </Text>
        </View>

        {/* Emergency Contact */}
        <Card
          style={[
            styles.emergencyCard,
            {
              backgroundColor: isDark ? "rgba(211,47,47,0.12)" : "#FFF5F5",
              borderColor: isDark ? "rgba(211,47,47,0.3)" : "#FFCDD2",
            },
          ]}
          onPress={handleEmergencyCall}
        >
          <Card.Content style={styles.emergencyCardContent}>
            <View
              style={[
                styles.emergencyIconCircle,
                {
                  backgroundColor: isDark ? "rgba(211,47,47,0.15)" : "#FFEBEE",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="phone-in-talk"
                size={28}
                color="#D32F2F"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                variant="titleMedium"
                style={{
                  fontWeight: "700",
                  color: isDark ? "#EF9A9A" : "#C62828",
                }}
              >
                {t("home.emergencyContact")}
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
              >
                {t("home.tapToCallEmergency")}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color="#E57373"
            />
          </Card.Content>
        </Card>

        {/* Today's Medications */}
        <Text
          variant="titleLarge"
          style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}
        >
          {t("home.todaysMedications")}
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
                  {
                    borderLeftColor: accentColor,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <View style={styles.medCardTop}>
                  <View
                    style={[
                      styles.medCardIcon,
                      {
                        backgroundColor: isTaken
                          ? isDark
                            ? "rgba(76,175,80,0.15)"
                            : "#E8F5E9"
                          : isDark
                            ? "rgba(94,53,177,0.15)"
                            : "#EDE7F6",
                      },
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
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 2,
                      }}
                    >
                      {item.dosage}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.medCardTime,
                      { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={15}
                      color={theme.colors.onSurfaceVariant}
                    />
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginLeft: 4,
                        fontWeight: "600",
                      }}
                    >
                      {item.time}
                    </Text>
                  </View>
                </View>
                {isTaken ? (
                  <TouchableRipple
                    onPress={() => handleTakeMedication(item)}
                    style={[
                      styles.medCardDone,
                      {
                        backgroundColor: isDark
                          ? "rgba(76,175,80,0.15)"
                          : "#E8F5E9",
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color={isDark ? "#81C784" : "#2E7D32"}
                      />
                      <Text
                        style={{
                          color: isDark ? "#81C784" : "#2E7D32",
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {t("home.takenTapToUndo")}
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
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="check-bold"
                        size={20}
                        color="#FFF"
                      />
                      <Text
                        style={{
                          color: "#FFF",
                          fontSize: 16,
                          fontWeight: "bold",
                        }}
                      >
                        {isMissing
                          ? t("home.takeNowMissed")
                          : t("home.markAsTaken")}
                      </Text>
                    </View>
                  </TouchableRipple>
                )}
              </View>
            );
          })
        ) : (
          <Card
            style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
          >
            <View style={{ alignItems: "center", padding: 28 }}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={44}
                color="#A5D6A7"
              />
              <Text
                variant="bodyLarge"
                style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}
              >
                {t("home.noMedsToday")}
              </Text>
            </View>
          </Card>
        )}
        <Button
          mode="text"
          onPress={() => router.push("/medication" as never)}
          style={styles.viewAllButton}
        >
          {t("home.viewAllMedications")}
        </Button>

        {/* Upcoming Schedule (Today & Tomorrow) */}
        <Text
          variant="titleLarge"
          style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}
        >
          {t("home.upcomingSchedule")}
        </Text>
        {schedules.length > 0 ? (
          schedules.slice(0, 3).map((schedule, index) => {
            const isCompleted = schedule.status === "Completed";
            const isMissed = schedule.status === "Missed";
            const accentColor = isCompleted
              ? "#4CAF50"
              : isMissed
                ? "#F44336"
                : "#2196F3";
            const typeIcon = (() => {
              switch (schedule.type) {
                case "appointment":
                  return "doctor";
                case "meal":
                  return "food-apple";
                case "checkup":
                  return "stethoscope";
                case "activity":
                  return "run";
                default:
                  return "calendar-clock";
              }
            })();
            const scheduleTime = (() => {
              if (!schedule.time) return "";
              try {
                const d = new Date(schedule.time);
                return d.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              } catch {
                return "";
              }
            })();
            const scheduleDate = (() => {
              if (!schedule.time) return "";
              try {
                const d = new Date(schedule.time);
                return d.toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                });
              } catch {
                return "";
              }
            })();

            return (
              <View
                key={`sched-${schedule.$id || index}`}
                style={[
                  styles.medCard,
                  {
                    borderLeftColor: accentColor,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <View style={styles.medCardTop}>
                  <View
                    style={[
                      styles.medCardIcon,
                      {
                        backgroundColor: isCompleted
                          ? isDark
                            ? "rgba(76,175,80,0.15)"
                            : "#E8F5E9"
                          : isDark
                            ? "rgba(33,150,243,0.15)"
                            : "#E3F2FD",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isCompleted ? "check-circle" : typeIcon}
                      size={26}
                      color={isCompleted ? "#4CAF50" : "#1976D2"}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                      {schedule.title || t("home.appointment")}
                    </Text>
                    {schedule.description ? (
                      <Text
                        variant="bodyMedium"
                        style={{
                          color: theme.colors.onSurfaceVariant,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {schedule.description}
                      </Text>
                    ) : null}
                  </View>
                  {scheduleTime ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <View
                        style={[
                          styles.medCardTime,
                          { backgroundColor: theme.colors.surfaceVariant },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={15}
                          color={theme.colors.onSurfaceVariant}
                        />
                        <Text
                          variant="bodyMedium"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginLeft: 4,
                            fontWeight: "600",
                          }}
                        >
                          {scheduleTime}
                        </Text>
                      </View>
                      {scheduleDate ? (
                        <Text
                          variant="labelSmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 3,
                          }}
                        >
                          {scheduleDate}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                    gap: 8,
                  }}
                >
                  <Chip
                    compact
                    style={{ backgroundColor: `${accentColor}18` }}
                    textStyle={{ color: accentColor, fontSize: 12 }}
                  >
                    {schedule.status || t("common.pending")}
                  </Chip>
                  {schedule.type ? (
                    <Chip
                      compact
                      style={{ backgroundColor: theme.colors.surfaceVariant }}
                      textStyle={{
                        fontSize: 12,
                        color: theme.colors.onSurfaceVariant,
                        textTransform: "capitalize",
                      }}
                    >
                      {schedule.type}
                    </Chip>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <Card
            style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
          >
            <View style={{ alignItems: "center", padding: 28 }}>
              <MaterialCommunityIcons
                name="calendar-check"
                size={44}
                color="#A5D6A7"
              />
              <Text
                variant="bodyLarge"
                style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}
              >
                {t("home.noUpcomingEvents")}
              </Text>
            </View>
          </Card>
        )}
        <Button
          mode="text"
          onPress={() => router.push("/schedule" as never)}
          style={styles.viewAllButton}
        >
          {t("home.viewFullSchedule")}
        </Button>

        {/* Today's Steps */}
        <Text
          variant="titleLarge"
          style={[styles.sectionTitle, accessibleStyles?.sectionTitle]}
        >
          {t("home.todaysSteps")}
        </Text>
        <Card
          style={[styles.stepCard, { backgroundColor: theme.colors.surface }]}
          onPress={() => router.push("/health-data" as never)}
        >
          <Card.Content>
            <View style={styles.stepRow}>
              <View
                style={[
                  styles.stepIconCircle,
                  {
                    backgroundColor: isDark
                      ? "rgba(156,39,176,0.12)"
                      : "rgba(156,39,176,0.08)",
                  },
                ]}
              >
                <MaterialCommunityIcons name="walk" size={32} color="#9C27B0" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                {stepsLoading ? (
                  <ActivityIndicator size="small" color="#9C27B0" />
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: 4,
                    }}
                  >
                    <Text
                      variant="headlineMedium"
                      style={{ fontWeight: "bold", color: "#9C27B0" }}
                    >
                      {todaySteps.toLocaleString()}
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {t("home.steps")}
                    </Text>
                  </View>
                )}
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                >
                  {lastSyncTime
                    ? t("home.updated", {
                        time: new Date(lastSyncTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })
                    : t("healthData.notSyncedYet")}
                  {stepSource === "health_connect"
                    ? " · Health Connect"
                    : stepSource === "apple_healthkit"
                      ? " · Apple Health"
                      : ""}
                </Text>
              </View>
              <TouchableRipple
                onPress={(e) => {
                  e.stopPropagation();
                  manualSync();
                }}
                disabled={isSyncing}
                style={[
                  styles.stepSyncBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(156,39,176,0.12)"
                      : "rgba(156,39,176,0.06)",
                  },
                ]}
                rippleColor="#9C27B040"
              >
                {isSyncing ? (
                  <ActivityIndicator size={20} color="#9C27B0" />
                ) : (
                  <MaterialCommunityIcons
                    name="refresh"
                    size={22}
                    color="#9C27B0"
                  />
                )}
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
