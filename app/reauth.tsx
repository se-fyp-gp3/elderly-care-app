import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

export default function ReAuthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { reAuthenticateElderly, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricLabel, setBiometricLabel] = useState<string>("Biometrics");
  const { t } = useTranslation();

  useEffect(() => {
    LocalAuthentication.supportedAuthenticationTypesAsync()
      .then((types) => {
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricLabel("Face ID");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricLabel("Touch ID");
        }
      })
      .catch(() => {
        // Keep default "Biometrics" label on error
      });
  }, []);

  const handleReAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      await reAuthenticateElderly();
      // Navigation will be handled by RouteGuard
    } catch (err: any) {
      setError(err?.message || t('auth.unexpectedError'));
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
          {t('auth.sessionExpired')}
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('auth.authenticateToContinue')}
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
              {t('auth.authenticateWith', { label: biometricLabel })}
            </Button>
            <Button
              mode="text"
              onPress={handleSignOut}
              style={styles.signOutButton}
            >
              {t('auth.signInDifferent')}
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
