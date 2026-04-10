import { DATABASE_ID, DIRECT_MESSAGES_TABLE_ID, safeSubscribe } from "@/lib/appwrite";
import AuthProvider, { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { getElderlyByUserId } from "@/lib/elderly";
import {
    registerForPushNotificationsAsync,
    sendImmediateNotification,
} from "@/lib/notifications";
import { DirectMessage } from "@/types/messaging";
import { MomentComment } from "@/types/moments";
import { Role } from "@/types/user";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  useColorScheme,
  View,
} from "react-native";
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

  // Global Notification Listener for Direct Messages
  const { incrementMomentUnread, refreshChatUnread } = useUnreadBadge();
  useEffect(() => {
    if (!user?.$id) return;

    // Register for permissions on mount
    registerForPushNotificationsAsync();
    // Initial chat unread count
    refreshChatUnread(user.$id);

    let unsubscribeRealtime: (() => void) | null = null;

    // Resolve profile ID first, then subscribe
    const setup = async () => {
      let myProfileId: string | null = null;
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

      const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
      unsubscribeRealtime = safeSubscribe(channel, async (response) => {
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
        }
      });
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
        } else if (rawData && rawData.type === "moment_comment") {
          // Navigate to community / emergency tab (where moments are shown)
          const targetPath =
            role === "elderly"
              ? "/(elderly-tabs)/emergency"
              : "/(caregiver-tabs)/caregiver";
          router.push(targetPath);
        }
      },
    );

    return () => {
      // Cleanup subscription
      unsubscribeRealtime?.();
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
