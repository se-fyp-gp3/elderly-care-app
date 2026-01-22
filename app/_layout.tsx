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

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    user,
    isLoadingUser,
    hasProfile,
    profileLoading,
    preferences: { role },
  } = useAuth();
  const segments = useSegments();
  const [appReady, setAppReady] = useState(SKIP_SPLASH);

  useEffect(() => {
    const currentRoute = segments[0];
    const authRoutes = ["start", "signup", "auth", "profile-setup"];
    const inAuthGroup = authRoutes.includes(currentRoute as string);
    const inCaregiverTabs = currentRoute === "(tabs)";
    const inElderlyTabs = currentRoute === "(elderly-tabs)";

    if (isLoadingUser || profileLoading) {
      return;
    }

    if (!appReady) {
      return;
    }

    if (!user) {
      if (!inAuthGroup) {
        router.replace("/start");
      }
    } else {
      const hasRole = !!role;

      if (!hasRole) {
        if (currentRoute !== "start" && currentRoute !== "signup") {
          router.replace("/start");
        }
      } else if (hasProfile === false) {
        if (currentRoute !== "profile-setup") {
          router.replace("/profile-setup");
        }
      } else if (hasProfile === true) {
        if (inAuthGroup) {
          // Redirect to appropriate tab group based on role
          if (role === "elderly") {
            router.replace("/(elderly-tabs)");
          } else {
            router.replace("/(tabs)");
          }
        } else if (role === "elderly" && inCaregiverTabs) {
          // Elderly user trying to access caregiver tabs
          router.replace("/(elderly-tabs)");
        } else if (role === "caregiver" && inElderlyTabs) {
          // Caregiver trying to access elderly tabs
          router.replace("/(tabs)");
        }
      }
    }
  }, [
    router,
    user,
    segments,
    isLoadingUser,
    appReady,
    hasProfile,
    profileLoading,
    role,
  ]);

  // Show loading spinner while checking auth and profile state
  if (isLoadingUser || (user && profileLoading)) {
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
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
