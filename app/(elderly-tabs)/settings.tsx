import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, List, Switch, Text, useTheme } from "react-native-paper";

export default function ElderlySettings() {
  const { preferences, updatePreferences, signOut } = useAuth();
  const theme = useTheme();
  const [notifications, setNotifications] = React.useState(
    preferences.notifications ?? true,
  );

  const handleNotificationToggle = async (value: boolean) => {
    setNotifications(value);
    await updatePreferences({ ...preferences, notifications: value });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          Settings
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Customize your app experience
        </Text>
      </View>

      {/* Notifications */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Notifications
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Push Notifications"
          description="Receive medication and appointment reminders"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="bell"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <Switch
              value={notifications}
              onValueChange={handleNotificationToggle}
            />
          )}
        />
      </Card>

      {/* Display */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Display
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Font Size"
          description={preferences.fontSize || "Medium"}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="format-size"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          )}
        />
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title="Voice Tone"
          description={preferences.voiceTone || "Friendly"}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-voice"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          )}
        />
      </Card>

      {/* Account */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Account
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Role"
          description="Elderly"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-heart"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
        />
      </Card>

      {/* Info */}
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
              Need Help?
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
          >
            Contact your caregiver if you need help with any settings or have
            questions about the app.
          </Text>
        </Card.Content>
      </Card>

      {/* Settings Options */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="About App"
          description="Version 1.0.0"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="information"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
        />
      </Card>

      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutButtonContent}
        icon="logout"
        buttonColor={theme.colors.error}
      >
        Sign Out
      </Button>

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
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  infoCard: {
    borderRadius: 12,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButton: {
    marginTop: 24,
    borderRadius: 12,
  },
  logoutButtonContent: {
    height: 48,
  },
  bottomSpacer: {
    height: 32,
  },
});
