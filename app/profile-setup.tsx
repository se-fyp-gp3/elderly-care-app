import { useAuth } from "@/lib/auth-context";
import { createCaregiverProfile } from "@/lib/caregiver";
import { createElderlyProfile } from "@/lib/elderly";
import { Caregiver, Elderly } from "@/types/appwrite";
import { useRouter } from "expo-router";
import { useState } from "react";
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

  const role = preferences.role || "elderly";

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!user) {
      setError("User session not found. Please try signing in again.");
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

      if (role === "caregiver") {
        await createCaregiverProfile(profileData as Caregiver);
      } else {
        await createElderlyProfile(profileData as Elderly);
      }

      if (!preferences.role) {
        await setPreference("role", role);
      }
      refreshProfile();

      router.replace("/");
    } catch (err: any) {
      console.error("Profile creation error:", err);
      setError(err.message || "Failed to create profile. Please try again.");
    } finally {
      setLoading(false);
    }
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
            Complete Your Profile
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Tell us a bit about yourself
          </Text>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                You are signing up as:{" "}
                <Text
                  style={{ fontWeight: "bold", textTransform: "capitalize" }}
                >
                  {role}
                </Text>
              </Text>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <TextInput
                label="Full Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                style={styles.input}
                disabled={loading}
                placeholder="Enter your full name"
              />

              <TextInput
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                mode="outlined"
                style={styles.input}
                disabled={loading}
                keyboardType="phone-pad"
                placeholder="+1 234 567 8900"
              />

              <DatePickerInput
                locale="en"
                label="Date of Birth"
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
            Complete Setup
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

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
