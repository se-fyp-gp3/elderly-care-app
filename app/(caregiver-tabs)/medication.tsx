import { AddMedicationDialog, MedicationFormData } from "@/components/AddMedicationDialog";
import ElderlyGroupSummary from "@/components/ElderlyGroupSummary";
import {
  ConfirmMedicationDialog,
  DayFilter,
  ElderlyFilterDialog,
  StatusFilterDialog,
} from "@/components/MedFilterDialogs";
import { MedicationItem } from "@/components/MedicationCard";
import MedicationDetailsModal, { MedicationDetailField } from "@/components/MedicationDetailsModal";
import MedStatsCard from "@/components/MedStatsCard";
import TimeSlotCard from "@/components/TimeSlotCard";
import { useAuth } from "@/lib/auth-context";
import {
  addMedication,
  confirmMedicationTaking,
  ElderlyGroup,
  fetchCaregiverMedicationData,
  fetchCaregiverPendingCancelReminders,
  fetchCaregiverUpcomingMedicationData,
  markMedicationProcessed,
  PendingCancelReminder,
  undoMedicationTaking,
} from "@/lib/medication";
import { Elderly } from "@/types/appwrite";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Divider,
  FAB,
  IconButton,
  Portal,
  Text,
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
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
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
  const [dayFilter, setDayFilter] = useState<DayFilter>("today");
  const [undoVisible, setUndoVisible] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [selectedMedicationDetails, setSelectedMedicationDetails] = useState<{
    title: string;
    subtitle?: string;
    fields: MedicationDetailField[];
  } | null>(null);

  // Pending cancel reminders (active=false, is_finished=false)
  const [pendingCancels, setPendingCancels] = useState<PendingCancelReminder[]>([]);

  // Add Medication State
  const [addMedDialogVisible, setAddMedDialogVisible] = useState(false);
  const [addDialogStep, setAddDialogStep] = useState<
    "form" | "elderly" | "frequency"
  >("form");
  const [addMedElderlySearch, setAddMedElderlySearch] = useState("");
  const [medicationFormData, setMedicationFormData] = useState<MedicationFormData>({
    elderlyId: "",
    elderlyName: "",
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
      let result;
      if (dayFilter === "all") {
        result = await fetchCaregiverUpcomingMedicationData(user.$id, 7);
      } else {
        let targetDate: Date | undefined;
        if (dayFilter === "yesterday") {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          targetDate = d;
        } else if (dayFilter === "tomorrow") {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          targetDate = d;
        }
        result = await fetchCaregiverMedicationData(user.$id, targetDate);
      }
      setLinkedElderly(result.linkedElderly);
      setElderlyGroups(result.elderlyGroups);

      const cancels = await fetchCaregiverPendingCancelReminders(user.$id);
      setPendingCancels(cancels);
    } catch (err) {
      console.error("Error fetching medications", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, dayFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  // Re-fetch when toggling between today/yesterday/tomorrow/all
  useEffect(() => {
    fetchData();
  }, [dayFilter]);

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
      Alert.alert(t('common.error'), t('medication.fillElderlyAndName'));
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
      Alert.alert(t('common.success'), t('medication.medAddedSuccess'));
      setAddMedDialogVisible(false);
      fetchData();
    } catch (err) {
      console.error(err);
      Alert.alert(t('common.error'), t('medication.failedToAddMed'));
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

  // Flatten currently-filtered meds for stats (follows elderly + status + search filters)
  const statsMeds = filteredGroups.flatMap((g) => g.medications);

  const totalCount = statsMeds.length;
  const pendingCount = statsMeds.filter((m) => m.status === "pending").length;
  const completedCount = statsMeds.filter(
    (m) => m.status === "completed" || m.status === "taken",
  ).length;
  const missedCount = statsMeds.filter(
    (m) => m.status === "missed" || m.status === "overdue",
  ).length;
  const baseStatusLabel =
    statusFilter === "all"
      ? t('medication.filterStatus')
      : statusFilter === "pending"
        ? t('common.pending')
        : statusFilter === "completed"
          ? t('common.completed')
          : t('common.missed');

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
        Alert.alert(t('medication.configError'), err.message);
      } else {
        Alert.alert(t('common.error'), t('medication.failedToUpdateStatus'));
      }
    }
  };

  const onUndoTaking = async (medItem: MedicationItem) => {
    if (!medItem.logId) {
      Alert.alert(t('medication.undo'), t('medication.failedToUndo'));
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
                lastTaken: t('common.never'),
              };
            }
            return m;
          }),
        })),
      );

      await fetchData();
    } catch (err) {
      Alert.alert(t('common.error'), t('medication.failedToUndo'));
    }
  };

  const onRemindLater = (medId: string) => {
    (async () => {
      try {
        // 1. Notification
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t('medication.permissionRequired'),
            t('medication.enableNotifications'),
          );
          return;
        }

        // Find the medication in our nested structure
        const med = allMeds.find((m) => m.id === medId);
        const title = t('medication.medReminderNotif');
        const body = med
          ? t('medication.checkMedFor', { name: med.elderly }) + `: ${med.name}`
          : t('medication.medReminderNotif');

        await Notifications.scheduleNotificationAsync({
          content: { title, body, data: { medId } },
          trigger: { type: "timeInterval", seconds: 5, repeats: false } as any,
        });

        Alert.alert(t('medication.reminderSet'), t('medication.notifIn5Sec'));
      } catch (e: any) {
        console.warn("Failed to schedule notification", e);
        const isExpoGo =
          Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
        if (isExpoGo) {
          Alert.alert(
            t('medication.notSupported'),
            t('medication.notSupportedDesc'),
          );
        } else {
          Alert.alert(t('common.error'), t('medication.unableToSchedule'));
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
      Alert.alert(t('common.error'), t('medication.failedToUpdateStatus'));
    }
  };

  const openMedicationDetails = useCallback((med: MedicationItem) => {
    const statusLabel =
      med.status === "completed"
        ? t('common.completed')
        : med.status === "missed"
          ? t('common.missed')
          : t('common.pending');

    setSelectedMedicationDetails({
      title: med.name,
      subtitle: `${med.elderly} · ${statusLabel}`,
      fields: [
        { label: "Dose", value: med.dosage },
        { label: "Frequency", value: med.frequency },
        { label: "Time", value: med.time },
        { label: "Last taken", value: med.lastTaken },
        { label: "Notes", value: med.notes },
      ],
    });
  }, [t]);

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
          <MedStatsCard
            totalCount={totalCount}
            pendingCount={pendingCount}
            completedCount={completedCount}
            missedCount={missedCount}
          />
        </View>

        {pendingCancels.length > 0 && (
          <View style={styles.section}>
            <Button
              mode="contained-tonal"
              icon="alert-circle-outline"
              contentStyle={styles.cancelQuickActionContent}
              labelStyle={styles.cancelQuickActionLabel}
              onPress={() => router.push("/cancelled-medications" as any)}
            >
              {`Cancelled by elderly: ${pendingCancels.length} waiting for confirmation`}
            </Button>
          </View>
        )}

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
              {dayFilter === "yesterday"
                ? t('medication.yesterdaysPlan')
                : dayFilter === "tomorrow"
                  ? t('medication.tomorrowsPlan')
                  : dayFilter === "all"
                    ? t('medication.allPlans')
                    : t('medication.todaysPlan')}
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
                {baseStatusLabel}
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
                  ? t('medication.everyone')
                  : linkedElderly
                      .find((e) => e.$id === selectedElderlyId)
                      ?.name.split(" ")[0] || t('common.unknown')}
              </Button>
            </View>
          </View>

          {filteredGroups.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <Text style={{ color: theme.colors.outline }}>
                {t('medication.noMedRecords')}
              </Text>
            </View>
          ) : (
            filteredGroups.map((group) => (
              <View key={group.elderlyId} style={[styles.groupContainer, { borderColor: theme.colors.outlineVariant }]}>
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

                {/* Elderly-level compact summary */}
                {group.medications.length > 0 && (
                  <ElderlyGroupSummary medications={group.medications} />
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
                      {t('medication.noMedsScheduled')}
                    </Text>
                  ) : (
                    /* Group medications by TIME */
                    Object.entries(
                      group.medications.reduce(
                        (acc, med) => {
                          const key = med.time;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(med);
                          return acc;
                        },
                        {} as Record<string, MedicationItem[]>,
                      ),
                    )
                    .sort(([timeA, medsA], [timeB, medsB]) => {
                      const allDoneA = medsA.every(m => m.status === 'completed');
                      const allDoneB = medsB.every(m => m.status === 'completed');
                      if (allDoneA && !allDoneB) return 1;
                      if (!allDoneA && allDoneB) return -1;
                      return timeA.localeCompare(timeB);
                    })
                    .map(([timeSlot, meds]) => {
                      const timeCardKey = `${group.elderlyId}_time_${timeSlot}`;
                      const slotsCount = meds.length;
                      const isExpanded = isMedCardExpanded(timeCardKey, slotsCount);

                      return (
                        <TimeSlotCard
                          key={timeCardKey}
                          timeSlot={timeSlot}
                          meds={meds}
                          groupElderlyId={group.elderlyId}
                          isExpanded={isExpanded}
                          onToggleExpand={() => toggleMedCard(timeCardKey, slotsCount <= 1)}
                          onRemindLater={onRemindLater}
                          onConfirmTaking={(med: MedicationItem) => {
                            setConfirmingMedItem(med);
                            setNoteText(med.notes || "");
                          }}
                          onUndoTaking={onUndoTaking}
                          setNoteText={setNoteText}
                          onShowDetails={openMedicationDetails}
                        />
                      );
                    })
                  ))}
              </View>
            ))
          )}
        </View>

      </ScrollView>

      <Portal>
        <ElderlyFilterDialog
          visible={elderlyFilterVisible}
          onDismiss={() => setElderlyFilterVisible(false)}
          linkedElderly={linkedElderly}
          selectedElderlyId={selectedElderlyId}
          onSelect={(id) => {
            setSelectedElderlyId(id);
            setElderlyFilterVisible(false);
          }}
          searchQuery={elderlySearchQuery}
          onSearchChange={setElderlySearchQuery}
        />

        <StatusFilterDialog
          visible={statusFilterVisible}
          onDismiss={() => setStatusFilterVisible(false)}
          statusFilter={statusFilter}
          dayFilter={dayFilter}
          onSelectDay={(value) => {
            setDayFilter(value);
            setStatusFilterVisible(false);
          }}
          onSelect={(status) => {
            setStatusFilter(status);
            setStatusFilterVisible(false);
          }}
        />

        <ConfirmMedicationDialog
          medItem={confirmingMedItem}
          onDismiss={() => {
            setConfirmingMedItem(null);
            setNoteText("");
          }}
          onConfirm={() => {
            if (confirmingMedItem) onConfirmTaking(confirmingMedItem);
          }}
        />

        <AddMedicationDialog
          visible={addMedDialogVisible}
          onDismiss={() => {
            setAddMedDialogVisible(false);
            setAddDialogStep("form");
          }}
          onSave={handleAddMedication}
          step={addDialogStep}
          onStepChange={setAddDialogStep}
          formData={medicationFormData}
          onFormDataChange={setMedicationFormData}
          linkedElderly={linkedElderly}
          elderlySearch={addMedElderlySearch}
          onElderlySearchChange={setAddMedElderlySearch}
          showTimePicker={showTimePicker}
          onShowTimePicker={setShowTimePicker}
          editingTimeIndex={editingTimeIndex}
          onEditingTimeIndexChange={setEditingTimeIndex}
        />

        <MedicationDetailsModal
          visible={!!selectedMedicationDetails}
          title={selectedMedicationDetails?.title || ""}
          subtitle={selectedMedicationDetails?.subtitle}
          fields={selectedMedicationDetails?.fields || []}
          onDismiss={() => setSelectedMedicationDetails(null)}
        />
      </Portal>

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
  section: {
    padding: 16,
  },
  groupContainer: {
    marginBottom: 24,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
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
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  cancelQuickActionContent: {
    minHeight: 52,
  },
  cancelQuickActionLabel: {
    fontSize: 14,
    textAlign: "left",
  },
});
