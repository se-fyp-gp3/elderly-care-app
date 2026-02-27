import AuthProvider, { useAuth } from "@/lib/auth-context";
import { Role } from "@/types/user";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
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
const authRoutes = ["start", "signup", "auth", "qr-register"];

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
    preferences: { role },
  } = useAuth();
  const segments = useSegments();
  const [appReady, setAppReady] = useState(SKIP_SPLASH);

  useEffect(() => {
    const currentRoute = segments[0];
    const inAuthGroup = authRoutes.includes(currentRoute as string);
    const inCaregiverTabs = currentRoute === "(caregiver-tabs)";
    const inElderlyTabs = currentRoute === "(elderly-tabs)";

    if (isLoading) {
      return;
    }

    // If not signed in, always go to start page
    if (!user) {
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
  }, [router, user, segments, isLoading, appReady, hasProfile, role]);

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
              </Stack>
            </RouteGuard>
          </SafeAreaProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}
