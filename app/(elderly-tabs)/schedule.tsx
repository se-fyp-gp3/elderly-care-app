import { useAuth } from "@/lib/auth-context";
import { getDateLocale } from "@/lib/i18n";
import {
    fetchElderlySchedulesForUser,
    getElderlyByUserId,
} from "@/lib/elderly";
import {
    createScheduleTask,
    fetchScheduleCategories,
    markOverdueSchedulesAsMissed,
    markScheduleTaskCompleted,
} from "@/lib/schedule";
import { Schedule, ScheduleCategory } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Platform,
    RefreshControl,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
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
  const { t, i18n } = useTranslation();
  const dateLocale = getDateLocale(i18n.resolvedLanguage || i18n.language);
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
    time: "08:00",
    typeId: "",
    typeName: "Activity",
    remindAt: new Date(Date.now() + 15 * 60 * 1000) as Date | null, // default: 15 min before
  });
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);
  const [timePickerVisible, setTimePickerVisible] = React.useState(false);
  const [selectingType, setSelectingType] = React.useState(false);
  // Temp state for iOS spinner pickers
  const [tempDate, setTempDate] = React.useState(new Date());
  const [tempTime, setTempTime] = React.useState(new Date());
  // Remind date+time picker state
  const [remindPickerVisible, setRemindPickerVisible] = React.useState(false);
  const [remindPickerMode, setRemindPickerMode] = React.useState<"date" | "time">("date");
  const [tempRemindDate, setTempRemindDate] = React.useState(new Date());

  // Local state for text inputs to prevent IME (handwriting/pinyin) composition interruption
  const [localTitle, setLocalTitle] = React.useState("");
  const [localDescription, setLocalDescription] = React.useState("");

  const translateScheduleStatus = React.useCallback(
    (status?: string | null) => {
      switch (status) {
        case "Completed":
          return t("schedule.statusCompleted");
        case "Missed":
          return t("schedule.statusMissed");
        default:
          return t("schedule.statusPending");
      }
    },
    [t],
  );

  const translateScheduleType = React.useCallback(
    (type?: string | null) => {
      switch ((type || "").toLowerCase()) {
        case "appointment":
          return t("schedule.appointment");
        case "meal":
          return t("schedule.typeMeal");
        case "checkup":
          return t("schedule.typeCheckup");
        case "activity":
          return t("schedule.typeActivity");
        default:
          return type || t("schedule.typeActivity");
      }
    },
    [t],
  );

  const groupLabelMap = React.useMemo(
    () => ({
      Today: t("common.today"),
      Tomorrow: t("schedule.tomorrow"),
      "This Week": t("schedule.thisWeek"),
      "This Month": t("schedule.thisMonth"),
      Later: t("schedule.later"),
      "A Long Time Ago": t("schedule.longTimeAgo"),
    }),
    [t],
  );

  // Sync local state when modal opens
  React.useEffect(() => {
    if (newTaskVisible) {
      setLocalTitle(newTask.title);
      setLocalDescription(newTask.description);
    }
  }, [newTaskVisible]);

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
      // Auto-mark past PENDING items as MISSED
      markOverdueSchedulesAsMissed(nonMedSchedules);
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

  // Schedule notifications for upcoming events
  React.useEffect(() => {
    const scheduleUpcomingNotifications = async () => {
      const now = Date.now();
      for (const s of schedules) {
        if (s.status !== "Pending" || !s.time) continue;
        const eventTime = new Date(s.time).getTime();
        if (eventTime <= now) continue;
        const remindMins = s.remind_minutes ?? 15;
        if (remindMins <= 0) continue;
        const notifyAt = new Date(eventTime - remindMins * 60 * 1000);
        if (notifyAt.getTime() > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: t("schedule.upcomingEvent"),
              body: `${s.title} — ${t("schedule.inMinutes", { minutes: remindMins })}`,
              sound: true,
              data: { type: "schedule_reminder", scheduleId: s.$id },
            },
            trigger: { type: "date", date: notifyAt } as any,
          });
        }
      }
    };
    if (schedules.length > 0) scheduleUpcomingNotifications();
  }, [schedules, t]);

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
      return d.toLocaleString(dateLocale, {
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

    const getCategoryIcon = (category: ScheduleCategory) => {
      return (category.svg_icon || getTypeIcon(category.name?.toLowerCase())) as any;
    };

    const getCategoryColor = (category: ScheduleCategory) => {
      return category.color_hex || theme.colors.secondary;
    };

  const formatTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return "";
    try {
      return new Date(timeStr).toLocaleTimeString(dateLocale, {
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
      return new Date(timeStr).toLocaleDateString(dateLocale, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const handleSaveTask = async () => {
    // Sync local IME state before validation
    const finalTitle = localTitle;
    const finalDescription = localDescription;
    setNewTask((prev) => ({ ...prev, title: finalTitle, description: finalDescription }));

    if (!finalTitle.trim()) {
      Alert.alert(t("schedule.missingInfo"), t("schedule.enterTitle"));
      return;
    }
    if (!newTask.time) {
      Alert.alert(t("schedule.missingInfo"), t("schedule.selectTimePrompt"));
      return;
    }
    if (!elderlyProfileId) {
      Alert.alert(t("common.error"), t("schedule.profileNotFound"));
      return;
    }

    setSaving(true);
    try {
      const combinedDatetime = new Date(newTask.date);
      const [hours, minutes] = newTask.time.split(":").map(Number);
      combinedDatetime.setHours(hours, minutes, 0, 0);

      // Compute remind_minutes from the picked remind datetime
      const remindAt = newTask.remindAt;
      const remindMinutes = remindAt
        ? Math.max(0, Math.round((combinedDatetime.getTime() - remindAt.getTime()) / 60000))
        : 0;

      await createScheduleTask({
        title: finalTitle,
        description: finalDescription,
        datetime: combinedDatetime,
        elderlyId: elderlyProfileId,
        typeName: newTask.typeName,
        categoryId: newTask.typeId || undefined,
        remindMinutes,
        notifyConnectedCaregivers: true,
        notificationAudience: "caregivers",
      });

      // Schedule a local notification at the remind datetime
      if (remindAt && remindAt.getTime() > Date.now()) {
        const bodyText = remindMinutes > 0
          ? `${finalTitle} — ${t("schedule.inMinutes", { minutes: remindMinutes })}`
          : `${finalTitle}`;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t("schedule.upcomingEvent"),
            body: bodyText,
            sound: true,
            data: { type: "schedule_reminder" },
          },
          trigger: { type: "date", date: remindAt } as any,
        });
      }

      setNewTaskVisible(false);
      setNewTask({
        title: "",
        description: "",
        date: new Date(),
        time: "08:00",
        typeId: "",
        typeName: "Activity",
        remindAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      await fetchSchedules();
    } catch (err) {
      console.error("Error creating task:", err);
      Alert.alert(t("common.error"), t("schedule.failedCreateTask"));
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDate = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setDatePickerVisible(false);
    if (selectedDate) {
      if (Platform.OS === "ios") {
        setTempDate(selectedDate);
      } else {
        setNewTask((prev) => ({ ...prev, date: selectedDate }));
      }
    }
  };

  const onConfirmDateDone = () => {
    setDatePickerVisible(false);
    setNewTask((prev) => ({ ...prev, date: tempDate }));
  };

  const onConfirmTime = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setTimePickerVisible(false);
    if (selectedDate) {
      if (Platform.OS === "ios") {
        setTempTime(selectedDate);
      } else {
        const hours = selectedDate.getHours();
        const mins = selectedDate.getMinutes();
        setNewTask((prev) => ({
          ...prev,
          time: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
        }));
      }
    }
  };

  const onConfirmTimeDone = () => {
    setTimePickerVisible(false);
    const hours = tempTime.getHours();
    const mins = tempTime.getMinutes();
    setNewTask((prev) => ({
      ...prev,
      time: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
    }));
  };

  // Remind date+time picker handlers
  const onChangeRemind = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") {
      if (remindPickerMode === "date" && selectedDate) {
        // Android: after picking date, switch to time mode
        setTempRemindDate(selectedDate);
        setRemindPickerMode("time");
      } else if (remindPickerMode === "time" && selectedDate) {
        // Android: after picking time, save and close
        const merged = new Date(tempRemindDate);
        merged.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setNewTask((prev) => ({ ...prev, remindAt: merged }));
        setRemindPickerVisible(false);
      } else {
        setRemindPickerVisible(false);
      }
    } else if (selectedDate) {
      setTempRemindDate(selectedDate);
    }
  };

  const onConfirmRemindDone = () => {
    if (remindPickerMode === "date") {
      // Move to time step
      setRemindPickerMode("time");
    } else {
      // Save and close
      setNewTask((prev) => ({ ...prev, remindAt: tempRemindDate }));
      setRemindPickerVisible(false);
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
                {groupLabelMap[group.label as keyof typeof groupLabelMap] || group.label}
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
                          {schedule.title || t("schedule.appointment")}
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
                        {translateScheduleStatus(schedule.status)}
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
                          {translateScheduleType(schedule.type)}
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
                            Alert.alert(t("common.error"), t("schedule.couldNotMarkDone"));
                          }
                        }}
                        style={{ borderRadius: 20 }}
                        labelStyle={{ fontSize: 12 }}
                      >
                        {t("schedule.markDone")}
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
                  {groupLabelMap[group.label as keyof typeof groupLabelMap] || group.label}
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
                            {schedule.title || t("schedule.appointment")}
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
                          {translateScheduleStatus(schedule.status)}
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
                                    t("common.error"),
                                    t("schedule.couldNotMarkDone"),
                                  );
                                }
                              }}
                              style={{ borderRadius: 20 }}
                              labelStyle={{ fontSize: 12 }}
                            >
                              {t("schedule.markDone")}
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
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text
                  variant="headlineSmall"
                  style={{ marginBottom: 20, fontWeight: "bold" }}
                >
                  {t("schedule.newTask")}
                </Text>

                <TextInput
                  mode="outlined"
                  label={t("schedule.title")}
                  value={localTitle}
                  onChangeText={setLocalTitle}
                  onBlur={() => setNewTask((prev) => ({ ...prev, title: localTitle }))}
                  style={styles.input}
                />

                <TextInput
                  mode="outlined"
                  label={t("schedule.descriptionLabel")}
                  value={localDescription}
                  onChangeText={setLocalDescription}
                  onBlur={() => setNewTask((prev) => ({ ...prev, description: localDescription }))}
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
                    onPress={() => {
                      setTempDate(newTask.date);
                      setDatePickerVisible(true);
                    }}
                    style={{ flex: 1, marginRight: 8 }}
                  >
                    <TextInput
                      mode="outlined"
                      label={t("schedule.date")}
                      value={newTask.date.toLocaleDateString(dateLocale)}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="calendar"
                          onPress={() => {
                            setTempDate(newTask.date);
                            setDatePickerVisible(true);
                          }}
                        />
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setTempTime(new Date());
                      setTimePickerVisible(true);
                    }}
                    style={{ flex: 1 }}
                  >
                    <TextInput
                      mode="outlined"
                      label={t("schedule.time")}
                      value={newTask.time || "08:00"}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="clock"
                          onPress={() => {
                            setTempTime(new Date());
                            setTimePickerVisible(true);
                          }}
                        />
                      }
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => setSelectingType(true)}>
                  <TextInput
                    mode="outlined"
                    label={t("schedule.typeLabel")}
                    value={translateScheduleType(newTask.typeName)}
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

                {/* Reminder date+time picker */}
                <Text variant="labelLarge" style={{ marginBottom: 8 }}>
                  {t("schedule.remindBefore")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Chip
                    selected={newTask.remindAt !== null}
                    onPress={() => {
                      if (newTask.remindAt) {
                        setNewTask((prev) => ({ ...prev, remindAt: null }));
                      } else {
                        // Default to event time - 15 min
                        const eventDate = new Date(newTask.date);
                        const [h, m] = newTask.time.split(":").map(Number);
                        eventDate.setHours(h, m, 0, 0);
                        const defaultRemind = new Date(eventDate.getTime() - 15 * 60 * 1000);
                        setNewTask((prev) => ({ ...prev, remindAt: defaultRemind }));
                      }
                    }}
                    style={{
                      backgroundColor: newTask.remindAt
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceVariant,
                    }}
                    icon={newTask.remindAt ? "bell" : "bell-off"}
                  >
                    {newTask.remindAt ? t("schedule.reminderOn") : t("schedule.noReminder")}
                  </Chip>
                </View>
                {newTask.remindAt && (
                  <TouchableOpacity
                    onPress={() => {
                      setTempRemindDate(newTask.remindAt!);
                      setRemindPickerMode("date");
                      setRemindPickerVisible(true);
                    }}
                    style={{ marginBottom: 16 }}
                  >
                    <TextInput
                      mode="outlined"
                      label={t("schedule.reminderTime")}
                      value={newTask.remindAt.toLocaleString(dateLocale, {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="bell-ring"
                          onPress={() => {
                            setTempRemindDate(newTask.remindAt!);
                            setRemindPickerMode("date");
                            setRemindPickerVisible(true);
                          }}
                        />
                      }
                    />
                  </TouchableOpacity>
                )}

                <Button
                  mode="contained"
                  onPress={handleSaveTask}
                  style={{ marginTop: 10, paddingVertical: 5 }}
                  loading={saving}
                  disabled={saving}
                >
                  {t("schedule.saveTask")}
                </Button>
              </ScrollView>
          ) : (
            <View style={styles.typeSelectionContent}>
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
                  {t("common.back")}
                </Button>
                <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                  {t("schedule.selectType")}
                </Text>
              </View>
              <ScrollView
                style={styles.typeSelectionList}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
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
                        name={getCategoryIcon(cat)}
                        size={24}
                        color={getCategoryColor(cat)}
                        style={{ marginRight: 16 }}
                      />
                      <Text variant="titleMedium">
                        {translateScheduleType(cat.name || "activity")}
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
                    <Text>{t("schedule.noCategoriesFound")}</Text>
                    <Button
                      mode="outlined"
                      onPress={loadCategories}
                      style={{ marginTop: 8 }}
                    >
                      {t("schedule.retryLoading")}
                    </Button>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </Modal>
      </Portal>

      {Platform.OS === "ios" ? (
        <RNModal visible={datePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setDatePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmDateDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={onConfirmDate}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </RNModal>
      ) : (
        datePickerVisible && (
          <DateTimePicker
            value={newTask.date}
            mode="date"
            display="default"
            onChange={onConfirmDate}
          />
        )
      )}

      {Platform.OS === "ios" ? (
        <RNModal visible={timePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setTimePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmTimeDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={onConfirmTime}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </RNModal>
      ) : (
        timePickerVisible && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            display="default"
            onChange={onConfirmTime}
          />
        )
      )}

      {/* Remind date+time picker */}
      {Platform.OS === "ios" ? (
        <RNModal visible={remindPickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setRemindPickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmRemindDone}>
                  {remindPickerMode === "date" ? t('schedule.next') : t('common.done')}
                </Button>
              </View>
              <DateTimePicker
                value={tempRemindDate}
                mode={remindPickerMode}
                display="spinner"
                onChange={onChangeRemind}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </RNModal>
      ) : (
        remindPickerVisible && (
          <DateTimePicker
            value={tempRemindDate}
            mode={remindPickerMode}
            display="default"
            onChange={onChangeRemind}
          />
        )
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
    width: "90%",
    maxHeight: "85%",
    minHeight: 320,
    alignSelf: "center",
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
  typeSelectionContent: {
    minHeight: 320,
  },
  typeSelectionList: {
    flexGrow: 0,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
    alignItems: "center",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});