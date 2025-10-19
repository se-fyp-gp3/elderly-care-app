// app/_layout.tsx
import AuthProvider, { useAuth } from "@/lib/auth-context";
import { Stack, useRouter, useSegments } from "expo-router";
// React and hooks
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PinterestSplash from "../components/PinterestSplash";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoadingUser } = useAuth();
  const segments = useSegments();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const inAuthGroup = segments[0] === "auth";
    
    if (!isLoadingUser && appReady) {
      if (!user && !inAuthGroup) {
        router.replace("/auth");
      } else if (user && inAuthGroup) {
        router.replace("/");
      }
    }
  }, [user, segments, isLoadingUser, appReady]);

  return (
    <>
      {!appReady && (
        <PinterestSplash onAnimationComplete={() => setAppReady(true)}>
          {/* 这里传入实际的应用内容，但初始时会被动画覆盖 */}
          {children}
        </PinterestSplash>
      )}
      {appReady && children}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  return (
    <PaperProvider theme={theme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <AuthProvider>
          <SafeAreaProvider>
            <RouteGuard>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="auth" options={{ headerShown: false }} />
              </Stack>
            </RouteGuard>
          </SafeAreaProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </PaperProvider>
  );
}
