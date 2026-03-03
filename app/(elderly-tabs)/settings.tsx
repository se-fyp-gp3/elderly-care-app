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
        <Text variant="headlineMedium" style={styles.title}>
          Settings
        </Text>
        <Text
          variant="bodyLarge"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
        >
          Customize your app experience
        </Text>
      </View>

      {/* Notifications */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Notifications
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Push Notifications"
          titleStyle={styles.listTitle}
          description="Receive medication and appointment reminders"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="bell"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <Switch
                value={notifications}
                onValueChange={handleNotificationToggle}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Display */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Display
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Font Size"
          titleStyle={styles.listTitle}
          description={preferences.fontSize || "Medium"}
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="format-size"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={26}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          )}
          style={styles.listItem}
        />
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title="Voice Tone"
          titleStyle={styles.listTitle}
          description={preferences.voiceTone || "Friendly"}
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-voice"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={26}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Account */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Account
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Role"
          titleStyle={styles.listTitle}
          description="Elderly"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-heart"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Info */}
      <Card
        style={[
          styles.infoCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={{ padding: 20 }}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons
              name="information"
              size={28}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={{ marginLeft: 10, color: theme.colors.onPrimaryContainer, fontWeight: "bold" }}
            >
              Need Help?
            </Text>
          </View>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 12, lineHeight: 26 }}
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
          titleStyle={styles.listTitle}
          description="Version 1.0.0"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="information"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutButtonContent}
        labelStyle={styles.logoutButtonLabel}
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
    padding: 20,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 14,
  },
  card: {
    marginBottom: 20,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  listItem: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  listDescription: {
    fontSize: 14,
    marginTop: 3,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8F0FE",
    marginLeft: 8,
  },
  rightContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
  },
  infoCard: {
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 20,
    elevation: 2,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButton: {
    marginTop: 28,
    borderRadius: 20,
    elevation: 3,
  },
  logoutButtonContent: {
    height: 56,
  },
  logoutButtonLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  bottomSpacer: {
    height: 40,
  },
});
