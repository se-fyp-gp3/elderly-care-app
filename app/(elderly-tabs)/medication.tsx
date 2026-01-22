import {
    DATABASE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    tablesDB,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import { ElderlyMedication } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Query } from "react-native-appwrite";
import { Button, Card, Chip, List, Text, useTheme } from "react-native-paper";

export default function ElderlyMedicationScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const [medications, setMedications] = React.useState<ElderlyMedication[]>([]);

  const fetchMedications = React.useCallback(async () => {
    if (!user) return;

    try {
      const profile = await getElderlyByUserId(user.$id);

      if (profile) {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_MEDICATION_TABLE_ID,
          queries: [Query.limit(50), Query.orderDesc("$createdAt")],
        });
        setMedications(response.rows as unknown as ElderlyMedication[]);
      }
    } catch (err) {
      console.error("Error fetching medications:", err);
      setMedications([]);
    }
  }, [user]);

  React.useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchMedications();
    setRefreshing(false);
  }, [fetchMedications]);

  const pendingMeds = medications.filter((m) => m.status !== "Completed");
  const completedMeds = medications.filter((m) => m.status === "Completed");

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
          My Medications
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Track your daily medications
        </Text>
      </View>

      {/* Pending Medications */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        To Take Today
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        {pendingMeds.length > 0 ? (
          pendingMeds.map((med, index) => (
            <List.Item
              key={index}
              title={med.medication?.[0]?.name || "Medication"}
              description={`${med.dosage || 1} ${med.medication?.[0]?.unit || "dose"} - ${med.frequency || "Daily"}`}
              left={(props) => (
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons
                    name="pill"
                    size={28}
                    color="#4CAF50"
                  />
                </View>
              )}
              right={() => (
                <Button
                  mode="contained"
                  compact
                  onPress={() => {
                    /* Mark as taken */
                  }}
                  style={{ backgroundColor: "#4CAF50" }}
                >
                  Take
                </Button>
              )}
              style={styles.listItem}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="check-circle"
              size={48}
              color="#4CAF50"
            />
            <Text variant="bodyLarge" style={{ marginTop: 8 }}>
              All caught up!
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              No pending medications
            </Text>
          </View>
        )}
      </Card>

      {/* Completed Today */}
      {completedMeds.length > 0 && (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Completed Today
          </Text>
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            {completedMeds.map((med, index) => (
              <List.Item
                key={index}
                title={med.medication?.[0]?.name || "Medication"}
                description={`Taken at ${med.last_taken || "earlier"}`}
                left={(props) => (
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={28}
                      color="#4CAF50"
                    />
                  </View>
                )}
                right={() => (
                  <Chip compact style={{ backgroundColor: "#4CAF5020" }}>
                    Done
                  </Chip>
                )}
                style={[styles.listItem, { opacity: 0.7 }]}
              />
            ))}
          </Card>
        </>
      )}

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
});
