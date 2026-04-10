import { useAuth } from "@/lib/auth-context";
import {
  fetchElderlySchedulesForUser,
  getElderlyByUserId,
} from "@/lib/elderly";
import {
  createScheduleTask,
  fetchScheduleCategories,
  markScheduleTaskCompleted,
} from "@/lib/schedule";
import { Schedule, ScheduleCategory } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
  FAB,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme
} from "react-native-paper";

export default function ElderlySchedule() {
  const { user } = useAuth();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [elderlyProfileId, setElderlyProfileId] = React.useState<string>("");

  // New task state
  const [newTaskVisible, setNewTaskVisible] = React.useState(false);
  const [categories, setCategories] = React.useState<ScheduleCategory[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [newTask, setNewTask] = React.useState({
    title: "",
    description: "",
    date: new Date(),
    time: "",
    typeId: "",
    typeName: "Activity",
  });
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);
  const [timePickerVisible, setTimePickerVisible] = React.useState(false);
  const [selectingType, setSelectingType] = React.useState(false);

  const fetchSchedules = React.useCallback(async () => {
    if (!user) return;

    try {
      const profile = await getElderlyByUserId(user.$id);
      if (profile) setElderlyProfileId(profile.$id);

      const response = await fetchElderlySchedulesForUser(user.$id);
      // Filter out medication-type schedule entries
      const nonMedSchedules = (response as Schedule[]).filter(
        (s) => s.type !== "medication",
      );
      setSchedules(nonMedSchedules);
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setSchedules([]);
    }
  }, [user]);

  const loadCategories = React.useCallback(async () => {
    try {
      const rows = await fetchScheduleCategories();
      // Filter out medication category for elderly
      const filtered = rows.filter(
        (c) => c.name?.toLowerCase() !== "medication",
      );
      setCategories(filtered);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

  React.useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useFocusEffect(
    React.useCallback(() => {
      fetchSchedules();
    }, [fetchSchedules]),
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchSchedules();
    setRefreshing(false);
  }, [fetchSchedules]);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "Completed":
        return "#4CAF50";
      case "Missed":
        return "#F44336";
      default:
        return "#2196F3";
    }
  };

  const formatScheduleTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return "";
    try {
      const d = new Date(timeStr);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return timeStr;
    }
  };

  const getTypeIcon = (type: string | null | undefined) => {
    switch (type) {
      case "appointment":
        return "doctor" as const;
      case "meal":
        return "food-apple" as const;
      case "checkup":
        return "stethoscope" as const;
      case "activity":
        return "run" as const;
      default:
        return "calendar-clock" as const;
    }
  };

  const formatTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return "";
    try {
      return new Date(timeStr).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const formatDate = (timeStr: string | null | undefined): string => {
    if (!timeStr) return "";
    try {
      return new Date(timeStr).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim()) {
      Alert.alert("Missing Information", "Please enter a title.");
      return;
    }
    if (!newTask.time) {
      Alert.alert("Missing Information", "Please select a time.");
      return;
    }
    if (!elderlyProfileId) {
      Alert.alert("Error", "Could not determine your profile.");
      return;
    }

    setSaving(true);
    try {
      const combinedDatetime = new Date(newTask.date);
      const [hours, minutes] = newTask.time.split(":").map(Number);
      combinedDatetime.setHours(hours, minutes, 0, 0);

      await createScheduleTask({
        title: newTask.title,
        description: newTask.description,
        datetime: combinedDatetime,
        elderlyId: elderlyProfileId,
        typeName: newTask.typeName,
        categoryId: newTask.typeId || undefined,
      });

      setNewTaskVisible(false);
      setNewTask({
        title: "",
        description: "",
        date: new Date(),
        time: "",
        typeId: "",
        typeName: "Activity",
      });
      await fetchSchedules();
    } catch (err) {
      console.error("Error creating task:", err);
      Alert.alert("Error", "Failed to create task.");
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDate = (_event: any, selectedDate?: Date) => {
    setDatePickerVisible(false);
    if (selectedDate) {
      setNewTask((prev) => ({ ...prev, date: selectedDate }));
    }
  };

  const onConfirmTime = (_event: any, selectedDate?: Date) => {
    setTimePickerVisible(false);
    if (selectedDate) {
      const hours = selectedDate.getHours();
      const mins = selectedDate.getMinutes();
      setNewTask((prev) => ({
        ...prev,
        time: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
      }));
    }
  };

  const todaySchedules = schedules.filter(
    (s) => s.status !== "Completed" && s.status !== "Missed",
  );
  const pastSchedules = schedules.filter(
    (s) => s.status === "Completed" || s.status === "Missed",
  );

  // Group schedules into time buckets
  const groupByTime = (items: Schedule[]) => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - todayStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const groups: { label: string; items: Schedule[] }[] = [
      { label: "Today", items: [] },
      { label: "Tomorrow", items: [] },
      { label: "This Week", items: [] },
      { label: "This Month", items: [] },
      { label: "Later", items: [] },
    ];

    const pastGroups: { label: string; items: Schedule[] }[] = [
      { label: "Today", items: [] },
      { label: "This Week", items: [] },
      { label: "This Month", items: [] },
      { label: "A Long Time Ago", items: [] },
    ];

    return {
      groups,
      pastGroups,
      todayStart,
      tomorrowStart,
      weekStart,
      weekEnd,
      monthStart,
      monthEnd,
    };
  };

  const getUpcomingGroups = () => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const groups: { label: string; items: Schedule[] }[] = [
      { label: "Today", items: [] },
      { label: "Tomorrow", items: [] },
      { label: "This Week", items: [] },
      { label: "This Month", items: [] },
      { label: "Later", items: [] },
    ];

    for (const s of todaySchedules) {
      const t = s.time ? new Date(s.time) : null;
      if (!t) {
        groups[4].items.push(s);
        continue;
      }
      if (t >= todayStart && t < tomorrowStart) groups[0].items.push(s);
      else if (t >= tomorrowStart && t < tomorrowEnd) groups[1].items.push(s);
      else if (t >= tomorrowEnd && t < weekEnd) groups[2].items.push(s);
      else if (t >= weekEnd && t < monthEnd) groups[3].items.push(s);
      else groups[4].items.push(s);
    }

    return groups.filter((g) => g.items.length > 0);
  };

  const getPastGroups = () => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const groups: { label: string; items: Schedule[] }[] = [
      { label: "Today", items: [] },
      { label: "This Week", items: [] },
      { label: "This Month", items: [] },
      { label: "A Long Time Ago", items: [] },
    ];

    for (const s of pastSchedules) {
      const t = s.time ? new Date(s.time) : null;
      if (!t) {
        groups[3].items.push(s);
        continue;
      }
      if (t >= todayStart) groups[0].items.push(s);
      else if (t >= weekStart) groups[1].items.push(s);
      else if (t >= monthStart) groups[2].items.push(s);
      else groups[3].items.push(s);
    }

    return groups.filter((g) => g.items.length > 0);
  };

  const upcomingGroups = getUpcomingGroups();
  const pastGroups = getPastGroups();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            {t("schedule.mySchedule")}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("schedule.viewAppointments")}
          </Text>
        </View>

        {/* Upcoming Schedule */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t("home.upcoming")}
        </Text>
        {upcomingGroups.length > 0 ? (
          upcomingGroups.map((group) => (
            <View key={`ug-${group.label}`}>
              <Text
                variant="labelLarge"
                style={[
                  styles.groupLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {group.label}
              </Text>
              {group.items.map((schedule, index) => {
                const accentColor = "#2196F3";
                const typeIcon = getTypeIcon(schedule.type);
                const timeStr = formatTime(schedule.time);
                const dateStr = formatDate(schedule.time);
                return (
                  <View
                    key={`upcoming-${schedule.$id || index}`}
                    style={[
                      styles.schedCard,
                      {
                        borderLeftColor: accentColor,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.schedCardTop}>
                      <View
                        style={[
                          styles.schedCardIcon,
                          {
                            backgroundColor: isDark
                              ? "rgba(33,150,243,0.15)"
                              : "#E3F2FD",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={typeIcon}
                          size={26}
                          color="#1976D2"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          variant="titleMedium"
                          style={{ fontWeight: "700" }}
                        >
                          {schedule.title || "Appointment"}
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
                      {timeStr ? (
                        <View style={{ alignItems: "flex-end" }}>
                          <View
                            style={[
                              styles.schedCardTime,
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
                              {timeStr}
                            </Text>
                          </View>
                          {dateStr ? (
                            <Text
                              variant="labelSmall"
                              style={{
                                color: theme.colors.onSurfaceVariant,
                                marginTop: 3,
                              }}
                            >
                              {dateStr}
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
                        {schedule.status || "Pending"}
                      </Chip>
                      {schedule.type ? (
                        <Chip
                          compact
                          style={{
                            backgroundColor: theme.colors.surfaceVariant,
                          }}
                          textStyle={{
                            fontSize: 12,
                            color: theme.colors.onSurfaceVariant,
                            textTransform: "capitalize",
                          }}
                        >
                          {schedule.type}
                        </Chip>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <Button
                        mode="contained"
                        compact
                        icon="check"
                        onPress={async () => {
                          try {
                            await markScheduleTaskCompleted(schedule.$id);
                            await fetchSchedules();
                          } catch (e) {
                            Alert.alert("Error", "Failed to mark as completed");
                          }
                        }}
                        style={{ borderRadius: 20 }}
                        labelStyle={{ fontSize: 12 }}
                      >
                        Complete
                      </Button>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="calendar-check"
              size={48}
              color="#4CAF50"
            />
            <Text variant="bodyLarge" style={{ marginTop: 8 }}>
              {t("home.noUpcomingEvents")}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("home.scheduleIsClear")}
            </Text>
          </View>
        )}

        {/* Past Schedule */}
        {pastGroups.length > 0 && (
          <>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t("schedule.pastEvents")}
            </Text>
            {pastGroups.map((group) => (
              <View key={`pg-${group.label}`}>
                <Text
                  variant="labelLarge"
                  style={[
                    styles.groupLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {group.label}
                </Text>
                {group.items.map((schedule, index) => {
                  const isCompleted = schedule.status === "Completed";
                  const accentColor = isCompleted ? "#4CAF50" : "#F44336";
                  const typeIcon = getTypeIcon(schedule.type);
                  const timeStr = formatTime(schedule.time);
                  const dateStr = formatDate(schedule.time);
                  return (
                    <View
                      key={`past-${schedule.$id || index}`}
                      style={[
                        styles.schedCard,
                        {
                          borderLeftColor: accentColor,
                          opacity: 0.75,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <View style={styles.schedCardTop}>
                        <View
                          style={[
                            styles.schedCardIcon,
                            { backgroundColor: `${accentColor}18` },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={isCompleted ? "check-circle" : "close-circle"}
                            size={26}
                            color={accentColor}
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text
                            variant="titleMedium"
                            style={{ fontWeight: "700" }}
                          >
                            {schedule.title || "Appointment"}
                          </Text>
                        </View>
                        {timeStr ? (
                          <View style={{ alignItems: "flex-end" }}>
                            <View
                              style={[
                                styles.schedCardTime,
                                {
                                  backgroundColor: theme.colors.surfaceVariant,
                                },
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
                                {timeStr}
                              </Text>
                            </View>
                            {dateStr ? (
                              <Text
                                variant="labelSmall"
                                style={{
                                  color: theme.colors.onSurfaceVariant,
                                  marginTop: 3,
                                }}
                              >
                                {dateStr}
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
                          {schedule.status}
                        </Chip>
                        {!isCompleted && (
                          <>
                            <View style={{ flex: 1 }} />
                            <Button
                              mode="contained"
                              compact
                              icon="check"
                              onPress={async () => {
                                try {
                                  await markScheduleTaskCompleted(schedule.$id);
                                  await fetchSchedules();
                                } catch (e) {
                                  Alert.alert(
                                    "Error",
                                    "Failed to mark as completed",
                                  );
                                }
                              }}
                              style={{ borderRadius: 20 }}
                              labelStyle={{ fontSize: 12 }}
                            >
                              Complete
                            </Button>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}

        {/* Info Card */}
        <Card
          style={[
            styles.infoCard,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Card.Content>
            <View style={styles.infoHeader}>
              <MaterialCommunityIcons
                name="bell"
                size={24}
                color={theme.colors.primary}
              />
              <Text
                variant="titleSmall"
                style={{
                  marginLeft: 8,
                  color: theme.colors.onPrimaryContainer,
                }}
              >
                {t("schedule.reminders")}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
            >
              {t("schedule.remindersDesc")}
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* FAB to add new task */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => setNewTaskVisible(true)}
      />

      {/* New Task Modal */}
      <Portal>
        <Modal
          visible={newTaskVisible}
          onDismiss={() => {
            setNewTaskVisible(false);
            setSelectingType(false);
          }}
          contentContainerStyle={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {!selectingType ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text
                  variant="headlineSmall"
                  style={{ marginBottom: 20, fontWeight: "bold" }}
                >
                  New Event
                </Text>

                <TextInput
                  mode="outlined"
                  label="Title"
                  value={newTask.title}
                  onChangeText={(text) =>
                    setNewTask((prev) => ({ ...prev, title: text }))
                  }
                  style={styles.input}
                />

                <TextInput
                  mode="outlined"
                  label="Description (optional)"
                  value={newTask.description}
                  onChangeText={(text) =>
                    setNewTask((prev) => ({ ...prev, description: text }))
                  }
                  style={styles.input}
                  multiline
                />

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setDatePickerVisible(true)}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    <TextInput
                      mode="outlined"
                      label="Date"
                      value={newTask.date.toLocaleDateString()}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="calendar"
                          onPress={() => setDatePickerVisible(true)}
                        />
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setTimePickerVisible(true)}
                    style={{ flex: 1 }}
                  >
                    <TextInput
                      mode="outlined"
                      label="Time"
                      value={newTask.time || "Select time"}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="clock"
                          onPress={() => setTimePickerVisible(true)}
                        />
                      }
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => setSelectingType(true)}>
                  <TextInput
                    mode="outlined"
                    label="Type"
                    value={newTask.typeName}
                    editable={false}
                    style={styles.input}
                    right={
                      <TextInput.Icon
                        icon="chevron-right"
                        onPress={() => setSelectingType(true)}
                      />
                    }
                  />
                </TouchableOpacity>

                <Button
                  mode="contained"
                  onPress={handleSaveTask}
                  style={{ marginTop: 10, paddingVertical: 5 }}
                  loading={saving}
                  disabled={saving}
                >
                  Save Event
                </Button>
              </ScrollView>
            </TouchableWithoutFeedback>
          ) : (
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <Button
                  icon="arrow-left"
                  onPress={() => setSelectingType(false)}
                >
                  Back
                </Button>
                <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                  Select Type
                </Text>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {categories.length > 0 ? (
                  categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.$id}
                      style={[
                        styles.selectionRow,
                        {
                          backgroundColor:
                            newTask.typeId === cat.$id
                              ? theme.colors.secondaryContainer
                              : "transparent",
                        },
                      ]}
                      onPress={() => {
                        setNewTask((prev) => ({
                          ...prev,
                          typeName: cat.name || "Activity",
                          typeId: cat.$id,
                        }));
                        setSelectingType(false);
                      }}
                    >
                      <MaterialCommunityIcons
                        name="calendar-check"
                        size={24}
                        color={theme.colors.secondary}
                        style={{ marginRight: 16 }}
                      />
                      <Text variant="titleMedium">
                        {cat.name || "Activity"}
                      </Text>
                      {newTask.typeId === cat.$id && (
                        <MaterialCommunityIcons
                          name="check"
                          size={24}
                          color={theme.colors.onSecondaryContainer}
                          style={{ marginLeft: "auto" }}
                        />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text>No categories found.</Text>
                    <Button
                      mode="outlined"
                      onPress={loadCategories}
                      style={{ marginTop: 8 }}
                    >
                      Retry
                    </Button>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </Modal>
      </Portal>

      {datePickerVisible && (
        <DateTimePicker
          value={newTask.date}
          mode="date"
          display="default"
          onChange={onConfirmDate}
        />
      )}
      {timePickerVisible && (
        <DateTimePicker
          value={new Date()}
          mode="time"
          display="default"
          onChange={onConfirmTime}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  groupLabel: {
    fontWeight: "600",
    color: "#888",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  scheduleItem: {
    paddingVertical: 8,
  },
  timeIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  schedCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: "#2196F3",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  schedCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  schedCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  schedCardTime: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  infoCard: {
    borderRadius: 12,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 80,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: "80%",
  },
  input: {
    marginBottom: 10,
  },
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    borderRadius: 12,
  },
});
