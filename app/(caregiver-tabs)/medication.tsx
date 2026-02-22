import { MedicationItem } from "@/components/MedicationCard";
import { useAuth } from "@/lib/auth-context";
import {
  addMedication,
  confirmMedicationTaking,
  ElderlyGroup,
  fetchCaregiverMedicationData,
  markMedicationProcessed,
  undoMedicationTaking,
} from "@/lib/medication";
import { Elderly } from "@/types/appwrite";
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

// Start notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function MedicationManagement() {
  const theme = useTheme();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmingMedItem, setConfirmingMedItem] = useState<MedicationItem | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");
  const [elderlyGroups, setElderlyGroups] = useState<ElderlyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // New Filter State
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [elderlyFilterVisible, setElderlyFilterVisible] = useState(false);
  const [selectedElderlyId, setSelectedElderlyId] = useState<string>("All");
  const [statusFilterVisible, setStatusFilterVisible] = useState(false);
  const [elderlySearchQuery, setElderlySearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [undoVisible, setUndoVisible] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Add Medication State
  const [addMedDialogVisible, setAddMedDialogVisible] = useState(false);
  const [addDialogStep, setAddDialogStep] = useState<
    "form" | "elderly" | "frequency"
  >("form");
  const [addMedElderlySearch, setAddMedElderlySearch] = useState("");
  const [medicationFormData, setMedicationFormData] = useState({
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

  // Medication card expand/collapse state
  const [medCardExpandState, setMedCardExpandState] = useState<Record<string, boolean>>({});

  const toggleMedCard = (cardKey: string, defaultExpanded: boolean) => {
    setMedCardExpandState((prev) => ({
      ...prev,
      [cardKey]: prev[cardKey] !== undefined ? !prev[cardKey] : !defaultExpanded,
    }));
  };

  const isMedCardExpanded = (cardKey: string, slotsCount: number): boolean => {
    if (cardKey in medCardExpandState) return medCardExpandState[cardKey];
    return slotsCount <= 1; // Default: expanded for single slot, collapsed for ≥2
  };

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
      const result = await fetchCaregiverMedicationData(user.$id);
      setLinkedElderly(result.linkedElderly);
      setElderlyGroups(result.elderlyGroups);
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
    if (!medicationFormData.elderlyId || !medicationFormData.name) {
      Alert.alert("Error", "Please fill in Elderly and Medication Name.");
      return;
    }

    try {
      setLoading(true);
      await addMedication({
        elderlyId: medicationFormData.elderlyId,
        name: medicationFormData.name,
        unit: medicationFormData.unit,
        dosage: medicationFormData.dosage,
        frequency: medicationFormData.frequency,
        times: medicationFormData.times,
      });
      Alert.alert("Success", "Medication added successfully.");
      setAddMedDialogVisible(false);
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
        const matchesFilter = statusFilter === "all" || med.status === statusFilter;
        return matchesSearch && matchesFilter;
      });
      return { ...group, medications: filteredMeds };
    })
    .filter(
      (g) =>
        g.medications.length > 0 || (searchQuery === "" && statusFilter === "all"),
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
    try {
      const group = elderlyGroups.find((g) =>
        g.medications.some((m) => m.id === medItem.id),
      );
      const elderlyId = group?.elderlyId;

      const result = await confirmMedicationTaking({
        medItem,
        elderlyId,
        elderlyGroups,
      });

      // Update local state
      setElderlyGroups((prev) =>
        prev.map((g) => ({
          ...g,
          medications: g.medications.map((m) => {
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
                logId: result.logId ?? m.logId,
              };
            }
            return m;
          }),
        })),
      );

      setConfirmingMedItem(null);
      setNoteText("");
    } catch (err: any) {
      console.error("Error updating medication", err);
      if (err?.message?.includes("auto-repair")) {
        Alert.alert("Configuration Error", err.message);
      } else {
        Alert.alert("Error", "Failed to update status.");
      }
    }
  };

  const onUndoTaking = async (medItem: MedicationItem) => {
    if (!medItem.logId) {
      Alert.alert("Cannot Undo", "History record not found.");
      return;
    }

    try {
      await undoMedicationTaking(medItem.logId);

      setElderlyGroups((prev) =>
        prev.map((group) => ({
          ...group,
          medications: group.medications.map((m) => {
            if (m.id === medItem.id) {
              return {
                ...m,
                status: "pending",
                lastTaken: "Never",
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
    try {
      await markMedicationProcessed(medId);

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
                {statusFilter === "all"
                  ? "Status"
                  : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              </Button>
              <Button
                mode="text"
                onPress={() => setElderlyFilterVisible(true)}
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
                <Divider style={{ marginBottom: 8 }} />

                {/* Elderly-level timeline summary */}
                {group.medications.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12 }}
                  >
                    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2 }}>
                      {[...group.medications]
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map((slot) => {
                          const bgColor =
                            slot.status === 'completed'
                              ? theme.colors.primaryContainer
                              : slot.status === 'missed'
                                ? theme.colors.errorContainer
                                : theme.colors.surfaceVariant;
                          const textColor =
                            slot.status === 'completed'
                              ? theme.colors.onPrimaryContainer
                              : slot.status === 'missed'
                                ? theme.colors.onErrorContainer
                                : theme.colors.onSurfaceVariant;
                          const iconName =
                            slot.status === 'completed'
                              ? 'check-circle'
                              : slot.status === 'missed'
                                ? 'alert-circle'
                                : 'clock-outline';
                          return (
                            <View
                              key={slot.id}
                              style={{
                                backgroundColor: bgColor,
                                borderRadius: 6,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <MaterialCommunityIcons
                                name={iconName as any}
                                size={12}
                                color={textColor}
                              />
                              <Text style={{ fontSize: 11, color: textColor, fontWeight: '600' }}>
                                {slot.time}
                              </Text>
                              <Text style={{ fontSize: 10, color: textColor, opacity: 0.8 }}>
                                {slot.name.length > 6 ? slot.name.substring(0, 6) + '…' : slot.name}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  </ScrollView>
                )}

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
                    ).map((groupItem) => {
                      const sortedSlots = [...groupItem.slots].sort((a, b) => a.time.localeCompare(b.time));
                      const totalSlots = sortedSlots.length;
                      const slotsCompleted = sortedSlots.filter(s => s.status === 'completed').length;
                      const slotsMissed = sortedSlots.filter(s => s.status === 'missed').length;
                      const nextPendingSlot = sortedSlots.find(s => s.status === 'pending');
                      const allSlotsDone = slotsCompleted === totalSlots;
                      const medCardKey = `${group.elderlyId}_${groupItem.common.name}_${groupItem.common.dosage}`;
                      const isExpanded = isMedCardExpanded(medCardKey, totalSlots);

                      let summaryText = '';
                      let summaryIcon = 'information-outline';
                      if (allSlotsDone) {
                        if (totalSlots === 1) {
                          summaryText = `${sortedSlots[0].time} · Taken`;
                        } else {
                          summaryText = 'All taken';
                        }
                        summaryIcon = 'check-circle';
                      } else if (nextPendingSlot) {
                        if (totalSlots === 1) {
                          summaryText = `${nextPendingSlot.time} · Pending`;
                        } else {
                          summaryText = `Next: ${nextPendingSlot.time}`;
                          if (slotsMissed > 0) {
                            summaryText += ` · ${slotsMissed} missed`;
                          }
                        }
                        summaryIcon = 'clock-outline';
                      } else if (slotsMissed > 0) {
                        if (totalSlots === 1) {
                          summaryText = `${sortedSlots[0].time} · Missed`;
                        } else {
                          summaryText = `${slotsMissed} missed`;
                        }
                        summaryIcon = 'alert-circle-outline';
                      }

                      return (
                      <Card
                        key={medCardKey}
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
                          right={() => (
                            <IconButton
                              icon={isExpanded ? "chevron-up" : "chevron-down"}
                              onPress={() => toggleMedCard(medCardKey, totalSlots <= 1)}
                              size={24}
                            />
                          )}
                        />
                        <Card.Content>
                          {/* Summary bar */}
                          {!isExpanded && (
                            <TouchableOpacity
                              onPress={() => toggleMedCard(medCardKey, totalSlots <= 1)}
                              activeOpacity={0.7}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  backgroundColor: allSlotsDone
                                    ? theme.colors.primaryContainer
                                    : slotsMissed > 0 && !nextPendingSlot
                                      ? theme.colors.errorContainer
                                      : theme.colors.surfaceVariant,
                                  borderRadius: 8,
                                  marginBottom: isExpanded ? 12 : 0,
                                }}
                              >
                                {/* Progress bar */}
                                <View
                                  style={{
                                    width: 48,
                                    height: 6,
                                    backgroundColor: 'rgba(0,0,0,0.1)',
                                    borderRadius: 3,
                                    marginRight: 10,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <View
                                    style={{
                                      width: `${totalSlots > 0 ? (slotsCompleted / totalSlots) * 100 : 0}%`,
                                      height: '100%',
                                      backgroundColor: allSlotsDone ? '#4CAF50' : theme.colors.primary,
                                      borderRadius: 3,
                                    }}
                                  />
                                </View>
                                <Text
                                  variant="labelMedium"
                                  style={{
                                    fontWeight: 'bold',
                                    marginRight: 12,
                                    color: allSlotsDone
                                      ? theme.colors.onPrimaryContainer
                                      : slotsMissed > 0 && !nextPendingSlot
                                        ? theme.colors.onErrorContainer
                                        : theme.colors.onSurfaceVariant,
                                  }}
                                >
                                  {slotsCompleted}/{totalSlots}
                                </Text>
                                <MaterialCommunityIcons
                                  name={summaryIcon as any}
                                  size={16}
                                  color={
                                    allSlotsDone
                                      ? '#4CAF50'
                                      : slotsMissed > 0 && !nextPendingSlot
                                        ? theme.colors.error
                                        : theme.colors.onSurfaceVariant
                                  }
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  variant="bodySmall"
                                  style={{
                                    color: allSlotsDone
                                      ? '#4CAF50'
                                      : slotsMissed > 0 && !nextPendingSlot
                                        ? theme.colors.error
                                        : theme.colors.onSurfaceVariant,
                                    flex: 1,
                                  }}
                                >
                                  {summaryText}
                                </Text>
                                {!isExpanded && (
                                  <MaterialCommunityIcons
                                    name="chevron-down"
                                    size={18}
                                    color={theme.colors.outline}
                                  />
                                )}
                              </View>
                            </TouchableOpacity>
                          )}

                          {/* Time slots — visible when expanded */}
                          {isExpanded &&
                            sortedSlots.map((slot, index) => (
                              <View
                                key={slot.id}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  paddingVertical: 12,
                                  borderTopWidth: index > 0 || totalSlots > 1 ? 1 : 0,
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
                                          setConfirmingMedItem(slot);
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
                      );
                    })
                  ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={elderlyFilterVisible}
          onDismiss={() => setElderlyFilterVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>Select Elderly</Dialog.Title>
          <Dialog.Content style={{ paddingBottom: 0 }}>
            <Searchbar
              placeholder="Search"
              onChangeText={setElderlySearchQuery}
              value={elderlySearchQuery}
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
                  setElderlyFilterVisible(false);
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
                    .includes(elderlySearchQuery.toLowerCase()),
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
                      setElderlyFilterVisible(false);
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
            <Button onPress={() => setElderlyFilterVisible(false)}>
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
                      statusFilter === status
                        ? theme.colors.secondaryContainer
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  setStatusFilter(status);
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
                {statusFilter === status && (
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
          visible={confirmingMedItem !== null}
          onDismiss={() => setConfirmingMedItem(null)}
        >
          <Dialog.Title>Confirm Medication</Dialog.Title>
          <Dialog.Content>
            <Text>
              Confirm {confirmingMedItem?.name} for {confirmingMedItem?.elderly}?
            </Text>
            {/* Note: Medication Logs table doesn't have notes column in standard schema, but we can't save it if it doesn't exist. 
                            Assuming we just confirm status. */}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setConfirmingMedItem(null);
                setNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (confirmingMedItem) onConfirmTaking(confirmingMedItem);
              }}
            >
              Confirm
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={addMedDialogVisible}
          onDismiss={() => {
            setAddMedDialogVisible(false);
            setAddDialogStep("form");
          }}
          style={{ maxHeight: "80%" }}
        >
          {addDialogStep === "form" ? (
            <View>
              <Dialog.Title>Add New Medication</Dialog.Title>
              <Dialog.ScrollArea>
                <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                  <TouchableOpacity
                    onPress={() => setAddDialogStep("elderly")}
                  >
                    <TextInput
                      label="Select Elderly"
                      value={
                        medicationFormData.elderlyName ||
                        linkedElderly.find(
                          (e) => e.$id === medicationFormData.elderlyId,
                        )?.name ||
                        ""
                      }
                      editable={false}
                      right={
                        <TextInput.Icon
                          icon="chevron-right"
                          onPress={() => setAddDialogStep("elderly")}
                        />
                      }
                      mode="outlined"
                      style={{ marginBottom: 10 }}
                    />
                  </TouchableOpacity>

                  <TextInput
                    label="Medication Name"
                    value={medicationFormData.name}
                    onChangeText={(val) =>
                      setMedicationFormData((prev) => ({ ...prev, name: val }))
                    }
                    style={{ marginBottom: 10 }}
                    mode="outlined"
                  />
                  <View
                    style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}
                  >
                    <TextInput
                      label="Dosage"
                      value={medicationFormData.dosage}
                      keyboardType="numeric"
                      onChangeText={(val) =>
                        setMedicationFormData((prev) => ({ ...prev, dosage: val }))
                      }
                      style={{ flex: 1 }}
                      mode="outlined"
                    />
                    <TextInput
                      label="Unit"
                      value={medicationFormData.unit}
                      onChangeText={(val) =>
                        setMedicationFormData((prev) => ({ ...prev, unit: val }))
                      }
                      style={{ flex: 1 }}
                      mode="outlined"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => setAddDialogStep("frequency")}
                  >
                    <TextInput
                      label="Frequency"
                      value={medicationFormData.frequency}
                      editable={false}
                      right={
                        <TextInput.Icon
                          icon="chevron-right"
                          onPress={() => setAddDialogStep("frequency")}
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
                    {medicationFormData.times.map((t, idx) => (
                      <Chip
                        key={idx}
                        icon="clock"
                        onClose={() =>
                          setMedicationFormData((prev) => ({
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
                <Button onPress={() => setAddMedDialogVisible(false)}>Cancel</Button>
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
                  onPress={() => setAddDialogStep("form")}
                />
                <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                  {addDialogStep === "elderly"
                    ? "Select Elderly"
                    : "Select Frequency"}
                </Text>
              </View>
              <Divider />
              {addDialogStep === "elderly" && (
                <View style={{ padding: 10 }}>
                  <Searchbar
                    placeholder="Search"
                    onChangeText={setAddMedElderlySearch}
                    value={addMedElderlySearch}
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
                  {addDialogStep === "elderly"
                    ? linkedElderly
                        .filter((e) =>
                          e.name
                            .toLowerCase()
                            .includes(addMedElderlySearch.toLowerCase()),
                        )
                        .map((item) => (
                          <TouchableOpacity
                            key={item.$id}
                            style={[
                              styles.selectionRow,
                              {
                                backgroundColor:
                                  medicationFormData.elderlyId === item.$id
                                    ? theme.colors.secondaryContainer
                                    : "transparent",
                              },
                            ]}
                            onPress={() => {
                              setMedicationFormData((prev) => ({
                                ...prev,
                                elderlyId: item.$id,
                                elderlyName: item.name,
                              }));
                              setAddDialogStep("form");
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
                            {medicationFormData.elderlyId === item.$id && (
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
                                  medicationFormData.frequency === f
                                    ? theme.colors.secondaryContainer
                                    : "transparent",
                              },
                            ]}
                            onPress={() => {
                              setMedicationFormData((prev) => ({
                                ...prev,
                                frequency: f,
                              }));
                              setAddDialogStep("form");
                            }}
                          >
                            <Text variant="titleMedium">{f}</Text>
                            {medicationFormData.frequency === f && (
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
                <Button onPress={() => setAddDialogStep("form")}>
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
              ? medicationFormData.times[editingTimeIndex]
              : new Date()
          }
          mode="time"
          display="default"
          onChange={(event, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) {
              if (editingTimeIndex === -1) {
                // Add new
                setMedicationFormData((prev) => ({
                  ...prev,
                  times: [...prev.times, selectedDate],
                }));
              } else if (editingTimeIndex !== null) {
                // Update existing
                const newTimes = [...medicationFormData.times];
                newTimes[editingTimeIndex] = selectedDate;
                setMedicationFormData((prev) => ({ ...prev, times: newTimes }));
              }
            }
            setEditingTimeIndex(null);
          }}
        />
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setAddMedDialogVisible(true)}
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
