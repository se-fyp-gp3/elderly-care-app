import { useAuth } from "@/lib/auth-context";
import { fetchElderlySchedulesForUser } from "@/lib/elderly";
import { Schedule } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Card, Chip, List, Text, useTheme } from "react-native-paper";

export default function ElderlySchedule() {
  const { user } = useAuth();
  const theme = useTheme();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);

  const fetchSchedules = React.useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetchElderlySchedulesForUser(user.$id);
      setSchedules(response as Schedule[]);
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setSchedules([]);
    }
  }, [user]);

  React.useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchSchedules();
    setRefreshing(false);
  }, [fetchSchedules]);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "Completed":
        return "#4CAF50";
      case "Missed":
        return "#F44336";
      default:
        return "#2196F3";
    }
  };

  const todaySchedules = schedules.filter(
    (s) => s.status !== "Completed" && s.status !== "Missed",
  );
  const pastSchedules = schedules.filter(
    (s) => s.status === "Completed" || s.status === "Missed",
  );

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
          {t('schedule.mySchedule')}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t('schedule.viewAppointments')}
        </Text>
      </View>

      {/* Today's Schedule */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        {t('home.upcoming')}
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        {todaySchedules.length > 0 ? (
          todaySchedules.map((schedule, index) => (
            <List.Item
              key={index}
              title={schedule.title || t('home.appointment')}
              description={
                schedule.description || schedule.time || t('home.noDetails')
              }
              left={() => (
                <View
                  style={[
                    styles.timeIndicator,
                    { backgroundColor: "#2196F320" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={24}
                    color="#2196F3"
                  />
                </View>
              )}
              right={() => (
                <Chip
                  compact
                  style={{
                    backgroundColor: `${getStatusColor(schedule.status)}20`,
                  }}
                  textStyle={{ color: getStatusColor(schedule.status) }}
                >
                  {schedule.status || t('home.upcoming')}
                </Chip>
              )}
              style={styles.scheduleItem}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="calendar-check"
              size={48}
              color="#4CAF50"
            />
            <Text variant="bodyLarge" style={{ marginTop: 8 }}>
              {t('home.noUpcomingEvents')}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('home.scheduleIsClear')}
            </Text>
          </View>
        )}
      </Card>

      {/* Past Schedule */}
      {pastSchedules.length > 0 && (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t('schedule.pastEvents')}
          </Text>
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            {pastSchedules.slice(0, 5).map((schedule, index) => (
              <List.Item
                key={index}
                title={schedule.title || t('home.appointment')}
                description={schedule.time || t('schedule.noDate')}
                left={() => (
                  <View
                    style={[
                      styles.timeIndicator,
                      {
                        backgroundColor: `${getStatusColor(schedule.status)}20`,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={
                        schedule.status === "Completed"
                          ? "check-circle"
                          : "close-circle"
                      }
                      size={24}
                      color={getStatusColor(schedule.status)}
                    />
                  </View>
                )}
                right={() => (
                  <Chip
                    compact
                    style={{
                      backgroundColor: `${getStatusColor(schedule.status)}20`,
                    }}
                    textStyle={{ color: getStatusColor(schedule.status) }}
                  >
                    {schedule.status}
                  </Chip>
                )}
                style={[styles.scheduleItem, { opacity: 0.7 }]}
              />
            ))}
          </Card>
        </>
      )}

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
              name="bell"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer }}
            >
              {t('schedule.reminders')}
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
          >
            {t('schedule.remindersDesc')}
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
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  scheduleItem: {
    paddingVertical: 8,
  },
  timeIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
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
