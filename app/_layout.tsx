import {
  CAREGIVER_CONNECTIONS_TABLE_ID,
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  DIRECT_MESSAGES_TABLE_ID,
  ELDERLY_CONNECTIONS_TABLE_ID,
  ELDERLY_TABLE_ID,
  EMERGENCY_ALERTS_TABLE_ID,
  GROUP_MEMBERS_TABLE_ID,
  GROUP_MESSAGES_TABLE_ID,
  GROUPS_TABLE_ID,
  MOMENTS_TABLE_ID,
  safeSubscribe,
  tablesDB,
} from "@/lib/appwrite";
import AuthProvider, { useAuth } from "@/lib/auth-context";
import "@/lib/background-chat-notifications";
import {
  disableChatBackgroundNotifications,
  enableChatBackgroundNotifications,
  markDirectMessageNotificationSeen,
  markGroupMessageNotificationSeen,
} from "@/lib/background-chat-notifications";
import "@/lib/background-step-sync";
import { disableStepBackgroundSync } from "@/lib/background-step-sync";
import { getCaregiverByUserId } from "@/lib/caregiver";
import {
  getCaregiverActivityNotificationContent,
  isCaregiverActivityAlertType,
} from "@/lib/caregiver-activity-alerts";
import { getContactsForCaregiver, getContactsForElderly } from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { upsertExpoPushToken } from "@/lib/expo-push-tokens";
import { FontSizeProvider, useFontSize } from "@/lib/font-size-context";
import { getGroupsForUser } from "@/lib/groups";
import { UnreadBadgeProvider, useUnreadBadge } from "@/lib/hooks/useUnreadBadge";
import { LanguageProvider } from "@/lib/language-context";
import {
  getExpoPushTokenAsync,
  registerForPushNotificationsAsync,
  sendImmediateNotification,
} from "@/lib/notifications";
import { CaregiverConnection, ElderlyConnections, EmergencyAlert } from "@/types/appwrite";
import { DirectMessage, Group, GroupMember, GroupMessage } from "@/types/messaging";
import { Moment } from "@/types/moments";
import { Role } from "@/types/user";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  useColorScheme,
  View,
} from "react-native";
import { Query } from "react-native-appwrite";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  configureFonts,
  MD3DarkTheme,
  MD3LightTheme,
  MD3Theme,
  PaperProvider,
} from "react-native-paper";
import { enGB, registerTranslation } from "react-native-paper-dates";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PinterestSplash from "../components/PinterestSplash";

registerTranslation("en", enGB);

const SKIP_SPLASH = true;

const tabs: Record<Role, "/(elderly-tabs)" | "/(caregiver-tabs)"> = {
  [Role.Elderly]: "/(elderly-tabs)",
  [Role.Caregiver]: "/(caregiver-tabs)",
};
const authRoutes = ["start", "signup", "auth", "qr-register", "reauth"];

const getRoleHomeRoute = (role: Role | undefined) => {
  if (role && tabs[role as keyof typeof tabs]) {
    return tabs[role as keyof typeof tabs];
  }
  return "/start";
};

const isInMainTab = (inElderlyTabs: boolean, inCaregiverTabs: boolean) => {
  return inElderlyTabs || inCaregiverTabs;
};

const isOnCorrectRoute = (params: {
  inAuthGroup: boolean;
  inElderlyTabs: boolean;
  inCaregiverTabs: boolean;
}) => {
  const { inAuthGroup, inElderlyTabs, inCaregiverTabs } = params;
  return !inAuthGroup && isInMainTab(inElderlyTabs, inCaregiverTabs);
};

