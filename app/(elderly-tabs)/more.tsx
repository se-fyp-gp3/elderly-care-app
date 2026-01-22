import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Button, Card, List, Text, useTheme } from "react-native-paper";

export default function ElderlyMore() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const menuItems = [
    {
      icon: "heart-pulse",
      title: "Health Data",
      description: "View your health records",
      route: "health-data",
    },
    {
      icon: "calendar-clock",
      title: "Schedule",
      description: "View your appointments",
      route: "schedule",
    },
    {
      icon: "cog",
      title: "Settings",
      description: "App preferences",
      route: "settings",
    },
    {
      icon: "help-circle",
      title: "Help & Support",
      description: "Get assistance",
      route: null,
    },
    {
      icon: "information",
      title: "About",
      description: "App information",
      route: null,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Profile Card */}
      <Card
        style={[
          styles.profileCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={styles.profileContent}>
          <Avatar.Icon
            size={72}
            icon="account-heart"
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={styles.profileInfo}>
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              {user?.name || "User"}
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}
            >
              {user?.email || ""}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Menu Items */}
      <Card
        style={[styles.menuCard, { backgroundColor: theme.colors.surface }]}
      >
        {menuItems.map((item, index) => (
          <React.Fragment key={index}>
            <List.Item
              title={item.title}
              description={item.description}
              left={() => (
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
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
              onPress={() => item.route && router.push(item.route as never)}
              style={styles.menuItem}
            />
            {index < menuItems.length - 1 && (
              <View
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </Card>

      {/* Logout Button */}
      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        buttonColor="#FF3B30"
        icon="logout"
      >
        Log Out
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
  profileCard: {
    marginBottom: 24,
    borderRadius: 16,
  },
  profileContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  menuCard: {
    borderRadius: 12,
    marginBottom: 24,
  },
  menuItem: {
    paddingVertical: 4,
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
  logoutButton: {
    marginTop: 8,
  },
  bottomSpacer: {
    height: 32,
  },
});
