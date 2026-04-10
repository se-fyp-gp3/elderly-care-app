import { usePresence } from "@/lib/hooks/usePresence";
import { useUnreadBadge } from "@/lib/hooks/useUnreadBadge";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  usePresence();
  const { totalUnread } = useUnreadBadge();

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
          title: t('tabs.aiChatBot'),
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
          title: t('tabs.messages'),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chat" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="caregiver"
        options={{
          title: t('tabs.carePanel'),
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
          title: t('tabs.medication'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="pill" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
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
        name="emergency"
        options={{
          href: null,
          title: t('tabs.emergency'),
        }}
      />
      <Tabs.Screen
        name="health-data"
        options={{
          href: null,
          title: t('tabs.healthData'),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          href: null,
          title: t('tabs.schedule'),
        }}
      />
      <Tabs.Screen
        name="cancelled-medications"
        options={{
          href: null,
          title: "Cancelled Medications",
        }}
      />
      <Tabs.Screen
        name="cancelled-medications"
        options={{
          href: null,
          title: "Cancelled Medications",
        }}
      />
      <Tabs.Screen
        name="elderly/[id]"
        options={{
          href: null,
          title: t('tabs.elderlyDetail'),
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          href: null,
          title: t('tabs.conversation'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="scan-qr"
        options={{
          href: null,
          title: t('tabs.scanQR'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="register-elderly"
        options={{
          href: null,
          title: t('tabs.registerElderly'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="confirm-connect"
        options={{
          href: null,
          title: t('tabs.confirmConnect'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="group-conversation"
        options={{
          href: null,
          title: t('tabs.conversation'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="group-settings"
        options={{
          href: null,
          title: t('chat.groupSettings'),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
