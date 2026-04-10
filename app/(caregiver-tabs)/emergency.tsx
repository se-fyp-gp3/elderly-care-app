import {
    DATABASE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
    safeSubscribe
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
    fetchEmergencyAlerts,
    resolveEmergencyAlert,
    updateAlertStatus,
} from "@/lib/emergency";
import type { EmergencyAlert } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Button,
    Card,
    Chip,
    Dialog,
    Divider,
    Menu,
    Portal,
    Searchbar,
    Surface,
    Text,
    useTheme,
} from "react-native-paper";

/* ── Helpers ────────────────────────────────────────────── */

function getTypeConfig(type: string) {
  switch (type) {
    case "fall":
      return { icon: "alert-decagram", color: "#D32F2F", label: "Fall Detected" };
    case "sos":
      return { icon: "bell-alert", color: "#C62828", label: "SOS Alert" };
    case "hr_warning":
      return { icon: "heart-broken", color: "#E64A19", label: "Health Warning" };
    case "geo_fence":
      return { icon: "map-marker-alert", color: "#F57C00", label: "Geo-Fence" };
    default:
      return { icon: "alert", color: "#757575", label: "Alert" };
  }
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

type FilterStatus = "all" | "active" | "investigating" | "resolved";

/* ── Component ──────────────────────────────────────────── */

export default function EmergencyPage() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);

  /* ── Data fetching ── */
  const loadAlerts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchEmergencyAlerts(user.$id);
      setAlerts(data);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = `databases.${DATABASE_ID}.collections.${EMERGENCY_ALERTS_TABLE_ID}.documents`;
    const unsub = safeSubscribe(channel, () => {
      loadAlerts();
    });
    return () => unsub?.();
  }, [user, loadAlerts]);

  /* ── Header ── */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.navigate("/caregiver")}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.onSurface} />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ marginRight: 10 }}>
          <Chip
            icon="bell-ring"
            mode="outlined"
            style={{ borderColor: theme.colors.error }}
            textStyle={{ color: theme.colors.error }}
          >
            {t("emergency.live")}
          </Chip>
        </View>
      ),
    });
  }, [navigation, router, theme]);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = alerts;
    if (filterStatus !== "all") {
      list = list.filter((a) => a.status === filterStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.elderly_name.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          (a.location_name ?? "").toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [alerts, filterStatus, search]);

  const activeCount = useMemo(
    () => alerts.filter((a) => a.status === "active" || a.status === "investigating").length,
    [alerts],
  );

  /* ── Actions ── */
  const handleCallEmergency = (number: string) => {
    Linking.openURL(`tel:${number}`);
  };

  const handleResolve = async (alert: EmergencyAlert) => {
    if (!user) return;
    try {
      await resolveEmergencyAlert(alert.$id, user.$id);
      setSelectedAlert(null);
      loadAlerts();
    } catch (err) {
      Alert.alert("Error", "Failed to resolve alert.");
    }
  };

  const handleInvestigate = async (alert: EmergencyAlert) => {
    try {
      await updateAlertStatus(alert.$id, "investigating");
      setSelectedAlert(null);
      loadAlerts();
    } catch (err) {
      Alert.alert("Error", "Failed to update alert status.");
    }
  };

  /* ── Sub-components ── */
  const StatusBadge = ({ status }: { status: string }) => {
    let textColor = theme.colors.primary;
    let bgColor = theme.colors.primaryContainer;
    let label = t("common.resolved");
    let icon = "check-circle";

    if (status === "active") {
      textColor = theme.colors.error;
      bgColor = theme.colors.errorContainer;
      label = t("common.active");
      icon = "alert-circle";
    } else if (status === "investigating") {
      textColor = "#FB8C00";
      bgColor = isDark ? "rgba(251,140,0,0.15)" : "#FFF3E0";
      label = t("emergency.inProgress");
      icon = "progress-clock";
    }

    return (
      <Chip
        icon={icon}
        style={{ backgroundColor: bgColor }}
        textStyle={{ color: textColor, fontSize: 12 }}
        compact
      >
        {label}
      </Chip>
    );
  };

  const renderLogItem = ({ item }: { item: EmergencyAlert }) => {
    const config = getTypeConfig(item.type);
    return (
      <Surface style={[styles.logCard, { borderLeftColor: config.color }]} elevation={1}>
        <TouchableOpacity
          onPress={() => setSelectedAlert(item)}
          style={{ flexDirection: "row", alignItems: "center", padding: 12 }}
        >
          <View style={[styles.iconBox, { backgroundColor: config.color + "15" }]}>
            <MaterialCommunityIcons name={config.icon as any} size={28} color={config.color} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                {config.label}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text variant="bodyMedium" style={{ marginTop: 2 }}>
              {item.elderly_name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#666" />
              <Text variant="bodySmall" style={{ color: "#666", marginLeft: 4, marginRight: 12 }}>
                {formatRelativeTime(item.$createdAt)}
              </Text>
              {item.location_name && (
                <>
                  <MaterialCommunityIcons name="map-marker-outline" size={14} color="#666" />
                  <Text variant="bodySmall" style={{ color: "#666", marginLeft: 4 }}>
                    {item.location_name}
                  </Text>
                </>
              )}
            </View>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
      </Surface>
    );
  };

  /* ── Render ── */
  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAlerts();
            }}
          />
        }
      >
        {/* Status Banner */}
        <Surface
          style={[
            styles.banner,
            {
              backgroundColor:
                activeCount > 0 ? theme.colors.errorContainer : theme.colors.primaryContainer,
            },
          ]}
          elevation={2}
        >
          <View style={styles.bannerContent}>
            <MaterialCommunityIcons
              name={activeCount > 0 ? "shield-alert" : "shield-check"}
              size={48}
              color={activeCount > 0 ? theme.colors.error : theme.colors.primary}
            />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text
                variant="headlineSmall"
                style={{
                  color: activeCount > 0 ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer,
                  fontWeight: "bold",
                }}
              >
                {activeCount > 0 ? "Alert System Active" : "All Clear"}
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color: activeCount > 0 ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer,
                }}
              >
                {activeCount > 0
                  ? `${activeCount} unresolved alert${activeCount > 1 ? "s" : ""} require attention.`
                  : "No active alerts at this time."}
              </Text>
            </View>
          </View>
          {activeCount > 0 && (
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor="white"
              style={{ marginTop: 12 }}
              onPress={() => {
                const first = alerts.find((a) => a.status === "active");
                if (first) setSelectedAlert(first);
              }}
            >
              View Latest Alert
            </Button>
          )}
        </Surface>

        {/* Quick Actions Grid */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t("emergency.emergencyResponse")}
          </Text>
        </View>
        <View style={styles.grid}>
          <Card
            style={[styles.gridCard, { backgroundColor: "#FFEBEE" }]}
            onPress={() => handleCallEmergency("999")}
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons name="ambulance" size={32} color="#D32F2F" />
              <Text style={[styles.gridLabel, { color: "#D32F2F" }]}>Call 999</Text>
            </Card.Content>
          </Card>
          <Card
            style={[styles.gridCard, { backgroundColor: "#E3F2FD" }]}
            onPress={() => handleCallEmergency("110")}
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons name="police-badge" size={32} color="#1976D2" />
              <Text style={[styles.gridLabel, { color: "#1976D2" }]}>Police</Text>
            </Card.Content>
          </Card>
          <Card
            style={[styles.gridCard, { backgroundColor: "#fff" }]}
            onPress={() => Alert.alert("Broadcast", "Sending alert to all active staff...")}
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons name="bullhorn-outline" size={32} color={theme.colors.primary} />
              <Text style={styles.gridLabel}>Broadcast</Text>
            </Card.Content>
          </Card>
        </View>

        {/* Search & Filter */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Searchbar
            placeholder="Search alerts..."
            value={search}
            onChangeText={setSearch}
            style={{ borderRadius: 12, elevation: 1 }}
          />
        </View>
        <View style={[styles.sectionHeader, { marginTop: 4 }]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Alert Logs ({filtered.length})
          </Text>
          <Menu
            visible={filterMenuVisible}
            onDismiss={() => setFilterMenuVisible(false)}
            anchor={
              <Button
                mode="text"
                compact
                onPress={() => setFilterMenuVisible(true)}
                icon="filter-variant"
              >
                {filterStatus === "all" ? "All" : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
              </Button>
            }
          >
            <Menu.Item title="All" onPress={() => { setFilterStatus("all"); setFilterMenuVisible(false); }} />
            <Menu.Item title="Active" onPress={() => { setFilterStatus("active"); setFilterMenuVisible(false); }} />
            <Menu.Item title="Investigating" onPress={() => { setFilterStatus("investigating"); setFilterMenuVisible(false); }} />
            <Menu.Item title="Resolved" onPress={() => { setFilterStatus("resolved"); setFilterMenuVisible(false); }} />
          </Menu>
        </View>

        {filtered.length === 0 ? (
          <View style={[styles.center, { paddingVertical: 48 }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={64} color="#ccc" />
            <Text variant="bodyLarge" style={{ color: "#999", marginTop: 12 }}>
              No alerts found
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderLogItem}
            keyExtractor={(item) => item.$id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          />
        )}
      </ScrollView>

      {/* Detail Dialog */}
      <Portal>
        <Dialog
          visible={!!selectedAlert}
          onDismiss={() => setSelectedAlert(null)}
          style={{ backgroundColor: theme.colors.background }}
        >
          <Dialog.Title style={{ color: theme.colors.error, fontWeight: "bold" }}>
            <MaterialCommunityIcons name="alert" size={24} /> Incident Details
          </Dialog.Title>
          <Dialog.Content>
            {selectedAlert && (
              <View>
                <Surface style={styles.detailBox} elevation={0}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.type")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {getTypeConfig(selectedAlert.type).label}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Elderly:</Text>
                    <Text style={styles.detailValue}>{selectedAlert.elderly_name}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.location")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {selectedAlert.location_name ?? "Unknown"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.timeLabel")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedAlert.$createdAt).toLocaleString()}
                    </Text>
                  </View>
                  {selectedAlert.latitude != null && selectedAlert.longitude != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>GPS:</Text>
                      <Text style={styles.detailValue}>
                        {selectedAlert.latitude.toFixed(5)}, {selectedAlert.longitude.toFixed(5)}
                      </Text>
                    </View>
                  )}
                </Surface>

                <Text variant="titleMedium" style={{ marginTop: 16, marginBottom: 4 }}>
                  Description
                </Text>
                <Text variant="bodyMedium" style={{ lineHeight: 20 }}>
                  {selectedAlert.description ?? "No description available."}
                </Text>

                <Divider style={{ marginVertical: 16 }} />
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                  Actions
                </Text>
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Chip icon="phone" onPress={() => handleCallEmergency("999")}>
                    Call 999
                  </Chip>
                  {selectedAlert.latitude != null && selectedAlert.longitude != null && (
                    <Chip
                      icon="map-marker"
                      onPress={() =>
                        Linking.openURL(
                          `https://maps.google.com/?q=${selectedAlert.latitude},${selectedAlert.longitude}`,
                        )
                      }
                    >
                      Open Map
                    </Chip>
                  )}
                </View>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedAlert(null)}>Close</Button>
            {selectedAlert?.status === "active" && (
              <Button mode="outlined" onPress={() => handleInvestigate(selectedAlert!)}>
                Investigating
              </Button>
            )}
            {selectedAlert?.status !== "resolved" && (
              <Button mode="contained" onPress={() => handleResolve(selectedAlert!)}>
                Resolve
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  banner: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  gridCard: {
    flex: 1,
    borderRadius: 12,
  },
  gridContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  gridLabel: {
    marginTop: 8,
    fontWeight: "600",
    fontSize: 12,
  },
  logCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBox: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  detailLabel: {
    width: 80,
    color: "#666",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    color: "#000",
  },
});
