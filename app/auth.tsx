// app/auth.tsx
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { OAuthProvider } from "react-native-appwrite";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>("");

  const theme = useTheme();
  const router = useRouter();

  const { signIn, signUp, signInWithOAuth2 } = useAuth();

  const handleAuth = async () => {
    setEmail(process.env.EXPO_PUBLIC_APPWRITE_EMAIL!);
    setPassword(process.env.EXPO_PUBLIC_APPWRITE_PASSWORD!);
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
  
    setError(null);

    if (isSignUp) {
      if (password.length < 8) {
        setError("Passwords must be at least 8 characters long.");
        return;
      }

    // 设置默认偏好
    const defaultPreferences = {
      role: 'elderly', // 默认角色
      fontSize: 'medium',
      voiceTone: 'gentle',
      notifications: true
    };

      const error = await signUp(email, password);
      if (error) {
        setError(error);
        return;
      }
    } else {
      const error = await signIn(email, password);
      if (error) {
        setError(error);
        return;
      }

      router.replace("/");
    }
  };

  const handleOAuth2 = async (provider: OAuthProvider) => {
    const error = await signInWithOAuth2(provider);
    if (error) {
      setError(error);
      return;
    }

    router.replace("/");
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
        {/* <Button
          mode="outlined"
          onPress={() => handleOAuth2(OAuthProvider.Google)}
          style={styles.button}
          icon="google"
        >
          {isSignUp ? "Sign Up" : "Sign In"}
          {" via Google"}
        </Button> */}
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
