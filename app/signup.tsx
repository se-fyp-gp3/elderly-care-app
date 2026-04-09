import { LoginError, useAuth } from "@/lib/auth-context";
import { Role } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppwriteException } from "appwrite";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return t('auth.emailIsRequired');
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return t('auth.emailInvalid');
    }
    if (!password) {
      return t('auth.passwordRequired');
    }
    if (password.length < 8) {
      return t('auth.passwordMinLength');
    }
    if (password !== confirmPassword) {
      return t('auth.passwordMismatch');
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
      const newUser = await signUp(email, password, role);
      if (!newUser) return;
      router.replace("/profile-setup");
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err instanceof AppwriteException || (err && err.type)) {
        if (err.type === "user_already_exists") {
          setError(
            t('auth.emailAlreadyExists'),
          );
        } else if (err.type === "general_argument_invalid") {
          setError(t('auth.invalidEmailAddress'));
        } else {
          setError(err.message || t('auth.unexpectedError'));
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
        setError(t('auth.authCancelled'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    if (role === "caregiver") {
      router.back();
    } else {
      router.back();
      router.back();
    }
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
          {t('auth.createAccount')}
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
            {role === "caregiver" ? t('common.caregiver') : t('common.elderly')}
          </Chip>
        </View>

        <TextInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('auth.emailPlaceholder')}
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <TextInput
          label={t('auth.password')}
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
          label={t('auth.confirmPassword')}
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
          {t('auth.signUp')}
        </Button>

        <View style={styles.divider}>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: theme.colors.outline },
            ]}
          />
          <Text variant="bodySmall" style={styles.dividerText}>
            {t('common.or')}
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
          {t('auth.continueWithGoogle')}
        </Button>

        <Button mode="text" onPress={handleGoBack} style={styles.backButton}>
          {t('auth.backToRoleSelection')}
        </Button>
      </View>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={4000}
        action={{
          label: t('common.dismiss'),
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
