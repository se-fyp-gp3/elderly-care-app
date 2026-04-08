import AddElderlyDialog from "@/components/AddElderlyDialog";
import ElderlyCard from "@/components/ElderlyCard";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import { calculateAge } from "@/lib/elderly";
import {
    computeElderlyStatus,
    ElderlyStatusInfo,
    formatLastCheck,
} from "@/lib/elderly-status";
import { Elderly, ElderlyStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import {
    Avatar,
    Button,
    Card,
    Dialog,
    FAB,
    List,
    Portal,
    Text,
    useTheme,
} from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
interface ElderlyListItem extends Elderly {
  lastCheck?: string;
  medication?: string;
  nextAppointment?: string;
  age?: number;
  statusInfo?: ElderlyStatusInfo;
}

export default function CaregiverDashboard() {
  const { preferences, user } = useAuth();
  const theme = useTheme();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [elderlyList, setElderlyList] = React.useState<ElderlyListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchElderlyData = React.useCallback(async () => {
    try {
      if (!user) return;
      setError(null);

      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        // If caregiver profile does not exist yet, treat it as having no linked elderly
        setElderlyList([]);
        return;
      }

      // Use lib helper to resolve linked elderly (handles expanded objects and raw IDs)
      const linkedElderly = await getLinkedElderly(caregiver.$id);

      // Show placeholder rows immediately so the UI is not empty while statuses load
      const elderlyListWithPlaceholders: ElderlyListItem[] = linkedElderly.map(
        (elderly) => ({
          ...elderly,
          age: calculateAge(elderly.birth),
          lastCheck: "Loading...",
          medication: "Loading...",
          nextAppointment: "Loading...",
        }),
      );
      setElderlyList(elderlyListWithPlaceholders);

      // Fetch real statuses for every elderly person in parallel
      const statusResults = await Promise.all(
        linkedElderly.map((elderly) => computeElderlyStatus(elderly.$id)),
      );

      const elderlyListWithStatus: ElderlyListItem[] = linkedElderly.map(
        (elderly, i) => {
          const statusInfo = statusResults[i];
          return {
            ...elderly,
            age: calculateAge(elderly.birth),
            status: statusInfo.status,
            lastCheck: formatLastCheck(statusInfo.lastCheckTime),
            medication: statusInfo.medicationSummary,
            nextAppointment: statusInfo.nextAppointment || "None",
            statusInfo,
          };
        },
      );

      setElderlyList(elderlyListWithStatus);
    } catch (err: any) {
      console.error("Error fetching elderly data:", err);
      setError(err.message || "Failed to load elderly data");
      // Fallback to empty list on error
      setElderlyList([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      fetchElderlyData();
    }, [fetchElderlyData]),
  );

  const router = useRouter();

  const quickActions = [
    {
      icon: "pill",
      label: t('caregiverPanel.medicationManagement'),
      color: "#4CAF50",
      route: "medication",
    },
    {
      icon: "heart-pulse",
      label: t('caregiverPanel.healthData'),
      color: "#F44336",
      route: "health-data",
    },
    {
      icon: "calendar-clock",
      label: t('caregiverPanel.schedule'),
      color: "#2196F3",
      route: "schedule",
    },
    {
      icon: "chat-alert",
      label: t('caregiverPanel.emergencyNotification'),
      color: "#FF9800",
      route: "emergency",
    },
  ];

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchElderlyData();
    setRefreshing(false);
  }, [fetchElderlyData]);

  const handleCall = React.useCallback((phone?: string) => {
    if (!phone) return Alert.alert(t('common.noPhoneNumber'));
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert(t('common.cannotCall'));
    });
  }, []);

  const handleViewInfo = React.useCallback(
    (id: string) => {
      router.push(`/elderly/${id}` as any);
    },
    [router],
  );

  const handleViewHealth = React.useCallback(
    (id: string) => {
      const elderly = elderlyList.find((e) => e.$id === id);
      const nameParam = elderly
        ? `&elderlyName=${encodeURIComponent(elderly.name)}`
        : "";
      router.push(`/health-data?elderlyId=${id}${nameParam}` as any);
    },
    [router, elderlyList],
  );

  const [infoVisible, setInfoVisible] = React.useState(false);
  const [selectedElderly, setSelectedElderly] = React.useState<any>(null);
  const [healthDataDialogVisible, setHealthDataDialogVisible] =
    React.useState(false);
  const [addElderlyVisible, setAddElderlyVisible] = React.useState(false);

  const handleQuickAction = (route: string) => {
    if (route === "health-data") {
      setHealthDataDialogVisible(true);
    } else {
      router.push(route as any);
    }
  };

  const openInfoDialog = (elderly: any) => {
    setSelectedElderly(elderly);
    setInfoVisible(true);
  };

  const closeInfoDialog = () => {
    setInfoVisible(false);
    setSelectedElderly(null);
  };

  if (preferences.role !== "caregiver") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="account-supervisor"
            size={80}
            color={theme.colors.primary}
          />
          <Text variant="headlineMedium" style={styles.title}>
            {t('caregiverPanel.title')}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {t('caregiverPanel.switchToNursing')}
          </Text>
          <Button mode="contained" onPress={() => {}} style={styles.button}>
            {t('caregiverPanel.goToSettings')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Card style={styles.statsCard}>
            <Card.Content style={styles.statsContent}>
              <View style={styles.statItem}>
                <Text variant="headlineSmall" style={styles.statNumber}>
                  {elderlyList.length}
                </Text>
                <Text variant="bodyMedium">{t('caregiverPanel.elderlyLabel')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text variant="headlineSmall" style={styles.statNumber}>
                  {
                    elderlyList.filter(
                      (e) => e.status === ElderlyStatus.WARNING,
                    ).length
                  }
                </Text>
                <Text variant="bodyMedium">{t('caregiverPanel.needsAttention')}</Text>
              </View>
            </Card.Content>
          </Card>
        </View>

        <View style={styles.section}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            {t('caregiverPanel.quickActions')}
          </Text>

          {/* Temporary Demo Button - Removed as per request now that Info button works
                    <Button 
                        mode="contained-tonal" 
                        onPress={() => router.push('/elderly/demo-user-001')}
                        style={{ marginBottom: 16, borderColor: theme.colors.primary, borderWidth: 1 }}
                        icon="eye"
                    >
                        Preview Detail Page DeshandleQuickAction(action.route
                    </Button>
                    */}

          <View style={styles.quickActions}>
            {Array.from(
              { length: Math.ceil(quickActions.length / 2) },
              (_, rowIndex) => (
                <View key={rowIndex} style={styles.actionRow}>
                  {quickActions
                    .slice(rowIndex * 2, rowIndex * 2 + 2)
                    .map((action, index) => (
                      <Card
                        key={index}
                        style={styles.actionCard}
                        onPress={() => handleQuickAction(action.route)}
                      >
                        <Card.Content style={styles.actionContent}>
                          <MaterialCommunityIcons
                            name={action.icon as IconName}
                            size={32}
                            color={action.color}
                          />
                          <Text variant="bodyMedium" style={styles.actionLabel}>
                            {action.label}
                          </Text>
                        </Card.Content>
                      </Card>
                    ))}
                </View>
              ),
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              {t('caregiverPanel.responsibleElderly')}
            </Text>
            {elderlyList.filter((e) => e.status === ElderlyStatus.WARNING)
              .length > 0 && (
              <View
                style={{
                  backgroundColor: "#FF9800",
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}
                >
                  {
                    elderlyList.filter(
                      (e) => e.status === ElderlyStatus.WARNING,
                    ).length
                  }{" "}
                  {t('caregiverPanel.needsAttention').toLowerCase()}
                </Text>
              </View>
            )}
          </View>

          {loading && (
            <Card style={styles.elderlyCard}>
              <Card.Content>
                <Text>{t('caregiverPanel.loadingElderlyData')}</Text>
              </Card.Content>
            </Card>
          )}

          {error && (
            <Card style={styles.elderlyCard}>
              <Card.Content>
                <Text style={{ color: theme.colors.error }}>{error}</Text>
                <Button
                  mode="outlined"
                  onPress={fetchElderlyData}
                  style={{ marginTop: 8 }}
                >
                  {t('common.retry')}
                </Button>
              </Card.Content>
            </Card>
          )}

          {!loading && !error && elderlyList.length === 0 && (
            <Card style={styles.elderlyCard}>
              <Card.Content>
                <Text>
                  {t('caregiverPanel.noElderlyRecords')}
                </Text>
              </Card.Content>
            </Card>
          )}

          {!loading &&
            elderlyList.map((elderly) => (
              <ElderlyCard
                key={elderly.$id}
                elderly={elderly as ElderlyListItem}
                onCall={handleCall}
                onViewInfo={() => handleViewInfo(elderly.$id)}
                onViewHealth={handleViewHealth}
              />
            ))}
        </View>
      </ScrollView>

      <Portal>
        {/* Health Data Elderly Selection Dialog */}
        <Dialog
          visible={healthDataDialogVisible}
          onDismiss={() => setHealthDataDialogVisible(false)}
        >
          <Dialog.Title>{t('caregiverPanel.selectHealthData')}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 300 }}>
              {elderlyList.length > 0 ? (
                elderlyList.map((item) => (
                  <List.Item
                    key={item.$id}
                    title={item.name}
                    description={`${t('caregiverPanel.age')} ${item.age || t('common.unknown')}`}
                    left={(props) => (
                      <Avatar.Text
                        {...props}
                        size={40}
                        label={item.name ? item.name.substring(0, 2) : "??"}
                        style={{
                          backgroundColor: theme.colors.primary,
                          marginRight: 10,
                        }}
                      />
                    )}
                    onPress={() => {
                      setHealthDataDialogVisible(false);
                      router.push(
                        `/health-data?elderlyId=${item.$id}&elderlyName=${encodeURIComponent(item.name)}` as any,
                      );
                    }}
                    right={(props) => (
                      <List.Icon {...props} icon="chevron-right" />
                    )}
                  />
                ))
              ) : (
                <Text style={{ padding: 20, textAlign: "center" }}>
                  {t('caregiverPanel.noElderlyFound')}
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setHealthDataDialogVisible(false)}>
              {t('common.cancel')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={infoVisible} onDismiss={closeInfoDialog}>
          <Dialog.Title>{selectedElderly?.name ?? t('caregiverPanel.details')}</Dialog.Title>
          <Dialog.Content>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Avatar.Text
                size={48}
                label={selectedElderly?.name?.substring(0, 2) ?? ""}
              />
              <View style={{ marginLeft: 12 }}>
                <Text variant="titleMedium">{selectedElderly?.name}</Text>
                <Text variant="bodySmall">ID: {selectedElderly?.$id}</Text>
              </View>
            </View>

            <Text variant="bodyMedium">{t('caregiverPanel.age')} {selectedElderly?.age ?? "—"}</Text>
            <Text variant="bodyMedium">
              {t('caregiverPanel.phone')} {selectedElderly?.phone ?? "—"}
            </Text>
            <Text variant="bodyMedium">
              Status: {selectedElderly?.status ?? "—"}
            </Text>
            <Text variant="bodyMedium">
              {t('caregiverPanel.lastCheck')} {selectedElderly?.lastCheck ?? "—"}
            </Text>
            <Text variant="bodyMedium">
              {t('tabs.medication')}: {selectedElderly?.medication ?? "—"}
            </Text>
            <Text variant="bodyMedium">
              {t('caregiverPanel.nextAppointment')} {selectedElderly?.nextAppointment ?? "—"}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                handleCall(selectedElderly?.phone);
                closeInfoDialog();
              }}
            >
              {t('caregiverPanel.call')}
            </Button>
            <Button
              onPress={() => {
                selectedElderly && handleViewHealth(selectedElderly.$id);
                closeInfoDialog();
              }}
            >
              {t('caregiverPanel.healthData')}
            </Button>
            <Button onPress={closeInfoDialog}>{t('common.close')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <AddElderlyDialog
        visible={addElderlyVisible}
        onDismiss={() => setAddElderlyVisible(false)}
        onSuccess={() => {
          fetchElderlyData();
          // Maybe show a success message?
        }}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setAddElderlyVisible(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
    opacity: 0.7,
  },
  button: {
    marginTop: 8,
  },
  header: {
    padding: 16,
  },
  statsCard: {
    marginBottom: 8,
  },
  statsContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontWeight: "bold",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E0E0E0",
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 16,
  },
  quickActions: {
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionCard: {
    flex: 1,
    height: 110,
    justifyContent: "center",
  },
  actionContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  actionLabel: {
    marginTop: 8,
    textAlign: "center",
  },
  elderlyCard: {
    marginBottom: 12,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
