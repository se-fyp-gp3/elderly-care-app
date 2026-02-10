import { MedicationItem } from "@/components/MedicationCard";
import {
  DATABASE_ID,
  ELDERLY_MEDICATION_REMINDER_TABLE_ID,
  ELDERLY_MEDICATION_TABLE_ID,
  MEDICATION_LOGS_TABLE_ID,
  MEDICATION_TABLE_ID,
  tablesDB,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import { Elderly, ElderlyMedication, Medication } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ID, Query } from "react-native-appwrite";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  FAB,
  IconButton,
  Portal,
  Searchbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

// Helper to safely extract ID from relationship
const getRelationshipId = (val: any): string | null => {
  if (!val) return null;
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    const item = val[0];
    if (typeof item === "string") return item;
    if (typeof item === "object" && item.$id) return item.$id;
  }
  if (typeof val === "string") return val;
  if (typeof val === "object" && val.$id) return val.$id;
  return null;
};

// Start notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface ElderlyGroup {
  elderlyId: string;
  elderlyName: string;
  medications: MedicationItem[];
}

export default function MedicationManagement() {
  const theme = useTheme();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialogVisible, setDialogVisible] = useState<MedicationItem | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");
  const [elderlyGroups, setElderlyGroups] = useState<ElderlyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // New Filter State
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [personFilterVisible, setPersonFilterVisible] = useState(false);
  const [selectedElderlyId, setSelectedElderlyId] = useState<string>("All");
  const [statusFilterVisible, setStatusFilterVisible] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [undoVisible, setUndoVisible] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Add Medication State
  const [addMedVisible, setAddMedVisible] = useState(false);
  const [medSelectionMode, setMedSelectionMode] = useState<
    "form" | "elderly" | "frequency"
  >("form");
  const [medFormSearchQuery, setMedFormSearchQuery] = useState("");
  const [newMedData, setNewMedData] = useState({
    elderlyId: "",
    elderlyName: "", // Added for display
    name: "",
    unit: "mg",
    dosage: "1",
    frequency: "Daily",
    times: [new Date()],
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);

  // AppState handling for auto-refresh
  const appState = useRef(AppState.currentState);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Get Caregiver & Linked Elderly
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        setLoading(false);
        return;
      }

      const elderlyList = await getLinkedElderly(caregiver.$id);
      setLinkedElderly(elderlyList); // Store linked elderly list

      if (elderlyList.length === 0) {
        setElderlyGroups([]);
        setLoading(false);
        return;
      }

      const elderlyMap = new Map(elderlyList.map((e) => [e.$id, e]));
      const elderlyIds = elderlyList.map((e) => e.$id);

      // 2. Fetch Medication Records (Prescriptions) - BASE "PLAN"
      const emResponse = await tablesDB.listRows<ElderlyMedication>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_TABLE_ID,
        queries: [Query.equal("elderly", elderlyIds), Query.limit(100)],
      });

      // 2a. Fetch Reminders (to link logs)
      const remindersResponse = await tablesDB.listRows<any>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
        queries: [
          Query.equal("elderly", elderlyIds),
          Query.limit(1000), // Increased limit to ensure we catch all reminders
        ],
      });
      // Map ElderlyMedication ID -> Reminder ID (assuming one reminder per medication for simplicity)
      const emToReminderMap = new Map<string, string>();
      remindersResponse.rows.forEach((rem) => {
        const emId = getRelationshipId(rem.elderly_medication);
        if (emId) emToReminderMap.set(emId, rem.$id);
      });

      // 3. Fetch Medication Details
      const medIds = new Set<string>();
      emResponse.rows.forEach((row) => {
        const mId = getRelationshipId(row.medication);
        if (mId) medIds.add(mId);
      });

      const medMap = new Map<string, Medication>();
      if (medIds.size > 0) {
        const medResponse = await tablesDB.listRows<Medication>({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_TABLE_ID,
          queries: [Query.equal("$id", Array.from(medIds)), Query.limit(100)],
        });
        medResponse.rows.forEach((m) => medMap.set(m.$id, m));
      }

      // 4. Fetch Logs (Expanded range to catch timezone shifts)
      const startOfDay = new Date();
      startOfDay.setDate(startOfDay.getDate() - 1); // Looking back 24h
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setDate(endOfDay.getDate() + 1); // Looking forward 24h
      endOfDay.setHours(23, 59, 59, 999);

      const logsResponse = await tablesDB.listRows<any>({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        queries: [
          Query.equal("elderly", elderlyIds),
          Query.greaterThanEqual("scheduled_at", startOfDay.toISOString()),
          Query.lessThanEqual("scheduled_at", endOfDay.toISOString()),
          Query.limit(100),
        ],
      });

      // 5. Build Grouped Data
      const groups: ElderlyGroup[] = elderlyList
        .map((elderly) => {
          // Find prescriptions for this elderly
          const elderPrescriptions = emResponse.rows.filter((row) => {
            const eId = getRelationshipId(row.elderly);
            return eId === elderly.$id;
          });

          let dailyMeds: MedicationItem[] = [];

          elderPrescriptions.forEach((em) => {
            const mId = getRelationshipId(em.medication);
            const medication = mId ? medMap.get(mId) : null;
            const medName = medication
              ? medication.name || "Unknown Drug"
              : "Unknown Drug";
            const medUnit = medication ? medication.unit || "" : "";
            const dosage = `${em.dosage || "?"} ${medUnit}`;

            // Find logs for this prescription (indirectly via Reminder -> or just by elderly & medication match?)
            // Since linking Log -> ElderlyMedication is via Reminder, valid paths are complex.
            // For Simplicity & Robustness: Filter logs by matching Elderly AND Date.
            // To map Log to Prescription, we ideally need ID.
            // Let's rely on approx_times to generate "Planned Slots"

            const times = em.approx_times || [];
            const reminderId = emToReminderMap.get(em.$id);

            if (times.length === 0) {
              // No specific times, maybe 'PRN' or just show one generic pending item
              dailyMeds.push({
                id: em.$id, // Log ID not available yet
                isPrescriptionId: true, // Flag to indicate this ID is consistent
                elderly: elderly.name,
                name: medName,
                dosage: dosage,
                frequency: em.frequency || "",
                time: "Anytime",
                status: "pending",
                lastTaken: em.last_taken
                  ? new Date(em.last_taken).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Never",
                notes: em.notes || "",
                reminderId: reminderId,
              });
            } else {
              // Prepare logs for matching
              let potentialLogs: any[] = [];
              if (reminderId) {
                potentialLogs = logsResponse.rows.filter(
                  (l) =>
                    getRelationshipId(l.elderly_medication_reminder) ===
                    reminderId,
                );
              }

              // Create slots
              const slots = times.map((tStr, index) => {
                let todayScheduledTime = new Date();
                if (tStr.includes("T")) {
                  const d = new Date(tStr);
                  todayScheduledTime.setHours(
                    d.getHours(),
                    d.getMinutes(),
                    0,
                    0,
                  );
                } else if (tStr.includes(":")) {
                  const parts = tStr.split(":");
                  todayScheduledTime.setHours(
                    parseInt(parts[0]),
                    parseInt(parts[1]),
                    0,
                    0,
                  );
                }
                return {
                  timeObj: todayScheduledTime,
                  tStr,
                  index,
                  displayTime: todayScheduledTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }),
                };
              });

              // Match Logs to Slots using "Closest Time" strategy
              // Using a set to track used log IDs to prevent double assignment
              const usedLogIds = new Set<string>();

              slots.forEach((slot) => {
                let status = "pending";
                let logTaken = null;
                let currentLogId = undefined;

                // Find best matching log that hasn't been used
                let bestLog: any = null;
                let maxScore = -1;

                potentialLogs.forEach((log) => {
                  if (usedLogIds.has(log.$id)) return;

                  const logDate = new Date(log.scheduled_at);
                  let score = 0;

                  // 1. Check Minute Match (Robust +/- 5 mins)
                  const logMin = logDate.getMinutes();
                  const slotMin = slot.timeObj.getMinutes();
                  if (Math.abs(logMin - slotMin) < 5) score += 20;
                  else return; // Must match minutes roughly

                  // 2. Check Hour Match
                  const logHourLocal = logDate.getHours();
                  const logHourUTC = logDate.getUTCHours();
                  const slotHour = slot.timeObj.getHours();

                  if (logHourLocal === slotHour)
                    score += 50; // Perfect local time match
                  else if (logHourUTC === slotHour)
                    score += 40; // UTC shift match (common bug)
                  else return; // Must match hour in some way

                  // 3. Day Proximity (Penalize wrong day)
                  const timeDiff = Math.abs(
                    logDate.getTime() - slot.timeObj.getTime(),
                  );
                  const hoursDiff = timeDiff / (1000 * 60 * 60);

                  if (hoursDiff < 4)
                    score += 30; // Very close (Same day intended)
                  else if (hoursDiff < 26) score += 10; // Within a day shift

                  if (score > maxScore) {
                    maxScore = score;
                    bestLog = log;
                  }
                });

                // Threshold score > 30 implies at least Hour+Min match
                if (bestLog && maxScore >= 40) {
                  currentLogId = bestLog.$id;
                  usedLogIds.add(bestLog.$id);

                  if (bestLog.status === "taken") {
                    status = "completed";
                    logTaken = bestLog.taken_at;
                  }
                }
                // Fallback removed to ensure strict consistency with Database Logs.
                // Previously, this relied on 'last_taken' which caused UI to show 'Taken' even if Log creation failed.
                /* 
                            else if (!reminderId && em.last_taken) {
                                const lastTakenDate = new Date(em.last_taken);
                                const isTakenToday = lastTakenDate.getDate() === new Date().getDate() &&
                                    lastTakenDate.getMonth() === new Date().getMonth() &&
                                    lastTakenDate.getFullYear() === new Date().getFullYear();
                                if (isTakenToday && times.length === 1) status = 'completed';
                            }
                            */

                // Check for OVERDUE
                if (status === "pending") {
                  const now = new Date();
                  if (now > slot.timeObj) {
                    status = "missed";
                  }
                }

                dailyMeds.push({
                  id: `${em.$id}_${slot.index}`,
                  realId: em.$id,
                  isPrescriptionId: true,
                  elderly: elderly.name,
                  name: medName,
                  dosage: dosage,
                  frequency: em.frequency || "",
                  time: slot.displayTime,
                  status: status,
                  lastTaken: logTaken
                    ? new Date(logTaken).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : em.last_taken
                      ? new Date(em.last_taken).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never",
                  takenAtIso: logTaken || em.last_taken || undefined,
                  notes: em.notes || "",
                  reminderId: reminderId,
                  logId: currentLogId,
                });
              });
            }
          });

          dailyMeds.sort((a, b) => a.time.localeCompare(b.time));

          return {
            elderlyId: elderly.$id,
            elderlyName: elderly.name,
            medications: dailyMeds,
          };
        })
        .filter((g) => g.medications.length > 0 || groups.length > 0); // Keep groups even if empty?

      setElderlyGroups(groups);
    } catch (err) {
      console.error("Error fetching medications", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  useEffect(() => {
    // Add AppState listener to refresh data when app returns to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("App returned to foreground, refreshing data...");
        fetchData();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleAddMedication = async () => {
    if (!newMedData.elderlyId || !newMedData.name) {
      Alert.alert("Error", "Please fill in Elderly and Medication Name.");
      return;
    }

    try {
      setLoading(true);

      // 1. Get or Create Medication
      let medId = "";
      const medRes = await tablesDB.listRows<Medication>({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_TABLE_ID,
        queries: [Query.equal("name", newMedData.name)],
      });

      if (medRes.total > 0) {
        medId = medRes.rows[0].$id;
      } else {
        const newMed = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_TABLE_ID,
          rowId: ID.unique(),
          data: {
            name: newMedData.name,
            unit: newMedData.unit,
          },
        });
        medId = newMed.$id;
      }

      // 2. Create ElderlyMedication (The Plan)
      const approxTimes = newMedData.times.map((t) =>
        t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      );

      const emRow = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_TABLE_ID,
        rowId: ID.unique(),
        data: {
          elderly: newMedData.elderlyId,
          medication: medId,
          dosage: parseFloat(newMedData.dosage) || 1,
          frequency: newMedData.frequency,
          is_prn: false,
          approx_times: approxTimes,
          status: "Pending",
          notes: "",
        },
      });

      // 3. Create Reminder
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
        rowId: ID.unique(),
        data: {
          elderly: newMedData.elderlyId,
          elderly_medication: emRow.$id,
          start_date: new Date().toISOString(),
          duration_days: 365,
          active: true,
          reminder_times: approxTimes,
          is_finished: false,
          after_meal: false, // Default to false
        },
      });

      Alert.alert("Success", "Medication added successfully.");
      setAddMedVisible(false);
      fetchData();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to add medication.");
    } finally {
      setLoading(false);
    }
  };

  // Flatten for stats
  const allMeds = elderlyGroups.flatMap((g) => g.medications);

  // Filtering logic (apply to groups)
  const filteredGroups = elderlyGroups
    .filter(
      (group) =>
        selectedElderlyId === "All" || group.elderlyId === selectedElderlyId,
    )
    .map((group) => {
      const filteredMeds = group.medications.filter((med) => {
        const matchesSearch =
          med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.elderlyName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === "all" || med.status === filter;
        return matchesSearch && matchesFilter;
      });
      return { ...group, medications: filteredMeds };
    })
    .filter(
      (g) =>
        g.medications.length > 0 || (searchQuery === "" && filter === "all"),
    );
  // Show empty groups? Maybe not.
  // Fixed: Keep groups if they have meds OR if we are not searching (to show "No meds" under a group if needed, but above filtered removed them)
  // Actually, earlier code filtered out empty groups.
  // If we want to show "No medications scheduled" for an elderly, we should keep the group if it was originally there.

  // Let's refine: If we have groups, we show them. If a filter hides all meds in a group, hide the group.

  const totalCount = allMeds.length;
  const pendingCount = allMeds.filter((m) => m.status === "pending").length;
  const completedCount = allMeds.filter(
    (m) => m.status === "completed" || m.status === "taken",
  ).length;
  const missedCount = allMeds.filter(
    (m) => m.status === "missed" || m.status === "overdue",
  ).length;

  const onConfirmTaking = async (medItem: MedicationItem) => {
    // If it's a generated item (from prescription), we might need to CREATE a log
    // If it's a log item, we update it.
    // For simplicity in this fix, let's assume we update Log if strictly log ID,
    // OR we update Prescription status if that was the old logic?
    // But we want to use logs.

    // This part requires checking if medItem.id is a Log ID or our composite ID.
    // We added `isPrescriptionId` to `MedicationItem`. We need to use `realId`.

    // Check if item has realId (our custom prop) - wait, MedicationItem interface in components/MedicationCard needs this?
    // Or we just cast it.
    const item = medItem as any;

    try {
      if (item.isPrescriptionId) {
        // Find group for elderlyId
        const group = elderlyGroups.find((g) =>
          g.medications.some((m) => m.id === medItem.id),
        );
        const elderlyId = group?.elderlyId;

        // 1. Create Log Entry If Reminder Exists
        let activeLogId = item.logId; // Use existing IF we have it
        let activeReminderId = item.reminderId;

        // Auto-Recover: If link is missing, try to heal it
        if (!activeReminderId && elderlyId && item.isPrescriptionId) {
          try {
            const recoveryRows = await tablesDB.listRows<any>({
              databaseId: DATABASE_ID,
              tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
              queries: [Query.equal("elderly_medication", item.realId)],
            });

            if (recoveryRows.rows.length > 0) {
              activeReminderId = recoveryRows.rows[0].$id;
            } else {
              // Must fetch the original medication plan
              const planRows = await tablesDB.listRows<any>({
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                queries: [Query.equal("$id", item.realId)],
              });

              if (planRows.rows.length > 0) {
                const plan = planRows.rows[0];
                const newRem = await tablesDB.createRow({
                  databaseId: DATABASE_ID,
                  tableId: ELDERLY_MEDICATION_REMINDER_TABLE_ID,
                  rowId: ID.unique(),
                  data: {
                    elderly: elderlyId,
                    elderly_medication: item.realId,
                    start_date: new Date().toISOString(),
                    duration_days: 365,
                    active: true,
                    reminder_times: plan.approx_times || [],
                    is_finished: false,
                    after_meal: false,
                  },
                });
                activeReminderId = newRem.$id;
              }
            }
          } catch (recErr) {
            console.warn("Auto-recovery failed", recErr);
          }
        }

        if (activeReminderId && elderlyId) {
          const now = new Date();

          if (item.logId) {
            // UPDATE existing log (e.g. from Undo which set it to pending)
            await tablesDB.updateRow({
              databaseId: DATABASE_ID,
              tableId: MEDICATION_LOGS_TABLE_ID,
              rowId: item.logId,
              data: {
                status: "taken",
                taken_at: now.toISOString(),
              },
            });
          } else {
            // Create NEW log
            // Calculate Scheduled Time
            const scheduledDate = new Date();

            if (item.time !== "Anytime") {
              const [hours, minutes] = item.time.split(":");
              scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            }

            const newLog = await tablesDB.createRow({
              databaseId: DATABASE_ID,
              tableId: MEDICATION_LOGS_TABLE_ID,
              rowId: ID.unique(),
              data: {
                status: "taken",
                taken_at: now.toISOString(),
                scheduled_at: scheduledDate.toISOString(),
                elderly: elderlyId,
                elderly_medication_reminder: activeReminderId,
              },
            });
            activeLogId = newLog.$id; // Capture the NEW ID
          }
        } else if (item.isPrescriptionId && !activeReminderId) {
          Alert.alert(
            "Configuration Error",
            "Record is missing a linked reminder and auto-repair failed.",
          );
          return; // Stop here to prevent fake completion
        }

        // 2. Update Prescription Last Taken
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          rowId: item.realId,
          data: {
            last_taken: new Date().toISOString(),
          },
        });

        // Update local state with the LOG ID
        setElderlyGroups((prev) =>
          prev.map((group) => ({
            ...group,
            medications: group.medications.map((m) => {
              if (m.id === medItem.id) {
                return {
                  ...m,
                  status: "completed",
                  lastTaken: new Date().toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  logId: activeLogId, // SAVE it so Undo can find it!
                };
              }
              return m;
            }),
          })),
        );
      } else {
        // It's an existing Log
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: MEDICATION_LOGS_TABLE_ID,
          rowId: medItem.id,
          data: {
            status: "taken",
            taken_at: new Date().toISOString(),
          },
        });

        setElderlyGroups((prev) =>
          prev.map((group) => ({
            ...group,
            medications: group.medications.map((m) => {
              if (m.id === medItem.id) {
                return {
                  ...m,
                  status: "completed",
                  lastTaken: new Date().toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                };
              }
              return m;
            }),
          })),
        );
      }

      setDialogVisible(null);
      setNoteText("");
    } catch (err) {
      console.error("Error updating medication", err);
      Alert.alert("Error", "Failed to update status.");
    }
  };

  const onUndoTaking = async (medItem: MedicationItem) => {
    if (!medItem.logId) {
      Alert.alert("Cannot Undo", "History record not found.");
      return;
    }

    try {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        rowId: medItem.logId,
        data: {
          status: "pending",
          taken_at: null,
        },
      });

      setElderlyGroups((prev) =>
        prev.map((group) => ({
          ...group,
          medications: group.medications.map((m) => {
            if (m.id === medItem.id) {
              // Revert status
              return {
                ...m,
                status: "pending",
                lastTaken: "Never", // Or keep previous if known? Hard without history.
                // logId: undefined // KEEP the logId so we can re-update it if user clicks Take again!
              };
            }
            return m;
          }),
        })),
      );

      await fetchData();
    } catch (err) {
      Alert.alert("Error", "Failed to undo.");
    }
  };

  const onRemindLater = (medId: string) => {
    (async () => {
      try {
        // 1. Notification
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission required",
            "Please enable notifications to receive reminders.",
          );
          return;
        }

        // Find the medication in our nested structure
        const med = allMeds.find((m) => m.id === medId);
        const title = "Medication reminder";
        const body = med
          ? `Please check medication for ${med.elderly}: ${med.name}`
          : "Please check medication";

        await Notifications.scheduleNotificationAsync({
          content: { title, body, data: { medId } },
          trigger: { type: "timeInterval", seconds: 5, repeats: false } as any,
        });

        Alert.alert("Reminder set", "Notification will appear in 5 seconds.");
      } catch (e: any) {
        console.warn("Failed to schedule notification", e);
        const isExpoGo =
          Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
        if (isExpoGo) {
          Alert.alert(
            "Not Supported",
            "Notifications are not supported in Expo Go on Android (SDK 53+). Please use a Development Build.",
          );
        } else {
          Alert.alert("Error", "Unable to schedule reminder.");
        }
      }
    })();
  };

  const onMarkProcessed = async (medId: string) => {
    // Simple confirm
    try {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MEDICATION_LOGS_TABLE_ID,
        rowId: medId,
        data: {
          status: "taken",
          taken_at: new Date().toISOString(),
        },
      });

      setElderlyGroups((prev) =>
        prev.map((group) => ({
          ...group,
          medications: group.medications.map((m) => {
            if (m.id === medId) {
              return {
                ...m,
                status: "completed",
                lastTaken: new Date().toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              };
            }
            return m;
          }),
        })),
      );
    } catch (err) {
      Alert.alert("Error", "Failed to update status.");
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.section}>
          <Card>
            <Card.Content>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text variant="headlineSmall" style={styles.statNumber}>
                    {totalCount}
                  </Text>
                  <Text variant="bodyMedium">Total</Text>
                </View>
                <View style={styles.stat}>
                  <Text
                    variant="headlineSmall"
                    style={[styles.statNumber, styles.pending]}
                  >
                    {pendingCount}
                  </Text>
                  <Text variant="bodyMedium">Pending</Text>
                </View>
                <View style={styles.stat}>
                  <Text
                    variant="headlineSmall"
                    style={[styles.statNumber, styles.completed]}
                  >
                    {completedCount}
                  </Text>
                  <Text variant="bodyMedium">Done</Text>
                </View>
                <View style={styles.stat}>
                  <Text
                    variant="headlineSmall"
                    style={[styles.statNumber, styles.overdue]}
                  >
                    {missedCount}
                  </Text>
                  <Text variant="bodyMedium">Missed</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>

        <View style={styles.section}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
              Today&apos;s Plan
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Button
                mode="text"
                onPress={() => setStatusFilterVisible(true)}
                compact
                contentStyle={{ flexDirection: "row-reverse" }}
                icon="chevron-down"
                labelStyle={{ fontSize: 14 }}
              >
                {filter === "all"
                  ? "Status"
                  : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Button>
              <Button
                mode="text"
                onPress={() => setPersonFilterVisible(true)}
                compact
                contentStyle={{ flexDirection: "row-reverse" }}
                icon="chevron-down"
                labelStyle={{ fontSize: 14 }}
              >
                {selectedElderlyId === "All"
                  ? "Everyone"
                  : linkedElderly
                      .find((e) => e.$id === selectedElderlyId)
                      ?.name.split(" ")[0] || "Unknown"}
              </Button>
            </View>
          </View>

          {filteredGroups.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <Text style={{ color: theme.colors.outline }}>
                No medication records found.
              </Text>
            </View>
          ) : (
            filteredGroups.map((group) => (
              <View key={group.elderlyId} style={styles.groupContainer}>
                <View style={styles.groupHeader}>
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: theme.colors.primaryContainer },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.onPrimaryContainer,
                        fontWeight: "bold",
                      }}
                    >
                      {group.elderlyName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text variant="titleMedium" style={styles.groupTitle}>
                    {group.elderlyName}
                  </Text>
                  <IconButton
                    icon={
                      collapsedGroups.has(group.elderlyId)
                        ? "chevron-down"
                        : "chevron-up"
                    }
                    onPress={() => toggleGroup(group.elderlyId)}
                    style={{ marginLeft: "auto", margin: 0 }}
                    size={24}
                  />
                </View>
                <Divider style={{ marginBottom: 12 }} />

                {!collapsedGroups.has(group.elderlyId) &&
                  (group.medications.length === 0 ? (
                    <Text
                      style={{
                        color: theme.colors.outline,
                        fontStyle: "italic",
                        marginBottom: 10,
                      }}
                    >
                      No medications scheduled.
                    </Text>
                  ) : (
                    Object.values(
                      group.medications.reduce(
                        (acc, med) => {
                          const key = `${med.name}_${med.dosage}`;
                          if (!acc[key]) acc[key] = { common: med, slots: [] };
                          acc[key].slots.push(med);
                          return acc;
                        },
                        {} as Record<
                          string,
                          { common: MedicationItem; slots: MedicationItem[] }
                        >,
                      ),
                    ).map((groupItem) => (
                      <Card
                        key={`${groupItem.common.name}_${groupItem.common.dosage}`}
                        style={{
                          marginBottom: 16,
                          backgroundColor: theme.colors.elevation.level1,
                        }}
                      >
                        <Card.Title
                          title={groupItem.common.name}
                          titleStyle={{ fontWeight: "bold" }}
                          subtitle={`${groupItem.common.dosage} • ${groupItem.common.frequency}`}
                          left={(props) => (
                            <Avatar.Icon
                              {...props}
                              icon="pill"
                              size={40}
                              style={{
                                backgroundColor: theme.colors.primaryContainer,
                              }}
                              color={theme.colors.onPrimaryContainer}
                            />
                          )}
                        />
                        <Card.Content>
                          {groupItem.slots
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((slot, index) => (
                              <View
                                key={slot.id}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  paddingVertical: 12,
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
                                  <MaterialCommunityIcons
                                    name="clock-time-four-outline"
                                    size={20}
                                    color={theme.colors.onSurfaceVariant}
                                    style={{ marginRight: 8 }}
                                  />
                                  <Text
                                    variant="bodyLarge"
                                    style={{
                                      fontWeight: "500",
                                      marginRight: 12,
                                      width: 60,
                                    }}
                                  >
                                    {slot.time}
                                  </Text>

                                  <View
                                    style={{
                                      backgroundColor:
                                        slot.status === "completed"
                                          ? theme.colors.primaryContainer
                                          : slot.status === "missed"
                                            ? theme.colors.errorContainer
                                            : theme.colors.surfaceVariant,
                                      paddingHorizontal: 8,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color:
                                          slot.status === "completed"
                                            ? theme.colors.onPrimaryContainer
                                            : slot.status === "missed"
                                              ? theme.colors.onErrorContainer
                                              : theme.colors.onSurfaceVariant,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      }}
                                    >
                                      {slot.status === "completed"
                                        ? "Taken"
                                        : slot.status === "pending"
                                          ? "Pending"
                                          : slot.status
                                              .charAt(0)
                                              .toUpperCase() +
                                            slot.status.slice(1)}
                                    </Text>
                                  </View>
                                </View>

                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                  }}
                                >
                                  {slot.status === "pending" ||
                                  slot.status === "missed" ? (
                                    <>
                                      <IconButton
                                        icon="bell-outline"
                                        size={20}
                                        onPress={() => onRemindLater(slot.id)}
                                        style={{ margin: 0 }}
                                      />
                                      <Button
                                        mode="contained"
                                        compact
                                        onPress={() => {
                                          setDialogVisible(slot);
                                          setNoteText(slot.notes || "");
                                        }}
                                        style={{ marginLeft: 4 }}
                                      >
                                        Take
                                      </Button>
                                    </>
                                  ) : (
                                    slot.status === "completed" && (
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                        }}
                                      >
                                        <MaterialCommunityIcons
                                          name="check-circle"
                                          size={16}
                                          color={theme.colors.primary}
                                          style={{ marginRight: 4 }}
                                        />
                                        <Text
                                          variant="bodySmall"
                                          style={{
                                            color: theme.colors.outline,
                                            marginRight: 8,
                                          }}
                                        >
                                          {slot.takenAtIso
                                            ? new Date(
                                                slot.takenAtIso,
                                              ).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })
                                            : slot.lastTaken}
                                        </Text>
                                        <Button
                                          icon="undo"
                                          compact
                                          mode="text"
                                          onPress={() => onUndoTaking(slot)}
                                          labelStyle={{ fontSize: 12 }}
                                        >
                                          Undo
                                        </Button>
                                      </View>
                                    )
                                  )}
                                </View>
                              </View>
                            ))}
                        </Card.Content>
                      </Card>
                    ))
                  ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={personFilterVisible}
          onDismiss={() => setPersonFilterVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>Select Elderly</Dialog.Title>
          <Dialog.Content style={{ paddingBottom: 0 }}>
            <Searchbar
              placeholder="Search"
              onChangeText={setFilterSearchQuery}
              value={filterSearchQuery}
              style={{
                backgroundColor: theme.colors.surfaceVariant,
                height: 40,
                marginBottom: 10,
              }}
              inputStyle={{ minHeight: 0 }}
            />
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[
                  styles.selectionRow,
                  {
                    backgroundColor:
                      selectedElderlyId === "All"
                        ? theme.colors.secondaryContainer
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  setSelectedElderlyId("All");
                  setPersonFilterVisible(false);
                }}
              >
                <Avatar.Icon
                  size={40}
                  icon="account-group"
                  style={{
                    marginRight: 16,
                    backgroundColor: theme.colors.secondary,
                  }}
                />
                <Text variant="titleMedium">Everyone</Text>
                {selectedElderlyId === "All" && (
                  <MaterialCommunityIcons
                    name="check"
                    size={24}
                    color={theme.colors.onSecondaryContainer}
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </TouchableOpacity>
              {linkedElderly
                .filter((e) =>
                  e.name
                    .toLowerCase()
                    .includes(filterSearchQuery.toLowerCase()),
                )
                .map((item) => (
                  <TouchableOpacity
                    key={item.$id}
                    style={[
                      styles.selectionRow,
                      {
                        backgroundColor:
                          selectedElderlyId === item.$id
                            ? theme.colors.secondaryContainer
                            : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setSelectedElderlyId(item.$id);
                      setPersonFilterVisible(false);
                    }}
                  >
                    <Avatar.Text
                      size={40}
                      label={item.name.substring(0, 2)}
                      style={{
                        marginRight: 16,
                        backgroundColor: theme.colors.secondary,
                      }}
                    />
                    <Text variant="titleMedium">{item.name}</Text>
                    {selectedElderlyId === item.$id && (
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={theme.colors.onSecondaryContainer}
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPersonFilterVisible(false)}>
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={statusFilterVisible}
          onDismiss={() => setStatusFilterVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>Filter Status</Dialog.Title>
          <Dialog.Content>
            {["all", "pending", "completed", "missed"].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.selectionRow,
                  {
                    backgroundColor:
                      filter === status
                        ? theme.colors.secondaryContainer
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  setFilter(status);
                  setStatusFilterVisible(false);
                }}
              >
                <MaterialCommunityIcons
                  name={
                    status === "all"
                      ? "filter-variant"
                      : status === "pending"
                        ? "clock-outline"
                        : status === "completed"
                          ? "check-circle-outline"
                          : "alert-circle-outline"
                  }
                  size={24}
                  color={theme.colors.onSurface}
                  style={{ marginRight: 16 }}
                />
                <Text variant="titleMedium">
                  {status === "all"
                    ? "All Status"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
                {filter === status && (
                  <MaterialCommunityIcons
                    name="check"
                    size={24}
                    color={theme.colors.onSecondaryContainer}
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </TouchableOpacity>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setStatusFilterVisible(false)}>
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={dialogVisible !== null}
          onDismiss={() => setDialogVisible(null)}
        >
          <Dialog.Title>Confirm Medication</Dialog.Title>
          <Dialog.Content>
            <Text>
              Confirm {dialogVisible?.name} for {dialogVisible?.elderly}?
            </Text>
            {/* Note: Medication Logs table doesn't have notes column in standard schema, but we can't save it if it doesn't exist. 
                            Assuming we just confirm status. */}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setDialogVisible(null);
                setNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (dialogVisible) onConfirmTaking(dialogVisible);
              }}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={addMedVisible}
          onDismiss={() => {
            setAddMedVisible(false);
            setMedSelectionMode("form");
          }}
          style={{ maxHeight: "80%" }}
        >
          {medSelectionMode === "form" ? (
            <View>
              <Dialog.Title>Add New Medication</Dialog.Title>
              <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                  <TouchableOpacity
                    onPress={() => setMedSelectionMode("elderly")}
                  >
                    <TextInput
                      label="Select Elderly"
                      value={
                        newMedData.elderlyName ||
                        linkedElderly.find(
                          (e) => e.$id === newMedData.elderlyId,
                        )?.name ||
                        ""
                      }
                      editable={false}
                      right={
                        <TextInput.Icon
                          icon="chevron-right"
                          onPress={() => setMedSelectionMode("elderly")}
                        />
                      }
                      mode="outlined"
                      style={{ marginBottom: 10 }}
                    />
                  </TouchableOpacity>

                  <TextInput
                    label="Medication Name"
                    value={newMedData.name}
                    onChangeText={(val) =>
                      setNewMedData((prev) => ({ ...prev, name: val }))
                    }
                    style={{ marginBottom: 10 }}
                    mode="outlined"
                  />
                  <View
                    style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}
                  >
                    <TextInput
                      label="Dosage"
                      value={newMedData.dosage}
                      keyboardType="numeric"
                      onChangeText={(val) =>
                        setNewMedData((prev) => ({ ...prev, dosage: val }))
                      }
                      style={{ flex: 1 }}
                      mode="outlined"
                    />
                    <TextInput
                      label="Unit"
                      value={newMedData.unit}
                      onChangeText={(val) =>
                        setNewMedData((prev) => ({ ...prev, unit: val }))
                      }
                      style={{ flex: 1 }}
                      mode="outlined"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => setMedSelectionMode("frequency")}
                  >
                    <TextInput
                      label="Frequency"
                      value={newMedData.frequency}
                      editable={false}
                      right={
                        <TextInput.Icon
                          icon="chevron-right"
                          onPress={() => setMedSelectionMode("frequency")}
                        />
                      }
                      mode="outlined"
                      style={{ marginBottom: 10 }}
                    />
                  </TouchableOpacity>

                  <Text style={{ marginBottom: 5 }}>Reminder Times:</Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {newMedData.times.map((t, idx) => (
                      <Chip
                        key={idx}
                        icon="clock"
                        onClose={() =>
                          setNewMedData((prev) => ({
                            ...prev,
                            times: prev.times.filter((_, i) => i !== idx),
                          }))
                        }
                        onPress={() => {
                          setEditingTimeIndex(idx);
                          setShowTimePicker(true);
                        }}
                      >
                        {t.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Chip>
                    ))}
                    <Chip
                      icon="plus"
                      onPress={() => {
                        setEditingTimeIndex(-1);
                        setShowTimePicker(true);
                      }}
                    >
                      Add Time
                    </Chip>
                  </View>
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={() => setAddMedVisible(false)}>Cancel</Button>
                <Button onPress={handleAddMedication}>Save</Button>
              </Dialog.Actions>
            </View>
          ) : (
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                }}
              >
                <IconButton
                  icon="arrow-left"
                  onPress={() => setMedSelectionMode("form")}
                />
                <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                  {medSelectionMode === "elderly"
                    ? "Select Elderly"
                    : "Select Frequency"}
                </Text>
              </View>
              <Divider />
              {medSelectionMode === "elderly" && (
                <View style={{ padding: 10 }}>
                  <Searchbar
                    placeholder="Search"
                    onChangeText={setMedFormSearchQuery}
                    value={medFormSearchQuery}
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      height: 40,
                    }}
                    inputStyle={{ minHeight: 0 }}
                  />
                </View>
              )}
              <Dialog.ScrollArea>
                <ScrollView style={{ maxHeight: 300 }}>
                  {medSelectionMode === "elderly"
                    ? linkedElderly
                        .filter((e) =>
                          e.name
                            .toLowerCase()
                            .includes(medFormSearchQuery.toLowerCase()),
                        )
                        .map((item) => (
                          <TouchableOpacity
                            key={item.$id}
                            style={[
                              styles.selectionRow,
                              {
                                backgroundColor:
                                  newMedData.elderlyId === item.$id
                                    ? theme.colors.secondaryContainer
                                    : "transparent",
                              },
                            ]}
                            onPress={() => {
                              setNewMedData((prev) => ({
                                ...prev,
                                elderlyId: item.$id,
                                elderlyName: item.name,
                              }));
                              setMedSelectionMode("form");
                            }}
                          >
                            <Avatar.Text
                              size={40}
                              label={item.name.substring(0, 2)}
                              style={{
                                marginRight: 16,
                                backgroundColor: theme.colors.secondary,
                              }}
                            />
                            <Text variant="titleMedium">{item.name}</Text>
                            {newMedData.elderlyId === item.$id && (
                              <MaterialCommunityIcons
                                name="check"
                                size={24}
                                color={theme.colors.onSecondaryContainer}
                                style={{ marginLeft: "auto" }}
                              />
                            )}
                          </TouchableOpacity>
                        ))
                    : ["Daily", "Twice a day", "3 times/day", "Weekly"].map(
                        (f) => (
                          <TouchableOpacity
                            key={f}
                            style={[
                              styles.selectionRow,
                              {
                                backgroundColor:
                                  newMedData.frequency === f
                                    ? theme.colors.secondaryContainer
                                    : "transparent",
                              },
                            ]}
                            onPress={() => {
                              setNewMedData((prev) => ({
                                ...prev,
                                frequency: f,
                              }));
                              setMedSelectionMode("form");
                            }}
                          >
                            <Text variant="titleMedium">{f}</Text>
                            {newMedData.frequency === f && (
                              <MaterialCommunityIcons
                                name="check"
                                size={24}
                                color={theme.colors.onSecondaryContainer}
                                style={{ marginLeft: "auto" }}
                              />
                            )}
                          </TouchableOpacity>
                        ),
                      )}
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={() => setMedSelectionMode("form")}>
                  Back
                </Button>
              </Dialog.Actions>
            </View>
          )}
        </Dialog>
      </Portal>

      {showTimePicker && (
        <DateTimePicker
          value={
            editingTimeIndex !== null && editingTimeIndex >= 0
              ? newMedData.times[editingTimeIndex]
              : new Date()
          }
          mode="time"
          display="default"
          onChange={(event, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) {
              if (editingTimeIndex === -1) {
                // Add new
                setNewMedData((prev) => ({
                  ...prev,
                  times: [...prev.times, selectedDate],
                }));
              } else if (editingTimeIndex !== null) {
                // Update existing
                const newTimes = [...newMedData.times];
                newTimes[editingTimeIndex] = selectedDate;
                setNewMedData((prev) => ({ ...prev, times: newTimes }));
              }
            }
            setEditingTimeIndex(null);
          }}
        />
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setAddMedVisible(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
  },
  searchbar: {
    marginBottom: 12,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontWeight: "bold",
    color: "#2196F3",
  },
  pending: {
    color: "#FF9800",
  },
  completed: {
    color: "#4CAF50",
  },
  overdue: {
    color: "#F44336",
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  groupTitle: {
    fontWeight: "bold",
    marginLeft: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogInput: {
    marginTop: 12,
  },
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
