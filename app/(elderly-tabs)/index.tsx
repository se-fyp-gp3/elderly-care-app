import {
    DATABASE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    SCHEDULE_TABLE_ID,
    tablesDB,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import { Elderly, ElderlyMedication, Schedule } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Query } from "react-native-appwrite";
import {
    Avatar,
    Button,
    Card,
    Chip,
    List,
    Text,
    useTheme,
} from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function ElderlyHome() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [elderlyProfile, setElderlyProfile] = React.useState<Elderly | null>(
    null,
  );
  const [medications, setMedications] = React.useState<ElderlyMedication[]>([]);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);

  const fetchElderlyData = React.useCallback(async () => {
    if (!user) return;

    try {
      // Get elderly profile
      const profile = await getElderlyByUserId(user.$id);
      setElderlyProfile(profile);

      if (profile) {
        // Fetch medications for this elderly
        try {
          const medsResponse = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: ELDERLY_MEDICATION_TABLE_ID,
            queries: [Query.limit(10), Query.orderDesc("$createdAt")],
          });
          setMedications(medsResponse.rows as unknown as ElderlyMedication[]);
        } catch {
          console.log("No medications found");
          setMedications([]);
        }

        // Fetch schedules for this elderly
        try {
          const schedResponse = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: SCHEDULE_TABLE_ID,
            queries: [Query.limit(10), Query.orderDesc("$createdAt")],
          });
          setSchedules(schedResponse.rows as unknown as Schedule[]);
        } catch {
          console.log("No schedules found");
          setSchedules([]);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching elderly data:", err);
    }
  }, [user]);

  React.useEffect(() => {
    fetchElderlyData();
  }, [fetchElderlyData]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchElderlyData();
    setRefreshing(false);
  }, [fetchElderlyData]);

  const quickActions = [
    {
      icon: "pill" as IconName,
      label: "My Medications",
      color: "#4CAF50",
      route: "medication",
    },
    {
      icon: "heart-pulse" as IconName,
      label: "My Health",
      color: "#F44336",
      route: "health-data",
    },
    {
      icon: "calendar-clock" as IconName,
      label: "My Schedule",
      color: "#2196F3",
      route: "schedule",
    },
    {
      icon: "phone-alert" as IconName,
      label: "Emergency",
      color: "#FF9800",
      route: "emergency",
    },
  ];

  const handleEmergencyCall = () => {
    Linking.openURL("tel:999");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome Header */}
      <Card
        style={[
          styles.welcomeCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={styles.welcomeContent}>
          <Avatar.Icon
            size={60}
            icon="account-heart"
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={styles.welcomeText}>
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              Hello, {elderlyProfile?.name || user?.name || "there"}!
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              How are you feeling today?
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Emergency Button */}
      <Card style={[styles.emergencyCard, { backgroundColor: "#FF3B30" }]}>
        <Card.Content>
          <Button
            mode="contained"
            icon="phone-alert"
            onPress={handleEmergencyCall}
            style={styles.emergencyButton}
            labelStyle={styles.emergencyButtonText}
            contentStyle={styles.emergencyButtonContent}
          >
            Emergency Call (999)
          </Button>
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.quickActionsGrid}>
        {quickActions.map((action, index) => (
          <Card
            key={index}
            style={[
              styles.actionCard,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => router.push(action.route as never)}
          >
            <Card.Content style={styles.actionContent}>
              <MaterialCommunityIcons
                name={action.icon}
                size={40}
                color={action.color}
              />
              <Text variant="labelLarge" style={styles.actionLabel}>
                {action.label}
              </Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Today's Medications */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Today&apos;s Medications
      </Text>
      <Card
        style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
      >
        {medications.length > 0 ? (
          medications.slice(0, 3).map((med, index) => (
            <List.Item
              key={index}
              title={med.medication?.[0]?.name || "Medication"}
              description={`${med.dosage || 1} ${med.medication?.[0]?.unit || "dose"} - ${med.frequency || "Daily"}`}
              left={(props) => (
                <List.Icon {...props} icon="pill" color="#4CAF50" />
              )}
              right={() => (
                <Chip
                  compact
                  style={{
                    backgroundColor:
                      med.status === "Completed" ? "#4CAF5020" : "#FF980020",
                  }}
                >
                  {med.status || "Pending"}
                </Chip>
              )}
            />
          ))
        ) : (
          <List.Item
            title="No medications scheduled"
            description="Your medication list is empty"
            left={(props) => <List.Icon {...props} icon="pill-off" />}
          />
        )}
        <Button
          mode="text"
          onPress={() => router.push("/medication" as never)}
          style={styles.viewAllButton}
        >
          View All Medications
        </Button>
      </Card>

      {/* Upcoming Schedule */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Upcoming Schedule
      </Text>
      <Card
        style={[styles.listCard, { backgroundColor: theme.colors.surface }]}
      >
        {schedules.length > 0 ? (
          schedules.slice(0, 3).map((schedule, index) => (
            <List.Item
              key={index}
              title={schedule.title || "Appointment"}
              description={
                schedule.description || schedule.time || "No details"
              }
              left={(props) => (
                <List.Icon {...props} icon="calendar-clock" color="#2196F3" />
              )}
              right={() => (
                <Chip
                  compact
                  style={{
                    backgroundColor:
                      schedule.status === "Completed"
                        ? "#4CAF5020"
                        : "#2196F320",
                  }}
                >
                  {schedule.status || "Upcoming"}
                </Chip>
              )}
            />
          ))
        ) : (
          <List.Item
            title="No upcoming events"
            description="Your schedule is clear"
            left={(props) => <List.Icon {...props} icon="calendar-blank" />}
          />
        )}
        <Button
          mode="text"
          onPress={() => router.push("/schedule" as never)}
          style={styles.viewAllButton}
        >
          View Full Schedule
        </Button>
      </Card>

      {/* Health Status */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Health Overview
      </Text>
      <Card
        style={[styles.healthCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push("/health-data" as never)}
      >
        <Card.Content style={styles.healthContent}>
          <View style={styles.healthItem}>
            <MaterialCommunityIcons
              name="heart-pulse"
              size={32}
              color="#F44336"
            />
            <Text variant="labelMedium">Heart Rate</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              -- bpm
            </Text>
          </View>
          <View style={styles.healthItem}>
            <MaterialCommunityIcons
              name="thermometer"
              size={32}
              color="#FF9800"
            />
            <Text variant="labelMedium">Temperature</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              -- °C
            </Text>
          </View>
          <View style={styles.healthItem}>
            <MaterialCommunityIcons name="water" size={32} color="#2196F3" />
            <Text variant="labelMedium">Blood Pressure</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              --/-- mmHg
            </Text>
          </View>
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
  welcomeCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  welcomeContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  welcomeText: {
    marginLeft: 16,
    flex: 1,
  },
  emergencyCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  emergencyButton: {
    backgroundColor: "#FFFFFF",
  },
  emergencyButtonText: {
    color: "#FF3B30",
    fontSize: 18,
    fontWeight: "bold",
  },
  emergencyButtonContent: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  actionCard: {
    width: "48%",
    marginBottom: 12,
    borderRadius: 12,
  },
  actionContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  actionLabel: {
    marginTop: 8,
    textAlign: "center",
  },
  listCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  viewAllButton: {
    marginTop: 4,
  },
  healthCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  healthContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  healthItem: {
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
});