const isOnRoute = (currentRoute: string, ...names: string[]) => {
  return names.includes(currentRoute);
};

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    user,
    isLoading,
    hasProfile,
    needsReAuth,
    preferences: { role },
  } = useAuth();
  const segments = useSegments();
  const [appReady, setAppReady] = useState(SKIP_SPLASH);
  const isDark = useColorScheme() === "dark";

  // Ensure notifications show even when app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!user?.$id) {
      disableChatBackgroundNotifications().catch(() => {});
    }
    if (user?.$id && role === "elderly") return;
    disableStepBackgroundSync().catch(() => {});
  }, [role, user?.$id]);

  // Global Notification Listener for Direct Messages
  const { incrementMomentUnread, refreshChatUnread } = useUnreadBadge();
  useEffect(() => {
    if (!user?.$id) return;

    // Register for permissions on mount
    registerForPushNotificationsAsync();
    // Initial chat unread count
    refreshChatUnread(user.$id);

    const unsubscribers: Array<() => void> = [];
    let myProfileId: string | null = null;
    let contactIds = new Set<string>();
    let activeGroupIds = new Set<string>();
    const profileNameCache = new Map<string, string>();
    const groupNameCache = new Map<string, string>();

    const subscribe = (
      channel: string,
      callback: Parameters<typeof safeSubscribe>[1],
    ) => {
      unsubscribers.push(safeSubscribe(channel, callback));
    };

    const getProfileName = async (profileId: string): Promise<string> => {
      if (profileNameCache.has(profileId)) {
        return profileNameCache.get(profileId)!;
      }

      const [caregiverResp, elderlyResp] = await Promise.all([
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CAREGIVER_TABLE_ID,
          queries: [Query.equal("$id", [profileId]), Query.limit(1)],
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: ELDERLY_TABLE_ID,
          queries: [Query.equal("$id", [profileId]), Query.limit(1)],
        }),
      ]);

      const resolvedName =
        caregiverResp.rows[0]?.name || elderlyResp.rows[0]?.name || "New contact";
      profileNameCache.set(profileId, resolvedName);
      return resolvedName;
    };

    const getGroupName = async (groupId: string): Promise<string> => {
      if (groupNameCache.has(groupId)) {
        return groupNameCache.get(groupId)!;
      }

      try {
        const group = await tablesDB.getRow<Group>({
          databaseId: DATABASE_ID,
          tableId: GROUPS_TABLE_ID,
          rowId: groupId,
        });
        const resolvedName = group.name || "Group chat";
        groupNameCache.set(groupId, resolvedName);
        return resolvedName;
      } catch {
        return "Group chat";
      }
    };

    const refreshRealtimeContext = async () => {
      if (!myProfileId) return;

      const [contacts, groups] = await Promise.all([
        role === "caregiver"
          ? getContactsForCaregiver(myProfileId)
          : getContactsForElderly(myProfileId),
        getGroupsForUser(myProfileId),
      ]);

      contactIds = new Set(contacts.map((contact) => contact.id));
      activeGroupIds = new Set(groups.map((group) => group.$id));
      groups.forEach((group) => {
        groupNameCache.set(group.$id, group.name || "Group chat");
      });
    };

    // Resolve profile ID first, then subscribe
    const setup = async () => {
      try {
        if (role === "caregiver") {
          const profile = await getCaregiverByUserId(user.$id);
          if (profile) myProfileId = profile.$id;
        } else {
          const profile = await getElderlyByUserId(user.$id);
          if (profile) myProfileId = profile.$id;
        }
      } catch {
        // Profile not found yet
      }

      if (!myProfileId) return;

      try {
        const hasPushPermission = await registerForPushNotificationsAsync();
        if (hasPushPermission) {
          const expoPushToken = await getExpoPushTokenAsync();
          if (expoPushToken && (Platform.OS === "android" || Platform.OS === "ios")) {
            await upsertExpoPushToken({
              profileId: myProfileId,
              userId: user.$id,
              role,
              expoPushToken,
              platform: Platform.OS,
            });
          }
        }
      } catch (error) {
        console.warn("[Notifications] Failed to register Expo push token", error);
      }

      enableChatBackgroundNotifications(myProfileId).catch(() => {});

      await refreshRealtimeContext();

      subscribe(
        `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`,
        async (response) => {
        if (!response.events.some((e) => e.endsWith(".create"))) return;

        const payload = response.payload as DirectMessage;

        if (payload.receiver_id === myProfileId && payload.sender_id !== myProfileId) {
          await sendImmediateNotification(
            payload.sender_name || "New Message",
            payload.message_type === "voice" ? "Sent a voice message" : (payload.body || "Sent a message"),
            {
              type: "direct_message",
              contactId: payload.sender_id,
              contactName: payload.sender_name,
              contactRole: payload.sender_role,
            }
          );
          await markDirectMessageNotificationSeen(payload.$id);
        }
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${GROUP_MESSAGES_TABLE_ID}.documents`,
        async (response) => {
          if (!response.events.some((e) => e.endsWith(".create"))) return;

          const payload = response.payload as GroupMessage;
          if (payload.sender_id === myProfileId) return;
          if (!activeGroupIds.has(payload.group_id)) return;

          const groupName = await getGroupName(payload.group_id);
          const messageBody =
            payload.message_type === "voice"
              ? `${payload.sender_name}: Sent a voice message`
              : payload.message_type === "system"
                ? payload.body || "Group updated"
                : `${payload.sender_name}: ${payload.body || "Sent a message"}`;

          await sendImmediateNotification(groupName, messageBody, {
            type: "group_message",
            groupId: payload.group_id,
            groupName,
          });
          await markGroupMessageNotificationSeen(payload.$id);
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${GROUP_MEMBERS_TABLE_ID}.documents`,
        async (response) => {
          const payload = response.payload as GroupMember;
          if (payload.user_profile_id !== myProfileId) return;

          const isCreate = response.events.some((e) => e.endsWith(".create"));
          const isUpdate = response.events.some((e) => e.endsWith(".update"));
          const groupName = await getGroupName(payload.group_id);

          if (payload.status === "invited" && isCreate) {
            await sendImmediateNotification(
              "Group invitation",
              `You were invited to join ${groupName}`,
              { type: "group_invitation" },
            );
          }

          if (payload.status === "active" && (isCreate || isUpdate)) {
            await sendImmediateNotification(
              "Group updated",
              `You are now in ${groupName}`,
              { type: "group_invitation" },
            );
          }

          await refreshRealtimeContext();
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${MOMENTS_TABLE_ID}.documents`,
        async (response) => {
          if (!response.events.some((e) => e.endsWith(".create"))) return;

          const payload = response.payload as Moment;
          if (payload.author_id === myProfileId) return;
          if (!contactIds.has(payload.author_id)) return;

          incrementMomentUnread();
          await sendImmediateNotification(
            payload.author_name || "New moment",
            payload.content?.trim() || "Shared a new moment",
            { type: "moment_post" },
          );
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${ELDERLY_CONNECTIONS_TABLE_ID}.documents`,
        async (response) => {
          const payload = response.payload as ElderlyConnections;
          const isCreate = response.events.some((e) => e.endsWith(".create"));
          const isUpdate = response.events.some((e) => e.endsWith(".update"));

          if (isCreate && payload.status === "pending" && payload.elderly_id_2 === myProfileId) {
            const senderName = await getProfileName(payload.elderly_id_1);
            await sendImmediateNotification(
              "New friend request",
              `${senderName} sent you a friend request`,
              { type: "friend_request" },
            );
          }

          if (isUpdate && payload.status === "active" && payload.elderly_id_1 === myProfileId) {
            const senderName = await getProfileName(payload.elderly_id_2);
            await sendImmediateNotification(
              "Friend request accepted",
              `${senderName} accepted your friend request`,
              { type: "friend_request" },
            );
          }

          if (
            payload.status === "active" &&
            (payload.elderly_id_1 === myProfileId || payload.elderly_id_2 === myProfileId)
          ) {
            await refreshRealtimeContext();
          }
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${CAREGIVER_CONNECTIONS_TABLE_ID}.documents`,
        async (response) => {
          const payload = response.payload as CaregiverConnection;
          const isCreate = response.events.some((e) => e.endsWith(".create"));
          const isUpdate = response.events.some((e) => e.endsWith(".update"));

          if (isCreate && payload.status === "pending" && payload.caregiver_id_2 === myProfileId) {
            const senderName = await getProfileName(payload.caregiver_id_1);
            await sendImmediateNotification(
              "New friend request",
              `${senderName} sent you a chat request`,
              { type: "friend_request" },
            );
          }

          if (isUpdate && payload.status === "active" && payload.caregiver_id_1 === myProfileId) {
            const senderName = await getProfileName(payload.caregiver_id_2);
            await sendImmediateNotification(
              "Friend request accepted",
              `${senderName} accepted your chat request`,
              { type: "friend_request" },
            );
          }

          if (
            payload.status === "active" &&
            (payload.caregiver_id_1 === myProfileId || payload.caregiver_id_2 === myProfileId)
          ) {
            await refreshRealtimeContext();
          }
        },
      );

      subscribe(
        `databases.${DATABASE_ID}.collections.${EMERGENCY_ALERTS_TABLE_ID}.documents`,
        async (response) => {
          if (!response.events.some((event) => event.endsWith(".create"))) return;

          const payload = response.payload as EmergencyAlert;
          if (payload.caregiver_user_id !== user.$id) return;
          if (!isCaregiverActivityAlertType(payload.type)) return;

          const { title, body, screen } =
            getCaregiverActivityNotificationContent(payload);

          await sendImmediateNotification(title, body, {
            type: "caregiver_activity",
            screen,
            elderlyId: payload.elderly_id,
          });
        },
      );
    };

    setup();

    // Handle notification tap
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const rawData = response.notification.request.content.data as any;

        if (rawData && rawData.type === "direct_message") {
          const contactId = rawData.contactId as string;
          const contactName = rawData.contactName as string;
          const contactRole = rawData.contactRole as string;

          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/conversation"
              : "/(caregiver-tabs)/conversation";

          router.push({
            pathname: targetPath,
            params: {
              contactId,
              contactName,
              contactRole,
            },
          });
        } else if (rawData && rawData.type === "group_message") {
          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/group-conversation"
              : "/(caregiver-tabs)/group-conversation";

          router.push({
            pathname: targetPath,
            params: {
              groupId: rawData.groupId as string,
              groupName: rawData.groupName as string,
            },
          });
        } else if (rawData && rawData.type === "group_invitation") {
          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/messages"
              : "/(caregiver-tabs)/messages";
          router.push(targetPath);
        } else if (rawData && rawData.type === "friend_request") {
          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/messages"
              : "/(caregiver-tabs)/messages";
          router.push(targetPath);
        } else if (rawData && rawData.type === "caregiver_activity") {
          if (role !== "caregiver") return;
          const screen = rawData.screen as string | undefined;
          router.push(
            screen === "schedule"
              ? "/(caregiver-tabs)/schedule"
              : "/(caregiver-tabs)/medication",
          );
        } else if (
          rawData &&
          (rawData.type === "moment_comment" || rawData.type === "moment_post")
        ) {
          // Navigate to community / emergency tab (where moments are shown)
          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/emergency"
              : "/(caregiver-tabs)/caregiver";
          router.push(targetPath);
        } else if (rawData && rawData.type === "fall_detected") {
          // Fall detected notification tapped – bring elderly to home (overlay will show)
          if (role === "elderly") {
            router.push("/(elderly-tabs)");
          }
        }
      },
    );

    return () => {
      // Cleanup subscription
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      subscription.remove();
    };
  }, [user?.$id, router, role, incrementMomentUnread, refreshChatUnread]);

  useEffect(() => {
    const currentRoute = segments[0];
    const inAuthGroup = authRoutes.includes(currentRoute as string);
    const inCaregiverTabs = currentRoute === "(caregiver-tabs)";
    const inElderlyTabs = currentRoute === "(elderly-tabs)";

    if (isLoading) {
      return;
    }

    // If not signed in, check for re-auth or go to start page
    if (!user) {
      if (needsReAuth) {
        if (!isOnRoute(currentRoute, "reauth")) {
          router.replace("/reauth");
        }
        return;
      }
      if (!inAuthGroup) {
        router.replace("/start");
      }
      return;
    }

    // If signed in but no profile, go to profile setup
    if (!hasProfile) {
      if (!isOnRoute(currentRoute, "profile-setup")) {
        router.replace("/profile-setup");
      }
      return;
    }

    // If signed in and on correct route, do nothing
    if (isOnCorrectRoute({ inAuthGroup, inCaregiverTabs, inElderlyTabs })) {
      return;
    }

    // Send to correct home based on role
    const targetTab = getRoleHomeRoute(role);
    if (targetTab) {
      router.replace(targetTab);
    }
  }, [
    router,
    user,
    segments,
    isLoading,
    appReady,
    hasProfile,
    role,
    needsReAuth,
  ]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {!appReady && (
        <PinterestSplash onAnimationComplete={() => setAppReady(true)}>
          <View />
        </PinterestSplash>
      )}
      {isLoading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: isDark ? "#121212" : "#ffffff",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

/** Build a scaled MD3 theme by multiplying all font sizes by the given scale */
function buildScaledTheme(base: MD3Theme, scale: number): MD3Theme {
  if (scale === 1) return base;
  const baseFonts = base.fonts;
  const scaledFonts: Record<string, any> = {};
  for (const variant of Object.keys(baseFonts)) {
    const entry = (baseFonts as any)[variant];
    scaledFonts[variant] = {
      ...entry,
      fontSize: Math.round((entry.fontSize ?? 14) * scale),
      lineHeight: entry.lineHeight
        ? Math.round(entry.lineHeight * scale)
        : undefined,
    };
  }
  return { ...base, fonts: configureFonts({ config: scaledFonts }) };
}

/** Inner component that consumes FontSizeContext to build the theme */
function ThemedApp() {
  const colorScheme = useColorScheme();
  const { fontScale } = useFontSize();
  const base = colorScheme === "dark" ? MD3DarkTheme : MD3LightTheme;
  const theme = buildScaledTheme(base, fontScale);

  return (
    <PaperProvider theme={theme}>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <AuthProvider>
          <UnreadBadgeProvider>
            <SafeAreaProvider>
              <RouteGuard>
                <Stack>
                  <Stack.Screen
                    name="(caregiver-tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(elderly-tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen name="start" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="signup"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen name="auth" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="profile-setup"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="qr-register"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="reauth"
                    options={{ headerShown: false }}
                  />
                </Stack>
              </RouteGuard>
            </SafeAreaProvider>
          </UnreadBadgeProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <FontSizeProvider>
      <LanguageProvider>
        <ThemedApp />
      </LanguageProvider>
    </FontSizeProvider>
  );
}
