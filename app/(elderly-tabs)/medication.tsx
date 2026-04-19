import {
  DATABASE_ID,
  MEDICATION_LOGS_TABLE_ID,
  safeSubscribe
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
  createElderlyMedicationWithReminder,
  fetchCaregiversForElderly,
} from "@/lib/elderly";
import {
  checkAndMarkSkippedMedications,
  deactivateMedicationReminder,
  fetchActiveMedicationReminders,
  fetchDailyMedicationLogs,
  fetchFinishedMedicationReminders,
  logMedicationAction,
  markPreviousDaysPendingAsMissing,
} from "@/lib/medication_tracking";
import {
  cancelAllNotifications,
  registerForPushNotificationsAsync,
  scheduleMedicationNotification,
  sendImmediateNotification,
} from "@/lib/notifications";
import { translateUnit } from "@/lib/schedule";
import {
  Caregiver,
  ElderlyMedicationReminder,
  MedicationLogs,
} from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import { useTranslation } from "react-i18next";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  Alert,
  Animated,
  AppState,
  Modal as RNModal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import {
  Button,
  Card,
  Divider,
  FAB,
  IconButton,
  Modal,
  Portal,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

// --- AI / Scan Configuration (DashScope) ---
const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim();
const DASHSCOPE_API_URL =
  process.env.EXPO_PUBLIC_DASHSCOPE_API_URL?.trim() ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_IMAGE_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_IMAGE_MODEL?.trim() ||
  "qwen-vl-max-latest";

// Maximum image size for upload (1.5MB to be safe)
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

type TodoItem = {
  reminder: ElderlyMedicationReminder;
  time: string; // HH:mm
  scheduledAt: string; // ISO String
  status: "pending" | "taken" | "missing";
  logId?: string;
  medicationName: string;
  dosage: string;
};

type TimeGroup = {
  time: string; // HH:mm
  items: TodoItem[];
};

export default function ElderlyMedicationScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);

  const [reminders, setReminders] = React.useState<ElderlyMedicationReminder[]>(
    [],
  );
  const [finishedReminders, setFinishedReminders] = React.useState<
    ElderlyMedicationReminder[]
  >([]);
  const [todayLogs, setTodayLogs] = React.useState<MedicationLogs[]>([]);

  const [caregivers, setCaregivers] = React.useState<Caregiver[]>([]);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [caregiverMenuVisible, setCaregiverMenuVisible] = React.useState(false);

  // --- AI Scan State ---
  const [isScanning, setIsScanning] = React.useState(false);

  // Track notified missing logs to avoid spam
  const notifiedMissingLogs = React.useRef<Set<string>>(new Set());

  // Form State
  const [medicineName, setMedicineName] = React.useState("");
  const [unit, setUnit] = React.useState("dose");
  // Local state for text inputs to prevent IME (handwriting/pinyin) composition interruption
  const [localMedicineName, setLocalMedicineName] = React.useState("");
  const [localUnit, setLocalUnit] = React.useState("dose");
  const [dosage, setDosage] = React.useState("1");
  const [timesPerDay, setTimesPerDay] = React.useState(1);
  const [durationDays, setDurationDays] = React.useState(7);
  const [followUpCaregiver, setFollowUpCaregiver] = React.useState("");
  const [afterMeal, setAfterMeal] = React.useState(false);
  const [reminderTimes, setReminderTimes] = React.useState<string[]>(["08:00"]);

  // iOS time picker state for reminder times
  const [medTimePickerVisible, setMedTimePickerVisible] = React.useState(false);
  const [editingTimeIdx, setEditingTimeIdx] = React.useState<number>(0);
  const [tempMedTime, setTempMedTime] = React.useState(new Date());

  const fetchData = React.useCallback(async () => {
    if (!user) return;

    try {
      if (user) {
        await markPreviousDaysPendingAsMissing(user.$id); // Sweep old pending -> missing
        await checkAndMarkSkippedMedications(user.$id); // Check for skipped status first
      }

      const [remindersData, logsData, caregiversData, finishedData] =
        await Promise.all([
          fetchActiveMedicationReminders(user.$id),
          fetchDailyMedicationLogs(user.$id, new Date()),
          fetchCaregiversForElderly(user.$id),
          fetchFinishedMedicationReminders(user.$id),
        ]);

      setReminders(remindersData);
      setTodayLogs(logsData);
      setCaregivers(caregiversData);
      setFinishedReminders(finishedData);
    } catch (err) {
      console.error("Error fetching medication data:", err);
    }
  }, [user]);

  React.useEffect(() => {
    fetchData();

    // 1. AppState Listener: Refresh when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        fetchData();
      }
    });

    // 2. Interval Polling: Check every 30 seconds for status updates (e.g., missed meds)
    const intervalId = setInterval(() => {
      fetchData();
    }, 30000);

    // 3. Appwrite Realtime: Subscribe to medication logs changes
    const realtimeUnsubscribe = safeSubscribe(
      `databases.${DATABASE_ID}.collections.${MEDICATION_LOGS_TABLE_ID}.documents`,
      (response) => {
        if (
          response.events.some(
            (e) => e.includes("create") || e.includes("update"),
          )
        ) {
          fetchData();
        }
      },
    );

    return () => {
      subscription.remove();
      clearInterval(intervalId);
      realtimeUnsubscribe();
    };
  }, [fetchData]);

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
      // Basic check: is today within start_date + duration?
      // For simplicity, we assume active reminders are valid for today.

      r.reminder_times.forEach((time) => {
        // Construct scheduled time treating 'time' as HK Time
        const [hours, minutes] = time.split(":").map(Number);

        // Construct a base date using the HK date string, set to 00:00 UTC
        const baseDate = new Date(todayStr);
        baseDate.setUTCHours(hours, minutes, 0, 0);

        // Subtract 8 hours to convert HKT to UTC
        const scheduledDate = new Date(baseDate.getTime() - hkOffset);
        const scheduledAt = scheduledDate.toISOString();

        // Hide if scheduled_at is before start_date (e.g. created later in the day)
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

        // Derive display status: mark as missing if >10 min past scheduled time
        let status: "pending" | "taken" | "missing" = log
          ? (log.status as any)
          : "pending";
        if (
          status === "pending" &&
          now.getTime() - scheduledDate.getTime() > 10 * 60 * 1000
        ) {
          status = "missing";
        }

        list.push({
          reminder: r,
          time,
          scheduledAt,
          status,
          logId: log?.$id,
          medicationName: medName,
          dosage: medDosage,
        });
      });
    });

    // Sort by time
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }, [reminders, todayLogs]);

  // Group todoList items by time slot for display
  const groupedTodoList = React.useMemo(() => {
    const groupMap = new Map<string, TodoItem[]>();
    todoList.forEach((item) => {
      const existing = groupMap.get(item.time);
      if (existing) {
        existing.push(item);
      } else {
        groupMap.set(item.time, [item]);
      }
    });
    const groups: TimeGroup[] = [];
    groupMap.forEach((items, time) => {
      groups.push({ time, items });
    });
    return groups.sort((a, b) => a.time.localeCompare(b.time));
  }, [todoList]);

  // Notification Logic: Schedule reminders and alert on missing
  React.useEffect(() => {
    const manageNotifications = async () => {
      const hasPerm = await registerForPushNotificationsAsync();
      if (!hasPerm) return;

      // 1. Alert for newly detected 'missing' medications
      const missingItems = todoList.filter((i) => i.status === "missing");
      const newMissing = missingItems.filter((i) => {
        // If we haven't notified about this specific instance/slot yet
        // Key can be logId if exists, or schedule key
        const key = i.logId || `${i.reminder.$id}-${i.scheduledAt}`;
        return !notifiedMissingLogs.current.has(key);
      });

      if (newMissing.length > 0) {
        // Summarize
        const names = newMissing.map((i) => i.medicationName).join(", ");
        const body = t("medication.missedMedAlertDesc", { medications: names });
        await sendImmediateNotification(t("medication.missedMedAlert"), body);

        // Mark as notified
        newMissing.forEach((i) => {
          const key = i.logId || `${i.reminder.$id}-${i.scheduledAt}`;
          notifiedMissingLogs.current.add(key);
        });
      }

      // 2. Reschedule future pending reminders
      // We cancel everything first to ensure we sync with latest data (e.g. if time changed or taken)
      await cancelAllNotifications();

      const pendingItems = todoList.filter((i) => i.status === "pending");

      // Group by Scheduled Time string (ISO)
      const grouped: Record<string, string[]> = {};

      pendingItems.forEach((i) => {
        if (!grouped[i.scheduledAt]) {
          grouped[i.scheduledAt] = [];
        }
        grouped[i.scheduledAt].push(i.medicationName);
      });

      // Schedule for each group
      for (const [isoDate, names] of Object.entries(grouped)) {
        const triggerDate = new Date(isoDate);
        if (triggerDate.getTime() > Date.now()) {
          const medList = names.join(", ");
          await scheduleMedicationNotification(
            t("medication.medicationReminder"),
            t("medication.medReminder", { medications: medList }),
            triggerDate,
          );
        }
      }
    };

    manageNotifications();
  }, [todoList]);

  // --- AI Image Processing ---
  const getImageBase64 = async (uri: string) => {
    try {
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      return await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
    } catch (e) {
      console.error("Base64 error:", e);
      throw e;
    }
  };

  const prepareImageForUpload = async (uri: string) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );
      return manipulated.uri;
    } catch (error) {
      console.warn("Image prep failed, using original", error);
      return uri;
    }
  };

  const analyzeMedicationImage = async (uri: string) => {
    if (!DASHSCOPE_API_KEY) {
      Alert.alert(t("medication.configError"), t("medication.apiKeyMissing"));
      return null;
    }

    try {
      const processedUri = await prepareImageForUpload(uri);
      const base64 = await getImageBase64(processedUri);

      const response = await fetch(`${DASHSCOPE_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
          model: DASHSCOPE_IMAGE_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this image of a medication package or pill. Extract: name, dosage (e.g. '500 mg'), unit (e.g. 'tablet'), timesPerDay (number, default 1), durationDays (number, default 7). Return ONLY a JSON object. No markdown.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("DashScope API error:", response.status, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("DashScope response:", JSON.stringify(data).slice(0, 500));
      const content =
        data.choices?.[0]?.message?.content ||
        data.output?.choices?.[0]?.message?.content ||
        data.output?.text;
      if (!content) throw new Error("No content from AI");

      const jsonString = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("AI Analysis failed:", error);
      Alert.alert(t("common.error"), t("medication.scanFailed"));
      return null;
    }
  };

  const handleScanMedication = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("common.permissionNeeded"),
          t("medication.cameraPermissionRequired"),
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setIsScanning(true);
        const data = await analyzeMedicationImage(result.assets[0].uri);
        setIsScanning(false);

        if (data) {
          if (data.name) { setMedicineName(data.name); setLocalMedicineName(data.name); }
          if (data.unit) { setUnit(data.unit); setLocalUnit(data.unit); }
          if (data.dosage) setDosage(String(data.dosage));

          const tpd = Number(data.timesPerDay) || 1;
          setTimesPerDay(tpd);

          // Set default times based on timesPerDay
          let newTimes = ["08:00"];
          if (tpd === 2) newTimes = ["08:00", "20:00"];
          else if (tpd === 3) newTimes = ["08:00", "13:00", "20:00"];
          else if (tpd === 4) newTimes = ["08:00", "12:00", "16:00", "20:00"];

          setReminderTimes(newTimes);

          if (data.durationDays) setDurationDays(Number(data.durationDays));

          Alert.alert(t("common.success"), t("medication.medDetailsScanned"));
        }
      }
    } catch (error) {
      setIsScanning(false);
      Alert.alert(t("common.error"), t("medication.scanFailed"));
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleTakeMedication = async (item: TodoItem) => {
    // Toggle logic: if taken -> pending. if pending/skipped -> taken.
    try {
      const newStatus = item.status === "taken" ? "pending" : "taken";

      await logMedicationAction(
        user!.$id,
        item.reminder.$id,
        item.scheduledAt,
        newStatus,
      );
      await fetchData();
    } catch (error) {
      Alert.alert(t("common.error"), t("medication.failedToUpdateStatus"));
    }
  };

  const showMessage = React.useCallback((title: string, message: string) => {
    if (Platform.OS === "web") {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const generateSmartReminderTimes = React.useCallback(
    (count: number, isAfterMeal = false) => {
      let defaultTimes: string[] = [];

      if (count === 2) {
        defaultTimes = ["08:00", "20:00"];
      } else if (count === 3) {
        defaultTimes = ["08:00", "13:00", "20:00"];
      } else if (count === 4) {
        defaultTimes = ["08:00", "12:00", "16:00", "20:00"];
      } else if (count > 4) {
        const wakingHours = 24 - 8;
        const interval = wakingHours / count;
        const startHour = 8;

        for (let i = 0; i < count; i += 1) {
          const hour = Math.floor(startHour + i * interval);
          defaultTimes.push(`${String(hour).padStart(2, "0")}:00`);
        }
      } else {
        defaultTimes = ["08:00"];
      }

      if (isAfterMeal) {
        defaultTimes = defaultTimes.map((timeStr) => {
          const [hours, minutes] = timeStr.split(":").map(Number);
          let newHour = hours + 1;
          if (newHour >= 24) newHour -= 24;
          return `${String(newHour).padStart(2, "0")}:${String(
            minutes,
          ).padStart(2, "0")}`;
        });
      }

      // Smart Order: Rotate schedule so the next upcoming time corresponds to the first slot
      // using HK Time (UTC+8) to match system standards
      const now = new Date();
      const hkDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const currentMinutes = hkDate.getUTCHours() * 60 + hkDate.getUTCMinutes();

      let splitIndex = 0;
      for (let i = 0; i < defaultTimes.length; i++) {
        const [h, m] = defaultTimes[i].split(":").map(Number);
        if (h * 60 + m > currentMinutes) {
          splitIndex = i;
          break;
        }
      }

      if (splitIndex > 0) {
        const upcoming = defaultTimes.slice(splitIndex);
        const passed = defaultTimes.slice(0, splitIndex);
        defaultTimes = [...upcoming, ...passed];
      }

      return defaultTimes;
    },
    [],
  );

  // Sync local state when modal opens
  React.useEffect(() => {
    if (modalVisible) {
      setLocalMedicineName(medicineName);
      setLocalUnit(unit);
    }
  }, [modalVisible]);

  const resetForm = React.useCallback(() => {
    setMedicineName("");
    setUnit("dose");
    setLocalMedicineName("");
    setLocalUnit("dose");
    setDosage("1");
    setTimesPerDay(1);
    setDurationDays(7);
    // Show all caregivers
    const allCaregivers = caregivers
      .map((c) => c.name)
      .filter(Boolean)
      .join(", ");
    setFollowUpCaregiver(allCaregivers);

    setAfterMeal(false);
    setReminderTimes(generateSmartReminderTimes(1, false));
  }, [caregivers, generateSmartReminderTimes]);

  const openAddModal = React.useCallback(() => {
    resetForm();
    setModalVisible(true);
  }, [resetForm]);

  const handleTimesPerDayChange = React.useCallback(
    (newValue: number) => {
      setTimesPerDay(newValue);
      setReminderTimes(generateSmartReminderTimes(newValue, afterMeal));
    },
    [afterMeal, generateSmartReminderTimes],
  );

  const handleAfterMealChange = React.useCallback(
    (value: boolean) => {
      setAfterMeal(value);
      setReminderTimes(generateSmartReminderTimes(timesPerDay, value));
    },
    [generateSmartReminderTimes, timesPerDay],
  );

  const handleTimeChange = React.useCallback(
    (index: number, newTime: string) => {
      setReminderTimes((prev) => {
        const next = [...prev];
        next[index] = newTime;
        return next;
      });
    },
    [],
  );

  const openTimePicker = React.useCallback((index: number) => {
    const [h, m] = (reminderTimes[index] || "08:00").split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setTempMedTime(d);
    setEditingTimeIdx(index);
    setMedTimePickerVisible(true);
  }, [reminderTimes]);

  const onMedTimePickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "ios") {
      if (selectedDate) setTempMedTime(selectedDate);
      return;
    }
    setMedTimePickerVisible(false);
    if (selectedDate) {
      const h = selectedDate.getHours().toString().padStart(2, "0");
      const m = selectedDate.getMinutes().toString().padStart(2, "0");
      handleTimeChange(editingTimeIdx, `${h}:${m}`);
    }
  };

  const onMedTimePickerDone = () => {
    setMedTimePickerVisible(false);
    const h = tempMedTime.getHours().toString().padStart(2, "0");
    const m = tempMedTime.getMinutes().toString().padStart(2, "0");
    handleTimeChange(editingTimeIdx, `${h}:${m}`);
  };

  const saveMedication = React.useCallback(async () => {
    if (!user) return;

    // Sync local IME state before validation
    const finalName = localMedicineName;
    const finalUnit = localUnit;
    setMedicineName(finalName);
    setUnit(finalUnit);

    if (!finalName.trim()) {
      showMessage(
        t("medication.missingInfo"),
        t("medication.enterMedicineName"),
      );
      return;
    }

    if (timesPerDay < 1 || timesPerDay > 10) {
      showMessage(
        t("medication.invalidValue"),
        t("medication.timesPerDayRange"),
      );
      return;
    }

    const cleanedTimes = reminderTimes
      .map((time) => time.trim())
      .filter(Boolean);

    if (cleanedTimes.length === 0) {
      showMessage(t("medication.missingInfo"), t("medication.addReminderTime"));
      return;
    }

    const parsedDosage = Number.parseFloat(dosage);
    const safeDosage = Number.isFinite(parsedDosage) ? parsedDosage : 1;

    try {
      setSaving(true);
      await createElderlyMedicationWithReminder(user.$id, {
        name: finalName.trim(),
        unit: finalUnit.trim() || "dose",
        dosage: safeDosage,
        timesPerDay,
        durationDays,
        followUpCaregiver: followUpCaregiver.trim(),
        afterMeal,
        reminderTimes: cleanedTimes,
      });
      setModalVisible(false);
      await fetchData();
    } catch (error) {
      console.error("Error saving medication:", error);
      showMessage(t("common.error"), t("medication.failedToSave"));
    } finally {
      setSaving(false);
    }
  }, [
    afterMeal,
    dosage,
    durationDays,
    fetchData,
    followUpCaregiver,
    localMedicineName,
    localUnit,
    reminderTimes,
    showMessage,
    timesPerDay,
    user,
  ]);

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* To Take Today - Grouped by Time */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("medication.toTakeToday")}
        </Text>
        {groupedTodoList.length > 0 ? (
          groupedTodoList.map((group) => {
            const allTaken = group.items.every((i) => i.status === "taken");
            const hasMissing = group.items.some((i) => i.status === "missing");

            const groupAccent = allTaken
              ? "#4CAF50"
              : hasMissing
                ? "#E53935"
                : "#FF8F00";
            const groupBg = hasMissing
              ? isDark
                ? "rgba(229,57,53,0.1)"
                : "#FFF5F5"
              : theme.colors.surface;

            return (
              <View
                key={`group-${group.time}`}
                style={[
                  styles.medCard,
                  {
                    backgroundColor: groupBg,
                    borderLeftColor: groupAccent,
                  },
                ]}
              >
                {/* Group Header: Time */}
                <View style={styles.groupHeader}>
                  <View
                    style={[
                      styles.medCardTime,
                      { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={18}
                      color={theme.colors.onSurfaceVariant}
                    />
                    <Text
                      variant="titleMedium"
                      style={{
                        color: theme.colors.onSurface,
                        marginLeft: 6,
                        fontWeight: "700",
                      }}
                    >
                      {group.time}
                    </Text>
                  </View>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("medication.medications", { count: group.items.length })}
                  </Text>
                </View>

                {/* Individual medications within group */}
                {group.items.map((item, index) => {
                  const isTaken = item.status === "taken";
                  const isMissing = item.status === "missing";

                  return (
                    <View key={`${item.reminder.$id}-${item.time}-${index}`}>
                      {index > 0 && <Divider style={{ marginVertical: 8 }} />}
                      <View style={styles.groupItemRow}>
                        <View
                          style={[
                            styles.groupItemIcon,
                            {
                              backgroundColor: isTaken
                                ? isDark
                                  ? "rgba(76,175,80,0.15)"
                                  : "#E8F5E9"
                                : isMissing
                                  ? isDark
                                    ? "rgba(229,57,53,0.15)"
                                    : "#FFEBEE"
                                  : isDark
                                    ? "rgba(94,53,177,0.15)"
                                    : "#EDE7F6",
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              isTaken
                                ? "check-circle"
                                : isMissing
                                  ? "close-circle"
                                  : "pill"
                            }
                            size={22}
                            color={
                              isTaken
                                ? "#4CAF50"
                                : isMissing
                                  ? "#E53935"
                                  : "#5E35B1"
                            }
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text
                            variant="titleSmall"
                            style={{ fontWeight: "700" }}
                          >
                            {item.medicationName}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: theme.colors.onSurfaceVariant,
                              marginTop: 1,
                            }}
                          >
                            {item.dosage}
                          </Text>
                        </View>
                        {/* Per-item action button */}
                        {isTaken ? (
                          <TouchableOpacity
                            onPress={() => handleTakeMedication(item)}
                            style={[
                              styles.groupItemBtnDone,
                              {
                                backgroundColor: isDark
                                  ? "rgba(76,175,80,0.15)"
                                  : "#E8F5E9",
                              },
                            ]}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={18}
                              color={isDark ? "#81C784" : "#2E7D32"}
                            />
                            <Text
                              style={{
                                color: isDark ? "#81C784" : "#2E7D32",
                                fontSize: 12,
                                fontWeight: "600",
                                marginLeft: 4,
                              }}
                            >
                              {t("common.taken")}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleTakeMedication(item)}
                            style={[
                              styles.groupItemBtn,
                              {
                                backgroundColor: isMissing
                                  ? "#E53935"
                                  : "#4CAF50",
                              },
                            ]}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons
                              name="check-bold"
                              size={16}
                              color="#FFF"
                            />
                            <Text
                              style={{
                                color: "#FFF",
                                fontSize: 12,
                                fontWeight: "bold",
                                marginLeft: 4,
                              }}
                            >
                              {t("medication.take")}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        ) : (
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={48}
                color="#A5D6A7"
              />
              <Text
                variant="bodyLarge"
                style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}
              >
                {t("medication.noMedsToday")}
              </Text>
            </View>
          </Card>
        )}

        {/* My Medications List (Overview) */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("medication.activePrescriptions")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          {reminders.length > 0 ? (
            reminders.map((r, index) => {
              // @ts-ignore
              const meds = Array.isArray(r.elderly_medication?.medication)
                ? r.elderly_medication.medication
                : [];
              // @ts-ignore
              const name = meds[0]?.name || "Medication";

              const handleDelete = () => {
                Alert.alert(
                  t("medication.removePrescription"),
                  t("medication.removePrescriptionConfirm"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("common.remove"),
                      style: "destructive",
                      onPress: async () => {
                        try {
                          // Optimistic
                          setReminders((prev) =>
                            prev.filter((item) => item.$id !== r.$id),
                          );
                          await deactivateMedicationReminder(user!.$id, r.$id);
                          await fetchData();
                        } catch (e) {
                          console.error(e);
                          Alert.alert(
                            t("common.error"),
                            t("medication.couldNotRemove"),
                          );
                          await fetchData();
                        }
                      },
                    },
                  ],
                );
              };

              const renderRightActions = (
                progress: Animated.AnimatedInterpolation<number>,
                dragX: Animated.AnimatedInterpolation<number>,
              ) => {
                const scale = dragX.interpolate({
                  inputRange: [-80, 0],
                  outputRange: [1, 0],
                  extrapolate: "clamp",
                });
                return (
                  <TouchableOpacity
                    onPress={handleDelete}
                    style={styles.swipedRow}
                  >
                    <Animated.View
                      style={[styles.deleteButton, { transform: [{ scale }] }]}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={24}
                        color="white"
                      />
                    </Animated.View>
                  </TouchableOpacity>
                );
              };

              return (
                <Swipeable key={r.$id} renderRightActions={renderRightActions}>
                  <View
                    style={[
                      styles.prescriptionItem,
                      { borderBottomColor: theme.colors.outlineVariant },
                    ]}
                  >
                    <View
                      style={[
                        styles.prescriptionIconContainer,
                        {
                          backgroundColor: isDark
                            ? "rgba(94,53,177,0.15)"
                            : "#EDE7F6",
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="pill"
                        size={26}
                        color="#5E35B1"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                        {name}
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{
                          color: theme.colors.onSurfaceVariant,
                          marginTop: 2,
                        }}
                      >
                        {t("medication.timesDaily", {
                          times: r.reminder_times.length,
                        })}{" "}
                        ({r.reminder_times.join(", ")})
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-left"
                      size={22}
                      color={theme.colors.onSurfaceVariant}
                      style={{ marginRight: 4 }}
                    />
                  </View>
                </Swipeable>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="pill" size={48} color="#BDBDBD" />
              <Text
                variant="bodyLarge"
                style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}
              >
                {t("medication.noActivePrescriptions")}
              </Text>
            </View>
          )}
        </Card>

        {/* Finished Medications */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("medication.finishedMedications")}
        </Text>
        {(() => {
          if (finishedReminders.length === 0) {
            return (
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="history"
                    size={48}
                    color="#BDBDBD"
                  />
                  <Text
                    variant="bodyLarge"
                    style={{
                      marginTop: 8,
                      color: theme.colors.onSurfaceVariant,
                    }}
                  >
                    {t("medication.noFinishedMeds")}
                  </Text>
                </View>
              </Card>
            );
          }

          const now = new Date();
          const todayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );
          const weekStart = new Date(todayStart);
          weekStart.setDate(weekStart.getDate() - 7);
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

          const groups: { label: string; items: typeof finishedReminders }[] = [
            { label: "Today", items: [] },
            { label: "This Week", items: [] },
            { label: "This Month", items: [] },
            { label: "A Long Time Ago", items: [] },
          ];

          for (const r of finishedReminders) {
            const d = r.end_date
              ? new Date(r.end_date)
              : r.$updatedAt
                ? new Date(r.$updatedAt)
                : null;
            if (!d) {
              groups[3].items.push(r);
              continue;
            }
            if (d >= todayStart) groups[0].items.push(r);
            else if (d >= weekStart) groups[1].items.push(r);
            else if (d >= monthStart) groups[2].items.push(r);
            else groups[3].items.push(r);
          }

          const nonEmptyGroups = groups.filter((g) => g.items.length > 0);

          return nonEmptyGroups.map((group) => (
            <View key={`fg-${group.label}`}>
              <Text style={styles.finishedGroupLabel}>{group.label}</Text>
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                {group.items.map((r) => {
                  // @ts-ignore
                  const meds = Array.isArray(r.elderly_medication?.medication)
                    ? r.elderly_medication.medication
                    : [];
                  // @ts-ignore
                  const name = meds[0]?.name || "Medication";
                  // @ts-ignore
                  const medUnit = meds[0]?.unit || "dose";
                  const dosageStr = `${r.elderly_medication?.dosage || 1} ${translateUnit(medUnit)}`;

                  const endDateStr = r.end_date
                    ? new Date(r.end_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—";

                  const startDateStr = r.start_date
                    ? new Date(r.start_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—";

                  return (
                    <View
                      key={r.$id}
                      style={[
                        styles.finishedItem,
                        { borderBottomColor: theme.colors.outlineVariant },
                      ]}
                    >
                      <View
                        style={[
                          styles.finishedIconContainer,
                          {
                            backgroundColor: isDark
                              ? "rgba(96,125,139,0.15)"
                              : "#ECEFF1",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="check-decagram"
                          size={26}
                          color={isDark ? "#B0BEC5" : "#78909C"}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text
                          variant="titleMedium"
                          style={{
                            fontWeight: "700",
                            color: isDark ? "#B0BEC5" : "#546E7A",
                          }}
                        >
                          {name}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          {dosageStr} ·{" "}
                          {t("medication.timesDaily", {
                            times: r.reminder_times.length,
                          })}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          {startDateStr} → {endDateStr}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.finishedBadge,
                          {
                            backgroundColor: isDark
                              ? "rgba(0,105,92,0.15)"
                              : "#E0F2F1",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.finishedBadgeText,
                            { color: isDark ? "#80CBC4" : "#00695C" },
                          ]}
                        >
                          {t("common.completed")}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          ));
        })()}

        {/* Notes */}
        <Card
          style={[
            styles.notesCard,
            { backgroundColor: isDark ? "rgba(76,175,80,0.1)" : "#E8F5E9" },
          ]}
        >
          <Card.Content>
            <View style={styles.notesHeader}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: isDark ? "rgba(76,175,80,0.2)" : "#C8E6C9",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <MaterialCommunityIcons
                  name="information"
                  size={24}
                  color={isDark ? "#81C784" : "#2E7D32"}
                />
              </View>
              <Text
                variant="titleMedium"
                style={{
                  marginLeft: 10,
                  color: isDark ? "#A5D6A7" : "#1B5E20",
                  fontWeight: "700",
                }}
              >
                {t("medication.reminder")}
              </Text>
            </View>
            <Text
              variant="bodyLarge"
              style={{
                color: isDark ? "#81C784" : "#2E7D32",
                marginTop: 10,
                lineHeight: 24,
              }}
            >
              {t("medication.reminderTip")}
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={openAddModal}
        label={t("medication.addMedication")}
      />

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              {t("medication.addMedication")}
            </Text>

            <Button
              mode="contained-tonal"
              icon="camera"
              onPress={handleScanMedication}
              loading={isScanning}
              disabled={isScanning}
              style={{ marginBottom: 20 }}
            >
              {t("medication.scanMedication")}
            </Button>
            {isScanning && (
              <Text style={{ textAlign: "center", marginBottom: 16 }}>
                {t("medication.analyzingImage")}
              </Text>
            )}

            <TextInput
              label={t("medication.medicineName") + " *"}
              value={localMedicineName}
              onChangeText={setLocalMedicineName}
              onBlur={() => setMedicineName(localMedicineName)}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label={t("medication.unit")}
              value={localUnit}
              onChangeText={setLocalUnit}
              onBlur={() => setUnit(localUnit)}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label={t("medication.dosage")}
              value={dosage}
              onChangeText={setDosage}
              style={styles.input}
              mode="outlined"
              keyboardType="numeric"
            />

            <Text variant="labelLarge" style={styles.label}>
              {t("medication.timesPerDay")} *
            </Text>
            <View style={styles.counterRow}>
              <IconButton
                icon="minus"
                size={24}
                onPress={() =>
                  handleTimesPerDayChange(Math.max(1, timesPerDay - 1))
                }
                disabled={timesPerDay <= 1}
              />
              <Text variant="headlineSmall" style={styles.counterText}>
                {timesPerDay}
              </Text>
              <IconButton
                icon="plus"
                size={24}
                onPress={() =>
                  handleTimesPerDayChange(Math.min(10, timesPerDay + 1))
                }
                disabled={timesPerDay >= 10}
              />
            </View>

            <Text variant="labelLarge" style={styles.label}>
              {t("medication.durationDays")}
            </Text>
            <View style={styles.counterRow}>
              <IconButton
                icon="minus"
                size={24}
                onPress={() => setDurationDays(Math.max(1, durationDays - 1))}
              />
              <Text variant="headlineSmall" style={styles.counterText}>
                {durationDays}
              </Text>
              <IconButton
                icon="plus"
                size={24}
                onPress={() => setDurationDays(durationDays + 1)}
              />
            </View>

            <TextInput
              label={t("medication.followUpCaregivers")}
              value={followUpCaregiver}
              mode="outlined"
              style={styles.input}
              editable={false}
              multiline
            />

            <View style={styles.switchRow}>
              <Text variant="bodyLarge">{t("medication.takeAfterMeal")}</Text>
              <Switch value={afterMeal} onValueChange={handleAfterMealChange} />
            </View>

            <Divider style={styles.divider} />

            <Text variant="titleMedium" style={styles.timesTitle}>
              {t("medication.reminderTimes", { count: reminderTimes.length })}
            </Text>

            {reminderTimes.map((timeSlot, index) => (
              <View key={index} style={styles.timeInputRow}>
                <Text variant="bodyLarge">
                  {t("medication.time", { index: index + 1 })}:
                </Text>
                {Platform.OS === "web" ? (
                  <input
                    type="time"
                    value={timeSlot}
                    onChange={(event) =>
                      handleTimeChange(index, event.target.value)
                    }
                    style={{
                      padding: 8,
                      fontSize: 16,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      minWidth: 110,
                    }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => openTimePicker(index)}>
                    <TextInput
                      mode="outlined"
                      value={timeSlot}
                      editable={false}
                      style={styles.timeInput}
                      placeholder="HH:mm"
                      right={<TextInput.Icon icon="clock" onPress={() => openTimePicker(index)} />}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => setModalVisible(false)}
                style={styles.modalButton}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                mode="contained"
                onPress={saveMedication}
                style={styles.modalButton}
                loading={saving}
                disabled={saving}
              >
                {t("common.save")}
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* iOS Time Picker for Medication Reminder Times */}
      {Platform.OS === "ios" ? (
        <RNModal visible={medTimePickerVisible} transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => setMedTimePickerVisible(false)}>{t('common.cancel')}</Button>
                <Button onPress={onMedTimePickerDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempMedTime}
                mode="time"
                display="spinner"
                onChange={onMedTimePickerChange}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </RNModal>
      ) : (
        medTimePickerVisible && (
          <DateTimePicker
            value={tempMedTime}
            mode="time"
            display="default"
            onChange={onMedTimePickerChange}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 18,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 14,
    fontSize: 20,
  },
  card: {
    marginBottom: 18,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  medCard: {
    marginBottom: 14,
    borderRadius: 16,
    borderLeftWidth: 5,
    padding: 16,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  medCardTime: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  medCardAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  medCardActionText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "bold",
  },
  medCardDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    gap: 6,
  },
  medCardDoneText: {
    color: "#2E7D32",
    fontSize: 14,
    fontWeight: "600",
  },
  prescriptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
  },
  prescriptionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE7F6",
    justifyContent: "center",
    alignItems: "center",
  },
  listItem: {
    paddingVertical: 8,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  emptyState: {
    alignItems: "center",
    padding: 36,
  },
  notesCard: {
    marginTop: 10,
    borderRadius: 20,
    elevation: 1,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 40,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    borderRadius: 28,
  },
  modal: {
    margin: 20,
    borderRadius: 12,
    maxHeight: "100%",
    overflow: "hidden",
  },
  modalTitle: {
    marginBottom: 20,
    fontWeight: "bold",
  },
  input: {
    marginBottom: 16,
  },
  label: {
    marginTop: 8,
    marginBottom: 8,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  counterText: {
    marginHorizontal: 20,
    minWidth: 40,
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 12,
  },
  divider: {
    marginVertical: 12,
  },
  timesTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "bold",
  },
  timeInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeInput: {
    minWidth: 110,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    minWidth: 100,
  },
  swipedRow: {
    width: 80,
    backgroundColor: "#dd2c00",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  groupItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  groupItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  groupItemBtnDone: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
  },
  finishedGroupLabel: {
    fontWeight: "600",
    color: "#888",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  finishedItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
  },
  finishedIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECEFF1",
    justifyContent: "center",
    alignItems: "center",
  },
  finishedBadge: {
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  finishedBadgeText: {
    color: "#00695C",
    fontSize: 11,
    fontWeight: "700",
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
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
    padding: 8,
  },
});
