import { LoginError, useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppwriteException } from "appwrite";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { OAuthProvider } from "react-native-appwrite";
import {
  Button,
  Chip,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Role } from "@/types/user";

export default function SignupScreen() {
  const { role } = useLocalSearchParams<{ role: Role }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const theme = useTheme();
  const router = useRouter();
  const { user, signUp, signInWithOAuth2 } = useAuth();

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return "Email is required";
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    if (!password) {
      return "Password is required";
    }
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    return null;
  };

  const handleSignup = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signUp(email, password, role);
      if (!user) return;
      router.replace("/profile-setup");
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err instanceof AppwriteException || (err && err.type)) {
        if (err.type === "user_already_exists") {
          setError(
            "An account with this email already exists. Please sign in instead.",
          );
        } else if (err.type === "general_argument_invalid") {
          setError("Please enter a valid email address.");
        } else {
          setError(err.message || "An unexpected error occurred.");
        }
      } else if (err instanceof LoginError) {
        setError(err.message);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setLoading(true);
    setError(null);

    try {
      await signInWithOAuth2(provider, role);
      if (!user) return;
      router.replace("/profile-setup");
    } catch (err: any) {
      console.error("OAuth error:", err);
      if (err instanceof LoginError) {
        setError(err.message);
      } else if (err instanceof AppwriteException) {
        setError(err.message);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError("Authentication was cancelled or failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  const getRoleIcon = () => {
    return role === "caregiver" ? "hand-heart" : "human-cane";
  };

  const getRoleColor = () => {
    return role === "caregiver" ? "#4CAF50" : "#2196F3";
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          Create Account
        </Text>

        <View style={styles.roleChipContainer}>
          <Chip
            icon={() => (
              <MaterialCommunityIcons
                name={getRoleIcon()}
                size={18}
                color={getRoleColor()}
              />
            )}
            style={[styles.roleChip, { borderColor: getRoleColor() }]}
            textStyle={{ color: getRoleColor() }}
          >
            {role === "caregiver" ? "Caregiver" : "Elderly"}
          </Chip>
        </View>

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="user@example.com"
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry={!showPassword}
          mode="outlined"
          style={styles.input}
          disabled={loading}
          right={
            <TextInput.Icon
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
        />

        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
          secureTextEntry={!showPassword}
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <Button
          mode="contained"
          onPress={handleSignup}
          style={styles.button}
          loading={loading}
          disabled={loading}
        >
          Sign Up
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
          onPress={() => handleOAuth(OAuthProvider.Google)}
          style={styles.button}
          icon="google"
          disabled={loading}
        >
          Continue with Google
        </Button>

        <Button mode="text" onPress={handleGoBack} style={styles.backButton}>
          ← Back to role selection
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
    marginBottom: 16,
  },
  roleChipContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  roleChip: {
    backgroundColor: "transparent",
    borderWidth: 1,
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
  backButton: {
    marginTop: 16,
  },
});
