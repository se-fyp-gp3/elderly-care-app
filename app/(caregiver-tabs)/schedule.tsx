import {
    DisplayItem,
    NewTaskData,
    NewTaskModal,
    ScheduleCalendarStrip,
    ScheduleFilterDialog,
    ScheduleMedGroupCard,
    ScheduleMonthPicker,
    ScheduleSingleEventCard,
} from "@/components/schedule";
  import MedicationDetailsModal, { MedicationDetailField } from "@/components/MedicationDetailsModal";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import {
    createScheduleTask,
    fetchDayMedicationEvents,
    fetchDayScheduleEvents,
    fetchScheduleCategories,
    markScheduleTaskCompleted,
    recordMedicationTaken,
    ScheduleEvent,
    undoMedicationTaken,
    undoScheduleTaskCompleted,
} from "@/lib/schedule";
import { Elderly, ScheduleCategory, ScheduleStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

import { useTranslation } from "react-i18next";
import {
    Button,
    Chip,
    FAB,
    Text,
    useTheme,
} from "react-native-paper";

export default function SchedulePage() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();

  // Data State
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Date Management
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // Custom Month Picker
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  // Dropdown Menus
  const [selectionMode, setSelectionMode] = useState<
    "form" | "elderly" | "type"
  >("form");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSearchQuery, setFilterSearchQuery] = useState("");

  // Filters
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedElderlyId, setSelectedElderlyId] = useState<string>("All");

  // New Task Management
  const [newTaskVisible, setNewTaskVisible] = useState(false);
  const [selectedMedicationDetails, setSelectedMedicationDetails] = useState<{
    title: string;
    subtitle?: string;
    fields: MedicationDetailField[];
  } | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [newTaskDatePickerVisible, setNewTaskDatePickerVisible] =
    useState(false);
  // Temp state for iOS spinner pickers (spinner fires onChange on every spin)
  const [tempPickerDate, setTempPickerDate] = useState(new Date());
  const [tempPickerTime, setTempPickerTime] = useState(new Date());
  const [tempNewTaskDate, setTempNewTaskDate] = useState(new Date());
  const [newTask, setNewTask] = useState<NewTaskData>({
    title: "",
    description: "",
    date: new Date(),
    time: "",
    type: "Activity",
    elderlyName: "Select Elderly",
    elderlyId: "",
    status: ScheduleStatus.PENDING,
  });

  // Filtered view
  const filteredEvents =
    selectedElderlyId === "All"
      ? events
      : events.filter((item) => item.elderlyId === selectedElderlyId);

  // Group medication events by time + elderlyId
  const displayItems = useMemo<DisplayItem[]>(() => {
    const singles: DisplayItem[] = [];
    const medGroupMap = new Map<string, ScheduleEvent[]>();

    for (const ev of filteredEvents) {
      if (ev.type === 'medication') {
        const gk = `${ev.time}_${ev.elderlyId}`;
        if (!medGroupMap.has(gk)) medGroupMap.set(gk, []);
        medGroupMap.get(gk)!.push(ev);
      } else {
        singles.push({ kind: 'single', event: ev });
      }
    }

    const groups: DisplayItem[] = [];
    for (const [key, evts] of medGroupMap) {
      groups.push({
        kind: 'medGroup',
        key,
        time: evts[0].time,
        elderlyName: evts[0].elderlyName,
        elderlyId: evts[0].elderlyId,
        rawDate: evts[0].rawDate,
        events: evts,
      });
    }

    return [...singles, ...groups].sort((a, b) => {
      const rawA = a.kind === 'single' ? a.event.rawDate : a.rawDate;
      const rawB = b.kind === 'single' ? b.event.rawDate : b.rawDate;
      return rawA.localeCompare(rawB);
    });
  }, [filteredEvents]);

  const flatListRef = useRef<FlatList<DisplayItem>>(null);
  const hasInitiallyLoaded = useRef(false);

  const scrollToPriorityTask = useCallback(() => {
    if (!loading && displayItems.length > 0) {
      const hasMissed = (item: DisplayItem) => {
        if (item.kind === 'single') return String(item.event.status).toLowerCase() === ScheduleStatus.MISSED.toLowerCase();
        return item.events.some(e => String(e.status).toLowerCase() === ScheduleStatus.MISSED.toLowerCase());
      };
      const hasPending = (item: DisplayItem) => {
        if (item.kind === 'single') return String(item.event.status).toLowerCase() === ScheduleStatus.PENDING.toLowerCase();
        return item.events.some(e => String(e.status).toLowerCase() === ScheduleStatus.PENDING.toLowerCase());
      };

      let targetIndex = displayItems.findIndex(hasMissed);
      if (targetIndex === -1) targetIndex = displayItems.findIndex(hasPending);

      if (targetIndex !== -1) {
        flatListRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0,
        });
      }
    }
  }, [loading, displayItems]);

  // Auto-scroll logic to nearest missed or pending task - only on initial data load
  useEffect(() => {
    if (!loading && !hasInitiallyLoaded.current && displayItems.length > 0) {
      hasInitiallyLoaded.current = true;
      const timer = setTimeout(() => {
        scrollToPriorityTask();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, displayItems.length, scrollToPriorityTask]);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      const rows = await fetchScheduleCategories();
      setCategories(rows);
    } catch (err) {
      console.error("Error fetching categories", err);
    }
  }, []);

  // Fetch Data
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        setLoading(false);
        return;
      }

      const elderlyList = await getLinkedElderly(caregiver.$id);
      setLinkedElderly(elderlyList);

      if (elderlyList.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const elderlyIds = elderlyList.map((elderly) => elderly.$id);
      const elderlyMap = new Map(
        elderlyList.map((elderly) => [elderly.$id, elderly.name]),
      );

      const [scheduleEvents, medicationEvents] = await Promise.all([
        fetchDayScheduleEvents(elderlyIds, selectedDate, categories, elderlyMap),
        fetchDayMedicationEvents(elderlyIds, selectedDate, elderlyMap),
      ]);

      const allEvents = [...scheduleEvents, ...medicationEvents].sort((a, b) =>
        a.rawDate.localeCompare(b.rawDate),
      );
      setEvents(allEvents);
    } catch (err) {
      console.error("Error fetching schedule", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedDate, categories]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 60s so overdue PENDING items get auto-marked MISSED
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Generate next 7 days from referenceDate
  const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const dates = Array.from({ length: 7 }, (_, i) => {
    const dateItem = new Date(referenceDate);
    dateItem.setDate(referenceDate.getDate() + i);
    return {
      day: t(`schedule.${WEEKDAY_KEYS[dateItem.getDay()]}`),
      date: dateItem.getDate(),
      fullDate: dateItem,
      isToday: dateItem.toDateString() === new Date().toDateString(),
    };
  });

  const onConfirmDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setDatePickerVisible(false);
    if (selectedDate) {
      if (Platform.OS === "ios") {
        setTempPickerDate(selectedDate);
      } else {
        setReferenceDate(selectedDate);
        setSelectedDate(selectedDate);
      }
    }
  };

  const onConfirmDateDone = () => {
    setDatePickerVisible(false);
    setReferenceDate(tempPickerDate);
    setSelectedDate(tempPickerDate);
  };

  const onConfirmTime = (event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setTimePickerVisible(false);
    if (selectedDate) {
      if (Platform.OS === "ios") {
        setTempPickerTime(selectedDate);
      } else {
        const hours = selectedDate.getHours();
        const minutes = selectedDate.getMinutes();
        const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        setNewTask((prev) => ({ ...prev, time: timeString }));
      }
    }
  };

  const onConfirmTimeDone = () => {
    setTimePickerVisible(false);
    const hours = tempPickerTime.getHours();
    const minutes = tempPickerTime.getMinutes();
    const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    setNewTask((prev) => ({ ...prev, time: timeString }));
  };

  const onConfirmNewTaskDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setNewTaskDatePickerVisible(false);
    if (selectedDate) {
      if (Platform.OS === "ios") {
        setTempNewTaskDate(selectedDate);
      } else {
        setNewTask((prev) => ({ ...prev, date: selectedDate }));
      }
    }
  };

  const onConfirmNewTaskDateDone = () => {
    setNewTaskDatePickerVisible(false);
    setNewTask((prev) => ({ ...prev, date: tempNewTaskDate }));
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(pickerYear, monthIndex, 1);
    setReferenceDate(newDate);
    setSelectedDate(newDate);
    setMonthPickerVisible(false);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.navigate("/caregiver")}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            color={theme.colors.onSurface}
          />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>{t('common.back')}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ marginRight: 10 }}>
          <Chip
            icon="calendar-month"
            onPress={() => {
              setTempPickerDate(referenceDate);
              setDatePickerVisible(true);
            }}
          >
            {t('schedule.calendar')}
          </Chip>
        </View>
      ),
    });
  }, [navigation, router, theme]);

  // -- Event handlers ---------------------------------------------------------

  const handleMarkDone = async (taskId: string) => {
    try {
      await markScheduleTaskCompleted(taskId);
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === taskId
            ? { ...event, status: ScheduleStatus.COMPLETED }
            : event,
        ),
      );
    } catch (err) {
      console.error("Error updating task status", err);
      Alert.alert(t('common.error'), t('schedule.couldNotMarkDone'));
    }
  };

  const handleUndoTask = async (taskId: string) => {
    try {
      await undoScheduleTaskCompleted(taskId);
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === taskId
            ? { ...event, status: ScheduleStatus.PENDING }
            : event,
        ),
      );
    } catch (err) {
      console.error("Error undoing task", err);
      Alert.alert(t('common.error'), t('schedule.couldNotUndo'));
    }
  };

  const handleTakeMedication = async (event: ScheduleEvent) => {
    if (!event.medicationData) return;
    const { realId, logId, reminderId } = event.medicationData;

    try {
      const activeLogId = await recordMedicationTaken({
        reminderId,
        logId,
        elderlyId: event.elderlyId,
        scheduledAt: event.rawDate,
        prescriptionId: realId,
      });

      setEvents((prev) =>
        prev.map((existingEvent) => {
          if (existingEvent.id === event.id) {
            return {
              ...existingEvent,
              status: ScheduleStatus.COMPLETED,
              medicationData: { ...existingEvent.medicationData!, logId: activeLogId },
            };
          }
          return existingEvent;
        }),
      );
    } catch (err) {
      console.error("Failed to take med", err);
      Alert.alert(t('common.error'), t('schedule.failedToUpdateMedStatus'));
    }
  };

  const handleUndoMedication = async (event: ScheduleEvent) => {
    if (!event.medicationData?.logId) return;

    try {
      await undoMedicationTaken(event.medicationData.logId);

      setEvents((prev) =>
        prev.map((existingEvent) => {
          if (existingEvent.id === event.id) {
            return { ...existingEvent, status: ScheduleStatus.PENDING };
          }
          return existingEvent;
        }),
      );

      await fetchData();
    } catch (err) {
      Alert.alert(t('common.error'), t('schedule.failedToUndo'));
    }
  };

  const handleRemindTask = async (event: ScheduleEvent) => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('schedule.permissionRequired'), t('schedule.enableNotifications'));
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('schedule.taskReminder'),
          body: `${t('schedule.reminderPrefix')}${event.title} (${event.elderlyName})`,
          data: { eventId: event.id },
        },
        trigger: { type: "timeInterval", seconds: 5, repeats: false } as any,
      });
      Alert.alert(t('schedule.reminderSet'), t('schedule.notifIn5Sec'));
    } catch (e) {
      console.warn(e);
      Alert.alert(t('common.error'), t('schedule.couldNotSchedule'));
    }
  };

  const handleRemindMedication = async (event: ScheduleEvent) => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t('schedule.permissionRequired'), t('schedule.enableNotifications'));
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('schedule.medReminder'),
          body: `${t('schedule.timeToTake', { med: event.title })} (${event.elderlyName})`,
          data: { eventId: event.id },
        },
        trigger: { type: "timeInterval", seconds: 5, repeats: false } as any,
      });
      Alert.alert(t('schedule.reminderSet'), t('schedule.notifIn5Sec'));
    } catch (e) {
      console.warn(e);
      Alert.alert(t('common.error'), t('schedule.couldNotSchedule'));
    }
  };

  const openMedicationDetails = useCallback((event: ScheduleEvent) => {
    const statusLabel =
      String(event.status).toLowerCase() === ScheduleStatus.COMPLETED.toLowerCase()
        ? t('common.completed')
        : String(event.status).toLowerCase() === ScheduleStatus.MISSED.toLowerCase()
          ? t('common.missed')
          : t('common.pending');

    setSelectedMedicationDetails({
      title: event.title,
      subtitle: `${event.elderlyName} · ${statusLabel}`,
      fields: [
        { label: "Dose", value: event.description },
        { label: "Time", value: event.time },
        { label: "Scheduled", value: new Date(event.rawDate).toLocaleString() },
      ],
    });
  }, [t]);

  const handleSaveTask = async () => {
    if (!newTask.title || !newTask.elderlyId || !newTask.time) {
      Alert.alert(
        t('schedule.missingInfo'),
        t('schedule.enterTitleTimeElderly'),
      );
      return;
    }

    try {
      setLoading(true);
      const combinedDatetime = new Date(newTask.date);
      const [hours, minutes] = newTask.time.split(":").map(Number);
      combinedDatetime.setHours(hours, minutes, 0, 0);

      await createScheduleTask({
        title: newTask.title,
        description: newTask.description,
        datetime: combinedDatetime,
        elderlyId: newTask.elderlyId,
        typeName: newTask.type,
        categoryId: newTask.typeId,
      });

      setNewTaskVisible(false);
      setNewTask({
        title: "",
        description: "",
        date: new Date(),
        time: "",
        type: "Activity",
        elderlyName: "All",
        elderlyId: "",
        status: ScheduleStatus.PENDING,
      });

      fetchData();
    } catch (err) {
      console.error("Error creating task", err);
    } finally {
      setLoading(false);
    }
  };

  // -- Render helpers ---------------------------------------------------------

  const renderDisplayItem = ({ item }: { item: DisplayItem }) => {
    if (item.kind === 'single') {
      return (
        <ScheduleSingleEventCard
          item={item.event}
          onMarkDone={handleMarkDone}
          onUndoTask={handleUndoTask}
          onRemind={handleRemindTask}
        />
      );
    }
    return (
      <ScheduleMedGroupCard
        group={item}
        onTakeMedication={handleTakeMedication}
        onUndoMedication={handleUndoMedication}
        onRemindMedication={handleRemindMedication}
        onShowDetails={openMedicationDetails}
      />
    );
  };

  // -- JSX --------------------------------------------------------------------

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header Date Strip */}
      <ScheduleCalendarStrip
        referenceDate={referenceDate}
        selectedDate={selectedDate}
        dates={dates}
        onSelectDate={setSelectedDate}
        onOpenMonthPicker={() => {
          setPickerYear(referenceDate.getFullYear());
          setMonthPickerVisible(true);
        }}
      />

      <View style={styles.taskListContainer}>
        <View style={styles.listHeader}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              variant="titleMedium"
              style={{ fontWeight: "bold", marginRight: 8 }}
            >
              {t('schedule.tasksFor')}
            </Text>
            <Button
              mode="text"
              onPress={() => setFilterVisible(true)}
              compact
              contentStyle={{ flexDirection: "row-reverse" }}
              icon="chevron-down"
              labelStyle={{ fontSize: 16, fontWeight: "bold" }}
            >
              {selectedElderlyId === "All"
                ? t('schedule.everyone')
                : linkedElderly.find((e) => e.$id === selectedElderlyId)
                    ?.name || t('common.unknown')}
            </Button>
            <ScheduleFilterDialog
              visible={filterVisible}
              onDismiss={() => setFilterVisible(false)}
              linkedElderly={linkedElderly}
              selectedElderlyId={selectedElderlyId}
              onSelectElderly={(id) => {
                setSelectedElderlyId(id);
                setFilterVisible(false);
              }}
              searchQuery={filterSearchQuery}
              onSearchChange={setFilterSearchQuery}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Button
              icon="crosshairs-gps"
              mode="contained-tonal"
              compact
              onPress={scrollToPriorityTask}
              style={{ marginRight: 8 }}
            >
              {t('schedule.focus')}
            </Button>
            <Chip compact>{filteredEvents.length} {t('schedule.tasks')}</Chip>
          </View>
        </View>
        <FlatList
          ref={flatListRef}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise((resolve) => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0,
              });
            });
          }}
          data={displayItems}
          keyExtractor={(item) =>
            item.kind === 'single' ? item.event.id : item.key
          }
          renderItem={renderDisplayItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            !loading ? (
              <View style={{ alignItems: "center", marginTop: 50 }}>
                <Text style={{ color: theme.colors.outline }}>
                  {t('schedule.noTasksForDay')}
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => setNewTaskVisible(true)}
        label={t('schedule.newTask')}
      />

      <MedicationDetailsModal
        visible={!!selectedMedicationDetails}
        title={selectedMedicationDetails?.title || ""}
        subtitle={selectedMedicationDetails?.subtitle}
        fields={selectedMedicationDetails?.fields || []}
        onDismiss={() => setSelectedMedicationDetails(null)}
      />

      {/* Native Date Picker */}
      {Platform.OS === "ios" ? (
        <Modal visible={datePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setDatePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmDateDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempPickerDate}
                mode="date"
                display="spinner"
                onChange={onConfirmDate}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        datePickerVisible && (
          <DateTimePicker
            value={referenceDate}
            mode="date"
            display="default"
            onChange={onConfirmDate}
          />
        )
      )}

      {/* Native Time Picker for New Task */}
      {Platform.OS === "ios" ? (
        <Modal visible={timePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setTimePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmTimeDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempPickerTime}
                mode="time"
                display="spinner"
                onChange={onConfirmTime}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
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

      {/* Native Date Picker for New Task */}
      {Platform.OS === "ios" ? (
        <Modal visible={newTaskDatePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setNewTaskDatePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onConfirmNewTaskDateDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempNewTaskDate}
                mode="date"
                display="spinner"
                onChange={onConfirmNewTaskDate}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        newTaskDatePickerVisible && (
          <DateTimePicker
            value={newTask.date}
            mode="date"
            display="default"
            onChange={onConfirmNewTaskDate}
          />
        )
      )}

      {/* Custom Month Picker Dialog */}
      <ScheduleMonthPicker
        visible={monthPickerVisible}
        onDismiss={() => setMonthPickerVisible(false)}
        pickerYear={pickerYear}
        onChangeYear={setPickerYear}
        referenceDate={referenceDate}
        onSelectMonth={handleMonthSelect}
      />

      {/* New Task Modal */}
      <NewTaskModal
        visible={newTaskVisible}
        onDismiss={() => {
          setNewTaskVisible(false);
          setSelectionMode("form");
        }}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        newTask={newTask}
        onNewTaskChange={setNewTask}
        linkedElderly={linkedElderly}
        categories={categories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={loading}
        onSave={handleSaveTask}
        onOpenDatePicker={() => {
          setTempNewTaskDate(newTask.date);
          setNewTaskDatePickerVisible(true);
        }}
        onOpenTimePicker={() => {
          setTempPickerTime(new Date());
          setTimePickerVisible(true);
        }}
        onRetryCategories={fetchCategories}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  taskListContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 16,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
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
