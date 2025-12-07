// app/auth.tsx
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { OAuthProvider } from "react-native-appwrite";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import { LoginError } from "@/lib/auth-context";

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>("");

  const theme = useTheme();
  const router = useRouter();

  const { signIn, signUp, signInWithOAuth2 } = useAuth();

  const handleAuth = async () => {
    try {
      if (!email || !password) {
        throw new LoginError("Email and password are required.");
      }
      setError(null);

      if (isSignUp) {
        if (password.length < 8) {
          throw new LoginError("Password must be at least 8 characters long.");
        }
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }

      router.replace("/");
    } catch (error) {
      if (error instanceof LoginError) {
        setError(error.message);
      } else {
        setError("An unexpected error occurred.");
      }
    }
  };

  const handleOAuth2 = async (provider: OAuthProvider) => {
    try {
      await signInWithOAuth2(provider);
      router.replace("/");
    } catch (error) {
      if (error instanceof LoginError) {
        setError(error.message);
      } else {
        setError("An unexpected error occurred.");
      }
    }
  };

  const handleSwitchMode = () => {
    setIsSignUp((prev) => !prev);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <Text style={styles.title} variant="headlineMedium">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </Text>

        <TextInput
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="user@example.com"
          mode="outlined"
          style={styles.input}
          onChangeText={setEmail}
        />
        <TextInput
          label="Password"
          autoCapitalize="none"
          secureTextEntry
          mode="outlined"
          style={styles.input}
          onChangeText={setPassword}
        />

        {error ? (
          <Text style={{ color: theme.colors.error }}>{error}</Text>
        ) : null}

        <Button mode="contained" onPress={handleAuth} style={styles.button}>
          {isSignUp ? "Sign Up" : "Sign In"}
        </Button>
        <Button
          mode="outlined"
          onPress={() => handleOAuth2(OAuthProvider.Google)}
          style={styles.button}
          icon="google"
        >
          {isSignUp ? "Sign Up" : "Sign In"}
          {" via Google"}
        </Button>
        <Button
          mode="text"
          onPress={handleSwitchMode}
          style={styles.switchModeButton}
        >
          {isSignUp
            ? "Already have an account? Sign In"
            : "Don't have an account? Sign Up"}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  switchModeButton: {
    marginTop: 16,
  },
});
