import { useAuth } from "@/lib/auth-context";
import {
  cancelRegistrationRequest,
  getRegistrationRequest,
  registerElderlyForCaregiver,
} from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { DatePickerInput } from "react-native-paper-dates";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

export default function RegisterElderlyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateForm = (): string | null => {
    if (!name.trim()) return t('registerElderly.fullNameRequired');
    if (!email.trim()) return t('registerElderly.emailRequired');

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return t('registerElderly.invalidEmail');

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user || !token) {
      setError(t('registerElderly.missingSession'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await registerElderlyForCaregiver({
        token,
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        birthDate: birthDate?.toISOString().split("T")[0],
        caregiverUserId: user.$id,
      });

      setSuccess(true);

      // Navigate back to caregiver dashboard after a brief delay
      setTimeout(() => {
        router.replace("/(caregiver-tabs)/caregiver");
      }, 2000);
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err?.type === "user_already_exists") {
        setError(
          t('registerElderly.emailExists'),
        );
      } else {
        setError(
          err?.message || t('registerElderly.failedToRegister'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.error}
          />
          <Text variant="bodyLarge" style={{ marginTop: 16 }}>
            {t('registerElderly.noRegistrationToken')}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            {t('registerElderly.goBack')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="check-circle"
            size={80}
            color="#4CAF50"
          />
          <Text variant="headlineSmall" style={styles.successTitle}>
            {t('registerElderly.registrationComplete')}
          </Text>
          <Text
            variant="bodyMedium"
            style={[
              styles.successText,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {t('registerElderly.accountCreatedLinked')}{"\n"}
            {t('registerElderly.autoSignIn')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <MaterialCommunityIcons
              name="human-cane"
              size={48}
              color="#2196F3"
            />
            <Text variant="headlineSmall" style={styles.title}>
              {t('registerElderly.registerElderly')}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {t('registerElderly.registerDesc')}
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              label={t('registerElderly.fullName')}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              mode="outlined"
              left={<TextInput.Icon icon="account" />}
              style={styles.input}
            />

            <TextInput
              label={t('registerElderly.email')}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              left={<TextInput.Icon icon="email" />}
              style={styles.input}
            />

            <TextInput
              label={t('registerElderly.phoneOptional')}
              value={phone}
              onChangeText={setPhone}
              mode="outlined"
              keyboardType="phone-pad"
              left={<TextInput.Icon icon="phone" />}
              style={styles.input}
            />

            <DatePickerInput
              locale="en"
              label={t('registerElderly.dobOptional')}
              value={birthDate}
              onChange={(d) => setBirthDate(d ?? undefined)}
              inputMode="start"
              mode="outlined"
              style={styles.input}
            />

            {error && (
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={styles.submitButton}
              icon="account-plus"
            >
              {t('registerElderly.createAccount')}
            </Button>

            <Button
              mode="text"
              onPress={async () => {
                // Mark as cancelled so elderly device gets notified
                if (token) {
                  const request = await getRegistrationRequest(token);
                  if (request) {
                    await cancelRegistrationRequest(request.$id);
                  }
                }
                router.back();
              }}
              disabled={loading}
              style={styles.cancelButton}
            >
              {t('common.cancel')}
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontWeight: "bold",
    marginTop: 12,
  },
  subtitle: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  form: {
    gap: 4,
  },
  input: {
    marginBottom: 8,
  },
  submitButton: {
    marginTop: 16,
    paddingVertical: 4,
  },
  cancelButton: {
    marginTop: 8,
  },
  successTitle: {
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  successText: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
});
