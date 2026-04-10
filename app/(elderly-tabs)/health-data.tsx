import { useStepSync } from "@/lib/hooks/useStepSync";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import {
  Button,
  Card,
  Snackbar,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";

export default function ElderlyHealthData() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [snackVisible, setSnackVisible] = React.useState(false);
  const [snackMessage, setSnackMessage] = React.useState("");

  // Step sync hook — handles Google Fit / HealthKit + Appwrite sync
  const {
    todaySteps,
    isLoading: stepsLoading,
    isSyncing,
    isAuthorized,
    error: stepError,
    lastSyncTime,
    source: stepSource,
    stepHistory,
    manualSync,
    authorize,
  } = useStepSync();

  useFocusEffect(
    React.useCallback(() => {
      manualSync();
    }, [manualSync]),
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await manualSync();
    setRefreshing(false);
  }, [manualSync]);

  // Format last sync time for display
  const formatLastSync = (isoString: string | null): string => {
    if (!isoString) return t("healthData.notSyncedYet");
    try {
      const date = new Date(isoString);
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return t("healthData.lastUpdated", { time: `${hours}:${minutes}` });
    } catch {
      return t("healthData.notSyncedYet");
    }
  };

  // Format step source for display
  const formatSource = (src: string | null): string => {
    if (!src) return "";
    switch (src) {
      case "health_connect":
        return "Health Connect";
      case "apple_healthkit":
        return "Apple Health";
      default:
        return src;
    }
  };

  // Handle manual sync button press
  const handleManualSync = async () => {
    if (!isAuthorized) {
      const granted = await authorize();
      if (granted) {
        setSnackMessage(t("healthData.permissionGrantedSyncing"));
        setSnackVisible(true);
      }
    }
    await manualSync();
    if (!stepError) {
      setSnackMessage(
        t("healthData.stepsUpdated", { steps: todaySteps.toLocaleString() }),
      );
      setSnackVisible(true);
    }
  };

  // Handle authorization button
  const handleAuthorize = async () => {
    const granted = await authorize();
    if (granted) {
      setSnackMessage("Health data permission granted.");
      setSnackVisible(true);
    }
  };

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
          {t("healthData.myHealthData")}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t("healthData.trackAndMonitor")}
        </Text>
      </View>

      {/* Step Tracking */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        {t("home.todaysSteps")}
      </Text>

      <Card
        style={[styles.stepCard, { backgroundColor: theme.colors.surface }]}
      >
        <Card.Content>
          {/* Main step display */}
          <View style={styles.stepMainRow}>
            <View
              style={[
                styles.stepIconCircle,
                {
                  backgroundColor: isDark
                    ? "rgba(156,39,176,0.12)"
                    : "rgba(156,39,176,0.13)",
                },
              ]}
            >
              <MaterialCommunityIcons name="walk" size={40} color="#9C27B0" />
            </View>
            <View style={styles.stepTextContainer}>
              {stepsLoading ? (
                <ActivityIndicator size="large" color="#9C27B0" />
              ) : (
                <>
                  <Text variant="displaySmall" style={styles.stepCount}>
                    {todaySteps.toLocaleString()}
                  </Text>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("home.steps")}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Source & last sync info */}
          <View style={styles.stepInfoRow}>
            {stepSource && (
              <View
                style={[
                  styles.stepSourceBadge,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    stepSource === "health_connect"
                      ? "heart-pulse"
                      : stepSource === "apple_healthkit"
                        ? "apple"
                        : "pencil"
                  }
                  size={14}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text
                  variant="labelSmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginLeft: 4,
                  }}
                >
                  {formatSource(stepSource)}
                </Text>
              </View>
            )}
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {formatLastSync(lastSyncTime)}
            </Text>
          </View>

          {/* Error display */}
          {stepError && (
            <View
              style={[
                styles.stepErrorRow,
                {
                  backgroundColor: isDark ? "rgba(183,28,28,0.12)" : "#FFEBEE",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={theme.colors.error}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.error, marginLeft: 4, flex: 1 }}
              >
                {stepError}
              </Text>
            </View>
          )}

          {/* Authorization Button (shown when not authorized) */}
          {!isAuthorized && !stepsLoading && (
            <Button
              mode="outlined"
              icon={Platform.OS === "android" ? "heart-pulse" : "apple"}
              onPress={handleAuthorize}
              style={styles.authButton}
              labelStyle={styles.authButtonLabel}
            >
              {Platform.OS === "android"
                ? t("healthData.connectHealthConnect")
                : t("healthData.connectAppleHealth")}
            </Button>
          )}

          {/* Manual Sync Button — large size for elderly users, with haptic feedback */}
          <TouchableRipple
            onPress={handleManualSync}
            disabled={isSyncing || stepsLoading}
            rippleColor="#9C27B040"
            style={[
              styles.syncButton,
              {
                backgroundColor: isSyncing
                  ? theme.colors.surfaceDisabled
                  : "#9C27B0",
              },
            ]}
          >
            <View style={styles.syncButtonInner}>
              {isSyncing ? (
                <ActivityIndicator size={24} color="#FFFFFF" />
              ) : (
                <MaterialCommunityIcons
                  name="refresh"
                  size={28}
                  color="#FFFFFF"
                />
              )}
              <Text variant="titleMedium" style={styles.syncButtonText}>
                {isSyncing
                  ? t("healthData.syncing")
                  : t("healthData.updateSteps")}
              </Text>
            </View>
          </TouchableRipple>

          {/* Auto-sync info note */}
          <View style={styles.autoSyncNote}>
            <MaterialCommunityIcons
              name="timer-outline"
              size={14}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="labelSmall"
              style={{
                color: theme.colors.onSurfaceVariant,
                marginLeft: 4,
              }}
            >
              {t("healthData.autoSync")}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Step History (last 7 days) */}
      {stepHistory.length > 0 && (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t("healthData.stepHistory")}
          </Text>
          <Card
            style={[
              styles.recordsCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            {stepHistory.slice(0, 7).map((record, index) => (
              <View
                key={record.$id || index}
                style={[
                  styles.stepHistoryItem,
                  { borderBottomColor: theme.colors.outlineVariant },
                ]}
              >
                <View style={styles.stepHistoryLeft}>
                  <MaterialCommunityIcons
                    name="calendar"
                    size={20}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                    {record.date}
                  </Text>
                </View>
                <View style={styles.stepHistoryRight}>
                  <Text
                    variant="titleSmall"
                    style={{ fontWeight: "bold", color: "#9C27B0" }}
                  >
                    {record.steps.toLocaleString()}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("home.steps")}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <View style={styles.bottomSpacer} />

      {/* Snackbar for feedback */}
      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        {snackMessage}
      </Snackbar>
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

  // Step Card Styles
  stepCard: {
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  stepMainRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stepIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  stepTextContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    marginLeft: 16,
    gap: 6,
  },
  stepCount: {
    fontWeight: "bold",
    color: "#9C27B0",
  },
  stepInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stepSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stepErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  authButton: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
  },
  authButtonLabel: {
    fontSize: 16,
  },

  // Manual Sync Button (large size for elderly users)
  syncButton: {
    borderRadius: 16,
    marginTop: 12,
    overflow: "hidden",
    elevation: 3,
  },
  syncButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 10,
  },
  syncButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 18,
  },
  autoSyncNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  // Step History Styles
  stepHistoryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  stepHistoryLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepHistoryRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },

  // Shared Styles
  recordsCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  bottomSpacer: {
    height: 32,
  },
  snackbar: {
    marginBottom: 16,
  },
});
