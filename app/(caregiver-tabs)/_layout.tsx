import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurface,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "AI Chat Bot",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="robot-happy-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chat" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="caregiver"
        options={{
          title: "Care panel",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-supervisor"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="medication"
        options={{
          title: "Medication",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="pill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="cog-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden Screens */}
      <Tabs.Screen
        name="more"
        options={{
          href: null,
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="dots-horizontal-circle-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          href: null,
          title: "Emergency",
        }}
      />
      <Tabs.Screen
        name="health-data"
        options={{
          href: null,
          title: "Health Data",
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          href: null,
          title: "Schedule",
        }}
      />
      <Tabs.Screen
        name="elderly/[id]"
        options={{
          href: null,
          title: "Elderly Detail",
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          href: null,
          title: "Conversation",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="scan-qr"
        options={{
          href: null,
          title: "Scan QR",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="register-elderly"
        options={{
          href: null,
          title: "Register Elderly",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
