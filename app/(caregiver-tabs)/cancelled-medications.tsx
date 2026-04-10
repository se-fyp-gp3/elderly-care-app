import { useAuth } from "@/lib/auth-context";
import {
    fetchCaregiverPendingCancelReminders,
    type PendingCancelReminder,
} from "@/lib/medication";
import {
    confirmCancelMedication,
} from "@/lib/medication_tracking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Button,
    Chip,
    Divider,
    Menu,
    Searchbar,
    Surface,
    Text,
    useTheme
} from "react-native-paper";

type SortMode = "newest" | "oldest" | "elderly" | "medication";

export default function CancelledMedicationsPage() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [items, setItems] = useState<PendingCancelReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedElderly, setSelectedElderly] = useState<string>("All");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [elderlyMenuVisible, setElderlyMenuVisible] = useState(false);

  // Header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            color={theme.colors.onSurface}
          />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, theme]);

  const loadData = useCallback(async () => {
    if (!user?.$id) return;

    setLoading(true);
    try {
      const result = await fetchCaregiverPendingCancelReminders(user.$id);
      setItems(result);
    } catch (error) {
      console.error("Failed to load cancelled medications", error);
      Alert.alert("Error", "Failed to load cancelled medications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.$id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Unique elderly names for filter
  const elderlyNames = useMemo(() => {
    const names = new Set(items.map((i) => i.elderlyName));
    return ["All", ...Array.from(names).sort()];
  }, [items]);

  // Filtered & sorted items
  const displayItems = useMemo(() => {
    let filtered = items;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.medicationName.toLowerCase().includes(q) ||
          item.elderlyName.toLowerCase().includes(q) ||
          item.dosage.toLowerCase().includes(q),
      );
    }

    // Elderly filter
    if (selectedElderly !== "All") {
      filtered = filtered.filter((item) => item.elderlyName === selectedElderly);
    }

    // Sort
    const sorted = [...filtered];
    switch (sortMode) {
      case "newest":
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        break;
      case "elderly":
        sorted.sort((a, b) => a.elderlyName.localeCompare(b.elderlyName));
        break;
      case "medication":
        sorted.sort((a, b) => a.medicationName.localeCompare(b.medicationName));
        break;
    }
    return sorted;
  }, [items, searchQuery, selectedElderly, sortMode]);

  const handleConfirm = useCallback((item: PendingCancelReminder) => {
    Alert.alert(
      "Confirm Cancel",
      `Confirm that ${item.elderlyName}'s "${item.medicationName}" is cancelled?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Confirm",
          style: "destructive",
          onPress: async () => {
            try {
              await confirmCancelMedication(item.reminderId);
              setItems((prev) => prev.filter((entry) => entry.reminderId !== item.reminderId));
            } catch (error) {
              console.error("Failed to confirm cancelled medication", error);
              Alert.alert("Error", "Failed to confirm cancellation.");
            }
          },
        },
      ],
    );
  }, []);

  const handleConfirmAll = useCallback(() => {
    if (displayItems.length === 0) return;
    Alert.alert(
      "Confirm All",
      `Confirm all ${displayItems.length} cancellation(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm All",
          style: "destructive",
          onPress: async () => {
            try {
              await Promise.all(displayItems.map((item) => confirmCancelMedication(item.reminderId)));
              setItems((prev) =>
                prev.filter((entry) => !displayItems.some((d) => d.reminderId === entry.reminderId)),
              );
            } catch (error) {
              Alert.alert("Error", "Some confirmations failed.");
            }
          },
        },
      ],
    );
  }, [displayItems]);

  const sortLabel: Record<SortMode, string> = {
    newest: "Newest First",
    oldest: "Oldest First",
    elderly: "By Elderly",
    medication: "By Medication",
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Banner */}
        <Surface style={[styles.banner, { backgroundColor: theme.colors.secondaryContainer }]} elevation={1}>
          <View style={styles.bannerContent}>
            <MaterialCommunityIcons name="pill-off" size={40} color={theme.colors.onSecondaryContainer} />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: "bold", color: theme.colors.onSecondaryContainer }}>
                Cancelled Medications
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
                {items.length === 0
                  ? "No pending cancellations."
                  : `${items.length} cancellation${items.length > 1 ? "s" : ""} waiting for review.`}
              </Text>
            </View>
          </View>
        </Surface>

        {/* Search Bar */}
        <Searchbar
          placeholder="Search medication or elderly..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={{ minHeight: 0 }}
        />

        {/* Filter Row */}
        <View style={styles.filterRow}>
          {/* Elderly Filter */}
          <Menu
            visible={elderlyMenuVisible}
            onDismiss={() => setElderlyMenuVisible(false)}
            anchor={
              <Chip
                icon="account-group"
                mode="outlined"
                onPress={() => setElderlyMenuVisible(true)}
                style={styles.filterChip}
              >
                {selectedElderly === "All" ? "All Elderly" : selectedElderly}
              </Chip>
            }
          >
            {elderlyNames.map((name) => (
              <Menu.Item
                key={name}
                title={name === "All" ? "All Elderly" : name}
                leadingIcon={selectedElderly === name ? "check" : undefined}
                onPress={() => {
                  setSelectedElderly(name);
                  setElderlyMenuVisible(false);
                }}
              />
            ))}
          </Menu>

          {/* Sort */}
          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <Chip
                icon="sort"
                mode="outlined"
                onPress={() => setSortMenuVisible(true)}
                style={styles.filterChip}
              >
                {sortLabel[sortMode]}
              </Chip>
            }
          >
            {(Object.keys(sortLabel) as SortMode[]).map((mode) => (
              <Menu.Item
                key={mode}
                title={sortLabel[mode]}
                leadingIcon={sortMode === mode ? "check" : undefined}
                onPress={() => {
                  setSortMode(mode);
                  setSortMenuVisible(false);
                }}
              />
            ))}
          </Menu>

          {/* Confirm All */}
          {displayItems.length > 1 && (
            <Button
              mode="text"
              compact
              onPress={handleConfirmAll}
              textColor={theme.colors.error}
              style={{ marginLeft: "auto" }}
            >
              Confirm All
            </Button>
          )}
        </View>

        <Divider style={{ marginBottom: 12 }} />

        {/* Content */}
        {loading && items.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" />
            <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.outline }}>
              Loading...
            </Text>
          </View>
        ) : displayItems.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="check-circle-outline" size={64} color={theme.colors.outline} />
            <Text variant="titleMedium" style={{ marginTop: 12 }}>
              {searchQuery || selectedElderly !== "All"
                ? "No matching results"
                : "All caught up!"}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.outline, marginTop: 4, textAlign: "center" }}>
              {searchQuery || selectedElderly !== "All"
                ? "Try adjusting your search or filter."
                : "All cancelled medication reminders have been confirmed."}
            </Text>
          </View>
        ) : (
          displayItems.map((item) => (
            <Surface key={item.reminderId} style={[styles.card, { borderLeftColor: theme.colors.error }]} elevation={1}>
              <View style={styles.cardContent}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                      {item.medicationName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <MaterialCommunityIcons name="account" size={16} color={theme.colors.outline} />
                      <Text variant="bodyMedium" style={{ marginLeft: 4, color: theme.colors.onSurface }}>
                        {item.elderlyName}
                      </Text>
                    </View>
                  </View>
                  <Chip
                    compact
                    mode="flat"
                    style={{ backgroundColor: theme.colors.errorContainer }}
                    textStyle={{ color: theme.colors.onErrorContainer, fontSize: 11 }}
                  >
                    Cancelled
                  </Chip>
                </View>

                {/* Details */}
                <View style={styles.detailsRow}>
                  {item.dosage ? (
                    <View style={styles.detailItem}>
                      <MaterialCommunityIcons name="pill" size={14} color={theme.colors.outline} />
                      <Text variant="bodySmall" style={{ marginLeft: 4, color: theme.colors.outline }}>
                        {item.dosage}
                      </Text>
                    </View>
                  ) : null}
                  {item.reminderTimes.length > 0 && (
                    <View style={styles.detailItem}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.outline} />
                      <Text variant="bodySmall" style={{ marginLeft: 4, color: theme.colors.outline }}>
                        {item.reminderTimes.join(", ")}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailItem}>
                    <MaterialCommunityIcons name="update" size={14} color={theme.colors.outline} />
                    <Text variant="bodySmall" style={{ marginLeft: 4, color: theme.colors.outline }}>
                      {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                </View>

                {/* Action */}
                <Button
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  style={styles.confirmButton}
                  icon="check"
                  onPress={() => handleConfirm(item)}
                >
                  Confirm Cancellation
                </Button>
              </View>
            </Surface>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  banner: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchBar: {
    marginBottom: 12,
    elevation: 0,
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: 20,
  },
  loadingState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  cardContent: {
    padding: 16,
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 10,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  confirmButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    borderRadius: 8,
  },
});