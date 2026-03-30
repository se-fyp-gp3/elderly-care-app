import { clientReactNative, DATABASE_ID, DIRECT_MESSAGES_TABLE_ID } from "@/lib/appwrite";
import AuthProvider, { useAuth } from "@/lib/auth-context";
import {
  registerForPushNotificationsAsync,
  sendImmediateNotification,
} from "@/lib/notifications";
import { DirectMessage } from "@/types/messaging";
import { Role } from "@/types/user";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
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
  useEffect(() => {
    if (!user?.$id) return;

    // Register for permissions on mount
    registerForPushNotificationsAsync();

    // Subscribe to ALL new messages in the collection
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = clientReactNative.subscribe(channel, async (response) => {
      // Only process creation events
      if (!response.events.some((e) => e.endsWith(".create"))) return;

      const payload = response.payload as DirectMessage;
      
      // We only care if:
      // 1. The message is intended for the CURRENT logged-in user
      // 2. The sender is NOT the current user (sanity check)
      if (payload.receiver_id === user.$id && payload.sender_id !== user.$id) {
        
        // Show notification regardless of app state (Foreground/Background)
        // because setNotificationHandler is configured to show alerts in foreground
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

    // Handle notification tap
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const rawData = response.notification.request.content.data as any;
      
      // Safe cast or property access
      if (rawData && rawData.type === "direct_message") {
        const contactId = rawData.contactId as string;
        const contactName = rawData.contactName as string;
        const contactRole = rawData.contactRole as string;

        const targetPath = role === "elderly" ? "/(elderly-tabs)/conversation" : "/(caregiver-tabs)/conversation";

        router.push({
          pathname: targetPath,
          params: {
            contactId,
            contactName,
            contactRole,
          },
        });
      }
    });

    return () => {
      // Cleanup subscription
      unsubscribe();
      subscription.remove();
    };
  }, [user?.$id, router, role]);

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
            backgroundColor: "#ffffff",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? MD3DarkTheme : MD3LightTheme;

  return (
    <PaperProvider theme={theme}>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <AuthProvider>
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
                <Stack.Screen name="signup" options={{ headerShown: false }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
                <Stack.Screen
                  name="profile-setup"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="qr-register"
                  options={{ headerShown: false }}
                />
                <Stack.Screen name="reauth" options={{ headerShown: false }} />
              </Stack>
            </RouteGuard>
          </SafeAreaProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}
