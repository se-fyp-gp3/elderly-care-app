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
  logMedicationAction,
} from "@/lib/medication_tracking";
import { Caregiver, ElderlyMedicationReminder, MedicationLog } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from 'react-native-gesture-handler/Swipeable';
import {
  Button,
  Card,
  Divider,
  FAB,
  IconButton,
  List,
  Modal,
  Portal,
  Switch,
  Text,
  TextInput,
  useTheme
} from "react-native-paper";

type TodoItem = {
  reminder: ElderlyMedicationReminder;
  time: string; // HH:mm
  scheduledAt: string; // ISO String
  status: "pending" | "taken" | "skipped";
  logId?: string;
  medicationName: string;
  dosage: string;
};

export default function ElderlyMedicationScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  
  const [reminders, setReminders] = React.useState<ElderlyMedicationReminder[]>([]);
  const [todayLogs, setTodayLogs] = React.useState<MedicationLog[]>([]);
  
  const [caregivers, setCaregivers] = React.useState<Caregiver[]>([]);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [caregiverMenuVisible, setCaregiverMenuVisible] = React.useState(false);

  // Form State
  const [medicineName, setMedicineName] = React.useState("");
  const [unit, setUnit] = React.useState("dose");
  const [dosage, setDosage] = React.useState("1");
  const [timesPerDay, setTimesPerDay] = React.useState(1);
  const [durationDays, setDurationDays] = React.useState(7);
  const [followUpCaregiver, setFollowUpCaregiver] = React.useState("");
  const [afterMeal, setAfterMeal] = React.useState(false);
  const [reminderTimes, setReminderTimes] = React.useState<string[]>([
    "08:00",
  ]);

  const fetchData = React.useCallback(async () => {
    if (!user) return;

    try {
      if (user) await checkAndMarkSkippedMedications(user.$id); // Check for skipped status first
      
      const [remindersData, logsData, caregiversData] = await Promise.all([
        fetchActiveMedicationReminders(user.$id),
        fetchDailyMedicationLogs(user.$id, new Date()),
        fetchCaregiversForElderly(user.$id)
      ]);
      
      setReminders(remindersData);
      setTodayLogs(logsData);
      setCaregivers(caregiversData);
    } catch (err) {
      console.error("Error fetching medication data:", err);
    }
  }, [user]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Compute "To Take Today" list
  const todoList = React.useMemo(() => {
    const list: TodoItem[] = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    reminders.forEach((r) => {
      // Basic check: is today within start_date + duration?
      // For simplicity, we assume active reminders are valid for today.
      // Ideally, check date ranges properly.
      
      r.reminder_times.forEach((time) => {
        // Construct scheduledAt for today
        // Time is "HH:mm"
        const scheduledAt = `${todayStr}T${time}:00.000Z`; // UTC or Local? simplified for now as string matching
        // In real app, be careful with Timezones. Assuming stored times are effectively 'local' wall time for user preference.
        
        // Find if logged
        const log = todayLogs.find(
           l => l.elderly_medication_reminder.$id === r.$id 
           && l.scheduled_at.includes(time) // loose match on time part inside ISO string if constructed similarly
           // Or better: construct the expected ISO string and match exactly
        );
        
        // Helper to get medication name safely
        // We know r.elderly_medication.medication is an array of Medication objects after hydration
        const medications = Array.isArray(r.elderly_medication?.medication) 
            ? r.elderly_medication.medication 
            : (r.elderly_medication?.medication ? [r.elderly_medication.medication] : []);
            
        // @ts-ignore
        const medName = medications[0]?.name || "Medication";
        // @ts-ignore
        const medUnit = medications[0]?.unit || 'dose';
        // @ts-ignore
        const medDosage = `${r.elderly_medication?.dosage || 1} ${medUnit}`;

        list.push({
            reminder: r,
            time,
            scheduledAt, // This is just a key for now
            status: log ? (log.status as any) : "pending",
            logId: log?.$id,
            medicationName: medName,
            dosage: medDosage
        });
      });
    });

    // Sort by time
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }, [reminders, todayLogs]);

  const handleTakeMedication = async (item: TodoItem) => {
      // Toggle logic: if taken -> pending. if pending/skipped -> taken.
      try {
          const newStatus = item.status === 'taken' ? 'pending' : 'taken';
          
          await logMedicationAction(
              user!.$id,
              item.reminder.$id,
              item.scheduledAt, 
              newStatus
          );
          await fetchData();
      } catch (error) {
          Alert.alert("Error", "Failed to update status");
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

      return defaultTimes;
    },
    [],
  );

  const resetForm = React.useCallback(() => {
    setMedicineName("");
    setUnit("dose");
    setDosage("1");
    setTimesPerDay(1);
    setDurationDays(7);
    // Show all caregivers
    const allCaregivers = caregivers.map(c => c.name).filter(Boolean).join(", ");
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

  const saveMedication = React.useCallback(async () => {
    if (!user) return;

    if (!medicineName.trim()) {
      showMessage("Missing info", "Please enter medicine name.");
      return;
    }

    if (timesPerDay < 1 || timesPerDay > 10) {
      showMessage("Invalid value", "Times per day must be between 1 and 10.");
      return;
    }

    const cleanedTimes = reminderTimes
      .map((time) => time.trim())
      .filter(Boolean);

    if (cleanedTimes.length === 0) {
      showMessage("Missing info", "Please add at least one reminder time.");
      return;
    }

    const parsedDosage = Number.parseFloat(dosage);
    const safeDosage = Number.isFinite(parsedDosage) ? parsedDosage : 1;

    try {
      setSaving(true);
      await createElderlyMedicationWithReminder(user.$id, {
        name: medicineName.trim(),
        unit: unit.trim() || "dose",
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
      showMessage("Error", "Failed to save medication.");
    } finally {
      setSaving(false);
    }
  }, [
    afterMeal,
    dosage,
    durationDays,
    fetchData,
    followUpCaregiver,
    medicineName,
    reminderTimes,
    showMessage,
    timesPerDay,
    unit,
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

      {/* NEW: To Take Today (Ci hecklist view) */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        To Take Today
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        {todoList.length > 0 ? (
          todoList.map((item, index) => {
             const isTaken = item.status === 'taken';
             return (
                <List.Item
                  key={`${item.reminder.$id}-${item.time}-${index}`}
                  title={`${item.medicationName} (${item.dosage})`}
                  description={`Value time: ${item.time}`}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                       <Text 
                         variant="labelMedium" 
                         style={{ 
                            textTransform: 'capitalize',
                            color: item.status === 'taken' ? '#4CAF50' : 
                                   item.status === 'skipped' ? '#FF5252' : 
                                   theme.colors.onSurfaceVariant 
                         }}
                       >
                         {item.status}
                       </Text>
                       <Button 
                          mode={isTaken ? "outlined" : "contained"}
                          onPress={() => handleTakeMedication(item)}
                          compact
                       >
                          {isTaken ? "Taken" : "Take"}
                       </Button>
                    </View>
                  )}
                  style={[styles.listItem, isTaken && { opacity: 0.6 }]}
                />
             );
          })
        ) : (
          <View style={styles.emptyState}>
             <Text>No medications scheduled for today.</Text>
          </View>
        )}
      </Card>

      {/* OLD: My Medications List (Overview) */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Active Prescriptions
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        {reminders.length > 0 ? (
          reminders.map((r, index) => {
             // @ts-ignore
             const meds = Array.isArray(r.elderly_medication?.medication) ? r.elderly_medication.medication : [];
             // @ts-ignore
             const name = meds[0]?.name || "Medication";

             const handleDelete = () => {
                Alert.alert(
                    "Remove Prescription",
                    "Are you sure you want to remove this prescription? It will be hidden from your active list and pending schedules.",
                    [
                        { text: "Cancel", style: "cancel" },
                        { 
                            text: "Remove", 
                            style: "destructive",
                            onPress: async () => {
                                try {
                                    // Optimistic
                                    setReminders(prev => prev.filter(item => item.$id !== r.$id));
                                    await deactivateMedicationReminder(user!.$id, r.$id);
                                    await fetchData(); 
                                } catch (e) {
                                    console.error(e);
                                    Alert.alert("Error", "Could not remove prescription.");
                                    await fetchData();
                                }
                            }
                        }
                    ]
                );
             };
             
             const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
                const scale = dragX.interpolate({
                  inputRange: [-80, 0],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                });
                return (
                  <TouchableOpacity onPress={handleDelete} style={styles.swipedRow}>
                    <Animated.View style={[styles.deleteButton, { transform: [{ scale }] }]}>
                      <MaterialCommunityIcons name="trash-can-outline" size={24} color="white" />
                    </Animated.View>
                  </TouchableOpacity>
                );
             };
             
             return (
                <Swipeable key={r.$id} renderRightActions={renderRightActions}>
                    <List.Item
                      title={name}
                      description={`${r.reminder_times.length} times daily (${r.reminder_times.join(', ')})`}
                      left={(props) => <List.Icon {...props} icon="pill" />}
                    />
                </Swipeable>
             );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text>No active prescriptions.</Text>
          </View>
        )}
      </Card>
      
      {/* Notes */}
      <Card
        style={[
          styles.notesCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content>
          <View style={styles.notesHeader}>
            <MaterialCommunityIcons
              name="information"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer }}
            >
              Reminder
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
          >
            Take your medications with water. If you miss a dose, take it as
            soon as you remember unless it&apos;s almost time for the next dose.
          </Text>
        </Card.Content>
      </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={openAddModal}
        label="Add Medication"
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
              Add Medication
            </Text>

            <TextInput
              label="Medicine Name *"
              value={medicineName}
              onChangeText={setMedicineName}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label="Unit (e.g., tablet)"
              value={unit}
              onChangeText={setUnit}
              style={styles.input}
              mode="outlined"
            />

            <TextInput
              label="Dosage"
              value={dosage}
              onChangeText={setDosage}
              style={styles.input}
              mode="outlined"
              keyboardType="numeric"
            />

            <Text variant="labelLarge" style={styles.label}>
              Times Per Day (1-10) *
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
              Duration (Days)
            </Text>
            <View style={styles.counterRow}>
              <IconButton
                icon="minus"
                size={24}
                onPress={() =>
                  setDurationDays(Math.max(1, durationDays - 1))
                }
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
              label="Follow-up Caregiver(s)"
              value={followUpCaregiver}
              mode="outlined"
              style={styles.input}
              editable={false}
              multiline
            />

            <View style={styles.switchRow}>
              <Text variant="bodyLarge">Take after meal?</Text>
              <Switch value={afterMeal} onValueChange={handleAfterMealChange} />
            </View>

            <Divider style={styles.divider} />

            <Text variant="titleMedium" style={styles.timesTitle}>
              Reminder Times ({reminderTimes.length})
            </Text>

            {reminderTimes.map((timeSlot, index) => (
              <View key={index} style={styles.timeInputRow}>
                <Text variant="bodyLarge">Time {index + 1}:</Text>
                {Platform.OS === "web" ? (
                  <input
                    type="time"
                    value={timeSlot}
                    onChange={(event) => handleTimeChange(index, event.target.value)}
                    style={{
                      padding: 8,
                      fontSize: 16,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      minWidth: 110,
                    }}
                  />
                ) : (
                  <TextInput
                    mode="outlined"
                    value={timeSlot}
                    onChangeText={(value) => handleTimeChange(index, value)}
                    style={styles.timeInput}
                    placeholder="HH:mm"
                    keyboardType="numbers-and-punctuation"
                  />
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
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={saveMedication}
                style={styles.modalButton}
                loading={saving}
                disabled={saving}
              >
                Save
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
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
  card: {
    marginBottom: 16,
    borderRadius: 12,
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
    padding: 32,
  },
  notesCard: {
    marginTop: 8,
    borderRadius: 12,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
  },
  modal: {
    margin: 20,
    borderRadius: 12,
    maxHeight: "90%",
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
    backgroundColor: '#dd2c00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
