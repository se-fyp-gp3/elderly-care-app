import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import {
    fetchHealthDataForElderly,
    getLatestMetrics,
} from "@/lib/health-data";
import { HealthData } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";

export default function ElderlyHealthData() {
  const { user } = useAuth();
  const theme = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const [healthData, setHealthData] = React.useState<HealthData[]>([]);
  const [latestMetrics, setLatestMetrics] = React.useState<
    Record<string, HealthData>
  >({});
  const [elderlyProfileId, setElderlyProfileId] = React.useState<
    string | null
  >(null);

  const fetchHealthData = React.useCallback(async () => {
    if (!user) return;

    try {
      const profile = await getElderlyByUserId(user.$id);

      if (profile) {
        setElderlyProfileId(profile.$id);
        const [records, metrics] = await Promise.all([
          fetchHealthDataForElderly(profile.$id, 50),
          getLatestMetrics(profile.$id),
        ]);
        setHealthData(records);
        setLatestMetrics(metrics);
      }
    } catch (err) {
      console.error("Error fetching health data:", err);
      setHealthData([]);
    }
  }, [user]);

  React.useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchHealthData();
    setRefreshing(false);
  }, [fetchHealthData]);

  const healthMetrics = [
    {
      icon: "water",
      label: "Blood Pressure",
      value: latestMetrics["Blood Pressure"]?.value || "--/-- mmHg",
      color: "#2196F3",
    },
    {
      icon: "heart-pulse",
      label: "Heart Rate",
      value: latestMetrics["Heart Rate"]?.value || "-- bpm",
      color: "#F44336",
    },
    {
      icon: "thermometer",
      label: "Temperature",
      value: latestMetrics["Temperature"]?.value || "-- °C",
      color: "#FF9800",
    },
    {
      icon: "scale-bathroom",
      label: "Weight",
      value: latestMetrics["Weight"]?.value || "-- kg",
      color: "#4CAF50",
    },
    {
      icon: "water-outline",
      label: "Blood Sugar",
      value: latestMetrics["Blood Sugar"]?.value || "-- mg/dL",
      color: "#9C27B0",
    },
    {
      icon: "lungs",
      label: "Oxygen Saturation",
      value: latestMetrics["Oxygen Saturation"]?.value || "-- %",
      color: "#00BCD4",
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          My Health Data
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Track and monitor your health
        </Text>
      </View>

      {/* Health Metrics Grid */}
      <View style={styles.metricsGrid}>
        {healthMetrics.map((metric, index) => (
          <Card
            key={index}
            style={[
              styles.metricCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Card.Content style={styles.metricContent}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${metric.color}20` },
                ]}
              >
                <MaterialCommunityIcons
                  name={metric.icon as any}
                  size={28}
                  color={metric.color}
                />
              </View>
              <Text
                variant="labelMedium"
                style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}
              >
                {metric.label}
              </Text>
              <Text
                variant="titleMedium"
                style={{ fontWeight: "bold", marginTop: 4 }}
              >
                {metric.value}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Recent Records */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Recent Records
      </Text>
      <Card
        style={[styles.recordsCard, { backgroundColor: theme.colors.surface }]}
      >
        {healthData.length > 0 ? (
          healthData.slice(0, 5).map((record, index) => (
            <View key={record.$id || index} style={styles.recordItem}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge">
                  {record.type || "Health Record"}
                </Text>
                <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                  {record.value || "—"}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {record.time
                    ? new Date(record.time).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "No date"}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="chart-line"
              size={48}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="bodyLarge" style={{ marginTop: 8 }}>
              No health records yet
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Your health data will appear here
            </Text>
          </View>
        )}
      </Card>

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
              name="information"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer }}
            >
              Health Monitoring
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
          >
            Your caregiver can help update your health data. Contact them if you
            notice any changes in your health.
          </Text>
        </Card.Content>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
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
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricCard: {
    width: "48%",
    marginBottom: 12,
    borderRadius: 12,
  },
  metricContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  recordsCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  recordItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  infoCard: {
    borderRadius: 12,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
});
