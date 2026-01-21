import { LoginError, useAuth } from "@/lib/auth-context";
import { AppwriteException } from "appwrite";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { OAuthProvider } from "react-native-appwrite";
import {
    Button,
    Snackbar,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";

export default function AuthScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const theme = useTheme();
  const router = useRouter();

  const { signIn, signInWithOAuth2, preferences } = useAuth();

  const handleSignIn = async () => {
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      router.replace("/");
    } catch (error) {
      if (error instanceof LoginError) {
        setError(error.message);
      } else if (error instanceof AppwriteException) {
        setError(error.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth2 = async () => {
    setLoading(true);
    setError(null);

    try {
      await signInWithOAuth2(OAuthProvider.Google);
      // Check if user has role set, if not redirect to start for role selection
      if (!preferences.role) {
        router.replace("/start");
      } else {
        router.replace("/");
      }
    } catch (error) {
      if (error instanceof LoginError) {
        setError(error.message);
      } else if (error instanceof AppwriteException) {
        setError(error.message);
      } else {
        setError("Authentication was cancelled or failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGetStarted = () => {
    router.back();
    // router.push("/start");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <Text style={styles.title} variant="headlineMedium">
          Welcome Back
        </Text>
        <Text style={styles.subtitle} variant="bodyMedium">
          Sign in to continue
        </Text>

        <TextInput
          label="Email"
          value={email}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="user@example.com"
          mode="outlined"
          style={styles.input}
          onChangeText={setEmail}
          disabled={loading}
        />
        <TextInput
          label="Password"
          value={password}
          autoCapitalize="none"
          secureTextEntry
          mode="outlined"
          style={styles.input}
          onChangeText={setPassword}
          disabled={loading}
        />

        <Button
          mode="contained"
          onPress={handleSignIn}
          style={styles.button}
          loading={loading}
          disabled={loading}
        >
          Sign In
        </Button>

        <View style={styles.divider}>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: theme.colors.outline },
            ]}
          />
          <Text variant="bodySmall" style={styles.dividerText}>
            OR
          </Text>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: theme.colors.outline },
            ]}
          />
        </View>

        <Button
          mode="outlined"
          onPress={handleOAuth2}
          style={styles.button}
          icon="google"
          disabled={loading}
        >
          Sign In with Google
        </Button>

        <Button
          mode="text"
          onPress={handleGetStarted}
          style={styles.switchModeButton}
        >
          New user? Get started
        </Button>
      </View>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={4000}
        action={{
          label: "Dismiss",
          onPress: () => setError(null),
        }}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 32,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    opacity: 0.7,
  },
  switchModeButton: {
    marginTop: 16,
  },
});
