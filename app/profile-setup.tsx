import { useAuth } from "@/lib/auth-context";
import { createCaregiverProfile } from "@/lib/caregiver";
import { createElderlyProfile } from "@/lib/elderly";
import { Caregiver, Elderly } from "@/types/appwrite";
import { Role } from "@/types/user";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
} from "react-native";
import {
    Button,
    Card,
    Snackbar,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { DatePickerInput } from "react-native-paper-dates";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileSetupScreen() {
  const { user, preferences, setPreference, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const role: Role = preferences.role || Role.Elderly;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('auth.nameRequired'));
      return;
    }

    if (!user) {
      setError(t('auth.sessionNotFound'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profileData = {
        user_id: user.$id,
        name: name.trim(),
        phone: phone.trim() || null,
        birth: birthDate ? birthDate.toISOString().split("T")[0] : null,
      };

      if (role === Role.Caregiver) {
        await createCaregiverProfile(profileData as Caregiver);
      } else if (role === Role.Elderly) {
        await createElderlyProfile(profileData as Elderly);
      }

      if (!preferences.role) {
        await setPreference("role", role);
      }
      refreshProfile();

      router.replace("/");
    } catch (err: any) {
      console.error("Profile creation error:", err);
      setError(err.message || t('auth.failedToCreateProfile'));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchRole = async () => {
    const newRole = role === Role.Elderly ? Role.Caregiver : Role.Elderly;
    await setPreference("role", newRole);
    router.replace("/start");
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="headlineMedium" style={styles.title}>
            {t('auth.completeProfile')}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {t('auth.tellAboutYourself')}
          </Text>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                {t('auth.signingUpAs', { role: t(`common.${role}`) })}
              </Text>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <TextInput
                label={t('auth.fullName')}
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
                disabled={loading}
                placeholder={t('auth.fullNamePlaceholder')}
              />

              <TextInput
                label={t('auth.phoneNumber')}
                value={phone}
                onChangeText={setPhone}
                mode="outlined"
                style={styles.input}
                disabled={loading}
                keyboardType="phone-pad"
                placeholder={t('auth.phonePlaceholder')}
              />

              <DatePickerInput
                locale="en"
                label={t('auth.dateOfBirth')}
                value={birthDate}
                onChange={(d) => setBirthDate(d)}
                inputMode="start"
                mode="outlined"
                style={styles.input}
                disabled={loading}
              />
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleSubmit}
            style={styles.submitButton}
            loading={loading}
            disabled={loading || !name.trim()}
          >
            {t('auth.completeSetup')}
          </Button>

          <Button
            mode="text"
            onPress={handleSwitchRole}
            style={styles.submitButton}
            disabled={loading}
          >
            {t('auth.switchRole', { role: role === Role.Elderly ? t('common.caregiver') : t('common.elderly') })}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
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
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  input: {
    marginBottom: 16,
  },
  submitButton: {
    marginTop: 16,
  },
});
