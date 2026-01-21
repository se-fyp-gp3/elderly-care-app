import AuthProvider, { useAuth } from "@/lib/auth-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
import { enGB, registerTranslation } from "react-native-paper-dates";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PinterestSplash from "../components/PinterestSplash";

// Register locale for date picker
registerTranslation("en", enGB);

// Set to true to skip splash animation during development/testing
const SKIP_SPLASH = true;

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoadingUser, hasProfile, profileLoading, preferences } =
    useAuth();
  const segments = useSegments();
  const [appReady, setAppReady] = useState(SKIP_SPLASH);

  // Auth routes that unauthenticated users can access
  const authRoutes = ["start", "signup", "auth", "profile-setup"];

  useEffect(() => {
    const currentRoute = segments[0];
    const inAuthGroup = authRoutes.includes(currentRoute as string);

    // Wait for loading states to complete
    if (isLoadingUser || profileLoading) {
      return;
    }

    if (!appReady) {
      return;
    }

    if (!user) {
      // Not authenticated - redirect to start if not already on an auth route
      if (!inAuthGroup) {
        router.replace("/start");
      }
    } else {
      // User is authenticated
      const hasRole = !!preferences.role;

      if (!hasRole) {
        // No role set - need to select role first
        if (currentRoute !== "start" && currentRoute !== "signup") {
          router.replace("/start");
        }
      } else if (hasProfile === false) {
        // Has role but no profile - complete profile setup
        if (currentRoute !== "profile-setup") {
          router.replace("/profile-setup");
        }
      } else if (hasProfile === true && inAuthGroup) {
        // Fully set up user trying to access auth routes - go to home
        router.replace("/");
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
    preferences.role,
    authRoutes,
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
