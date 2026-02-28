/**
 * Elderly Daily Steps Screen
 *
 * Displays today's step count with manual/auto sync to Appwrite.
 * Elderly-friendly UI: large touch targets (≥ 60x60), large text, vibration feedback.
 */

import { useSteps } from "@/lib/hooks/useSteps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Divider,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO timestamp to a friendly HK time string */
function formatSyncTime(iso: string | null): string {
  if (!iso) return "尚未同步";
  try {
    const d = new Date(iso);
    const hkOffset = 8 * 60 * 60 * 1000;
    const hk = new Date(d.getTime() + hkOffset);
    const hh = String(hk.getUTCHours()).padStart(2, "0");
    const mm = String(hk.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "—";
  }
}

/** Determine step goal progress color */
function getProgressColor(steps: number): string {
  if (steps >= 8000) return "#4CAF50"; // Green – great
  if (steps >= 4000) return "#FF9800"; // Orange – moderate
  return "#F44336"; // Red – low
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ElderlyStepsScreen() {
  const theme = useTheme();
  const {
    todaySteps,
    lastSyncedAt,
    isSyncing,
    autoSyncEnabled,
    isAvailable,
    permissionStatus,
    errorMessage,
    recentSteps,
    manualSync,
    toggleAutoSync,
    requestPermission,
  } = useSteps();

  const [refreshing, setRefreshing] = React.useState(false);

  // Pull-to-refresh
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await manualSync();
    setRefreshing(false);
  }, [manualSync]);

  // Manual sync with haptic feedback
  const handleManualSync = React.useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await manualSync();
  }, [manualSync]);

  // Step goal (default 8000 for elderly)
  const STEP_GOAL = 8000;
  const progressPercent = Math.min((todaySteps / STEP_GOAL) * 100, 100);
  const progressColor = getProgressColor(todaySteps);

  // -------------------------------------------------------------------------
  // Permission gate
  // -------------------------------------------------------------------------
  if (permissionStatus === "checking") {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <Text variant="bodyLarge" style={styles.loadingText}>
          正在检查权限...
        </Text>
      </View>
    );
  }

  if (!isAvailable) {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <MaterialCommunityIcons
          name="shoe-sneaker"
          size={64}
          color={theme.colors.outline}
        />
        <Text variant="titleMedium" style={styles.unavailableTitle}>
          此设备不支持步数功能
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.unavailableBody, { color: theme.colors.outline }]}
        >
          您的设备没有计步传感器。
        </Text>
      </View>
    );
  }

  if (permissionStatus !== "granted") {
    return (
      <View
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <MaterialCommunityIcons
          name="shield-lock-outline"
          size={64}
          color={theme.colors.primary}
        />
        <Text variant="titleMedium" style={styles.permTitle}>
          需要健康权限
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.permBody, { color: theme.colors.outline }]}
        >
          请允许访问您的步数数据，以便记录每日步数。
        </Text>
        <Button
          mode="contained"
          onPress={requestPermission}
          style={styles.permButton}
          contentStyle={styles.bigButtonContent}
          labelStyle={styles.bigButtonLabel}
        >
          授予权限
        </Button>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Main UI
  // -------------------------------------------------------------------------
  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Error Banner */}
        {errorMessage && (
          <Card style={[styles.errorCard, { backgroundColor: "#FFEBEE" }]}>
            <Card.Content style={styles.errorContent}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={24}
                color="#D32F2F"
              />
              <Text
                variant="bodyLarge"
                style={styles.errorText}
              >
                {errorMessage}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Today's Steps – Hero Card */}
        <Card
          style={[styles.heroCard, { backgroundColor: theme.colors.surface }]}
        >
          <Card.Content style={styles.heroContent}>
            <MaterialCommunityIcons
              name="walk"
              size={48}
              color={progressColor}
            />
            <Text variant="displayLarge" style={[styles.stepCount, { color: progressColor }]}>
              {todaySteps.toLocaleString()}
            </Text>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              今日步数
            </Text>

            {/* Simple progress bar */}
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: progressColor,
                  },
                ]}
              />
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.outline, marginTop: 4 }}
            >
              目标: {STEP_GOAL.toLocaleString()} 步 (
              {Math.round(progressPercent)}%)
            </Text>

            {/* Last synced */}
            <Text
              variant="bodySmall"
              style={[styles.syncTime, { color: theme.colors.outline }]}
            >
              最后同步: {formatSyncTime(lastSyncedAt)}
            </Text>
          </Card.Content>
        </Card>

        {/* Manual Sync Button – elderly friendly: large target */}
        <Button
          mode="contained"
          icon="refresh"
          onPress={handleManualSync}
          loading={isSyncing}
          disabled={isSyncing}
          style={styles.syncButton}
          contentStyle={styles.bigButtonContent}
          labelStyle={styles.bigButtonLabel}
        >
          {isSyncing ? "正在同步..." : "手动更新步数"}
        </Button>

        {/* Auto Sync Toggle */}
        <Card
          style={[
            styles.settingCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Card.Content style={styles.settingRow}>
            <View style={styles.settingTextGroup}>
              <Text variant="titleMedium">自动同步</Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.outline }}
              >
                每 30 分钟自动更新步数
              </Text>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={toggleAutoSync}
            />
          </Card.Content>
        </Card>

        <Divider style={styles.divider} />

        {/* Recent 7 Days */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          最近 7 天
        </Text>
        <Card
          style={[styles.historyCard, { backgroundColor: theme.colors.surface }]}
        >
          {recentSteps.length > 0 ? (
            recentSteps.map((entry, idx) => (
              <View key={entry.date}>
                <View style={styles.historyRow}>
                  <Text variant="bodyLarge" style={styles.historyDate}>
                    {entry.date}
                  </Text>
                  <Text
                    variant="bodyLarge"
                    style={[
                      styles.historySteps,
                      { color: getProgressColor(entry.steps) },
                    ]}
                  >
                    {entry.steps.toLocaleString()} 步
                  </Text>
                </View>
                {idx < recentSteps.length - 1 && <Divider />}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.outline }}
              >
                暂无历史步数数据
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
                style={{
                  marginLeft: 8,
                  color: theme.colors.onPrimaryContainer,
                }}
              >
                健康提示
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onPrimaryContainer,
                marginTop: 8,
                lineHeight: 22,
              }}
            >
              建议每天步行 6000–8000 步，有助于保持心肺功能和关节灵活性。请根据自身情况量力而行，循序渐进。
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
  },

  // Unavailable
  unavailableTitle: {
    marginTop: 16,
    fontWeight: "bold",
  },
  unavailableBody: {
    marginTop: 8,
    textAlign: "center",
  },

  // Permission
  permTitle: {
    marginTop: 16,
    fontWeight: "bold",
  },
  permBody: {
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  permButton: {
    marginTop: 24,
    borderRadius: 12,
  },

  // Error
  errorCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    color: "#D32F2F",
    flex: 1,
    fontSize: 16,
  },

  // Hero
  heroCard: {
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  heroContent: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  stepCount: {
    fontWeight: "bold",
    fontSize: 56,
    lineHeight: 64,
  },
  progressBarContainer: {
    width: "80%",
    height: 10,
    backgroundColor: "#E0E0E0",
    borderRadius: 5,
    marginTop: 12,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  syncTime: {
    marginTop: 8,
  },

  // Sync button (elderly-friendly: ≥ 60px height)
  syncButton: {
    marginBottom: 16,
    borderRadius: 12,
  },
  bigButtonContent: {
    minHeight: 60,
    paddingVertical: 8,
  },
  bigButtonLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // Settings
  settingCard: {
    borderRadius: 12,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingTextGroup: {
    flex: 1,
    marginRight: 16,
  },

  divider: {
    marginVertical: 16,
  },

  // Section
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 12,
  },

  // History
  historyCard: {
    borderRadius: 12,
    marginBottom: 16,
    paddingVertical: 4,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyDate: {
    fontWeight: "500",
  },
  historySteps: {
    fontWeight: "bold",
  },

  // Empty
  emptyState: {
    alignItems: "center",
    padding: 32,
  },

  // Info
  infoCard: {
    borderRadius: 12,
    marginBottom: 8,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  bottomSpacer: {
    height: 32,
  },
});
