import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReAuthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { reAuthenticateElderly, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      await reAuthenticateElderly();
      // Navigation will be handled by RouteGuard
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/start");
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="face-recognition"
          size={80}
          color={theme.colors.primary}
        />
        <Text variant="headlineSmall" style={styles.title}>
          Session Expired
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Please authenticate to continue using the app.
        </Text>

        {error && (
          <Text
            variant="bodyMedium"
            style={[styles.errorText, { color: theme.colors.error }]}
          >
            {error}
          </Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : (
          <>
            <Button
              mode="contained"
              onPress={handleReAuth}
              icon="fingerprint"
              style={styles.authButton}
            >
              Authenticate with Face ID
            </Button>
            <Button
              mode="text"
              onPress={handleSignOut}
              style={styles.signOutButton}
            >
              Sign in with a different account
            </Button>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontWeight: "bold",
    marginTop: 24,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  errorText: {
    textAlign: "center",
    marginTop: 16,
  },
  authButton: {
    marginTop: 32,
    width: "100%",
  },
  signOutButton: {
    marginTop: 16,
  },
});
