import MiniSettingsGearButton from "@/components/MiniSettingsGearButton";
import { useAuth } from "@/lib/auth-context";
import { UIVersion } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";

type TabVisibility = {
  index: boolean;
  chat: boolean;
  medication: boolean;
  emergency: boolean;
  settings: boolean;
};

function getVisibleTabs(version: UIVersion): TabVisibility {
  switch (version) {
    case UIVersion.Accessible:
      return { index: true, chat: true, medication: false, emergency: true, settings: false };
    case UIVersion.Simplified:
      return { index: true, chat: false, medication: false, emergency: false, settings: false };
    case UIVersion.Default:
    default:
      return { index: true, chat: true, medication: true, emergency: true, settings: true };
  }
}

export default function ElderlyTabsLayout() {
  const theme = useTheme();
  const { preferences } = useAuth();
  const uiVersion = (preferences.uiVersion as UIVersion) || UIVersion.Default;
  const visible = getVisibleTabs(uiVersion);

  const isAccessible = uiVersion === UIVersion.Accessible;
  const isSimplified = uiVersion === UIVersion.Simplified;
  const isNonDefault = isAccessible || isSimplified;
  const iconSize = isSimplified ? 36 : isAccessible ? 32 : undefined;

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
          ...(isAccessible && { height: 70, paddingBottom: 8 }),
          ...(isSimplified && { display: "none" as const }),
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurface,
        ...(isAccessible && {
          tabBarLabelStyle: { fontSize: 14, fontWeight: "600" as const },
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerRight: isNonDefault ? () => <MiniSettingsGearButton /> : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="home-heart"
              size={iconSize ?? size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "AI Chat",
          href: visible.chat ? undefined : null,
          headerRight: isAccessible ? () => <MiniSettingsGearButton /> : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="robot-happy-outline"
              size={iconSize ?? size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          href: null,
          title: "Messages",
        }}
      />
      <Tabs.Screen
        name="medication"
        options={{
          title: "Medication",
          href: visible.medication ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="pill" size={iconSize ?? size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: "Community",
          href: visible.emergency ? undefined : null,
          headerRight: isAccessible ? () => <MiniSettingsGearButton /> : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-group"
              size={iconSize ?? size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: visible.settings ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={iconSize ?? size} color={color} />
          ),
        }}
      />

      {/* Hidden Screens */}
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
        name="conversation"
        options={{
          href: null,
          title: "Conversation",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
