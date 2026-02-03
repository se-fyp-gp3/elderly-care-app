import AuthProvider, { useAuth } from "@/lib/auth-context";
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

const tabs: Record<string, "/(elderly-tabs)" | "/(caregiver-tabs)"> = {
  elderly: "/(elderly-tabs)",
  caregiver: "/(caregiver-tabs)",
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
    const authRoutes = ["start", "signup", "auth", "profile-setup"];
    const inAuthGroup = authRoutes.includes(currentRoute as string);
    const inCaregiverTabs = currentRoute === "(caregiver-tabs)";
    const inElderlyTabs = currentRoute === "(elderly-tabs)";

    if (isLoading || !appReady) {
      return;
    }

    if (!user) {
      if (!inAuthGroup) {
        router.replace("/start");
      }
    } else {
      const hasRole = !!role;
      if (!hasRole) {
        if (currentRoute !== "start" && currentRoute !== "profile-setup") {
          router.replace("/profile-setup");
        }
      } else if (hasProfile === false) {
        if (currentRoute !== "profile-setup") {
          router.replace("/profile-setup");
        }
      } else if (hasProfile === true) {
        if (inAuthGroup || (!inCaregiverTabs && !inElderlyTabs)) {
          const targetTab = role && tabs[role as keyof typeof tabs];
          if (targetTab) {
            router.replace(targetTab);
          }
        }
      }
    }
  }, [router, user, segments, isLoading, appReady, hasProfile, role]);

  // Show loading spinner while checking auth and profile state
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      {!appReady && (
        <PinterestSplash onAnimationComplete={() => setAppReady(true)}>
          {children}
        </PinterestSplash>
      )}
      {appReady && children}
    </>
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
              </Stack>
            </RouteGuard>
          </SafeAreaProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}
