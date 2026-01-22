import { useAuth } from "@/lib/auth-context";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Banner,
  Button,
  Card,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

export default function Settings() {
  const { preferences, setPreference, updatePreferences, isTrial, userLabels } =
    useAuth();
  const theme = useTheme();

  const [newPreference, setNewPreference] = useState({
    key: "",
    value: "",
  });

  const handleSetPreference = async (key: string, value: any) => {
    try {
      await setPreference(key, value);
    } catch (error) {
      console.error("Error setting preference:", error);
    }
  };

  const handleAddPreference = async () => {
    if (!newPreference.key.trim()) return;

    try {
      let parsedValue: any = newPreference.value;
      try {
        parsedValue = JSON.parse(newPreference.value);
      } catch {}

      await handleSetPreference(newPreference.key, parsedValue);
      setNewPreference({ key: "", value: "" });
    } catch (error) {
      console.error("Error adding preference:", error);
    }
  };

  const handleRemovePreference = async (key: string) => {
    try {
      const newPrefs = { ...preferences };
      delete newPrefs[key];
      await updatePreferences(newPrefs);
    } catch (error) {
      console.error("Error removing preference:", error);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <Text variant="headlineSmall" style={styles.title}>
          User Settings
        </Text>

        {/* Trial status banner */}
        <Banner
          visible={!isTrial}
          icon="lock"
          actions={[]}
          style={styles.trialBanner}
        >
          Some settings are locked. Contact support to upgrade your account.
        </Banner>

        {/* User Labels Display */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Account Status</Text>
            <View style={styles.labelsContainer}>
              {userLabels.length > 0 ? (
                userLabels.map((label, index) => (
                  <View
                    key={index}
                    style={[
                      styles.labelChip,
                      { backgroundColor: theme.colors.primaryContainer },
                    ]}
                  >
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onPrimaryContainer }}
                    >
                      {label}
                    </Text>
                  </View>
                ))
              ) : (
                <Text variant="bodySmall" style={styles.noLabels}>
                  No labels assigned
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">User Roles</Text>
            <SegmentedButtons
              value={preferences.role || "elderly"}
              onValueChange={(value) => setPreference("role", value)}
              buttons={[
                { value: "elderly", label: "elderly" },
                { value: "caregiver", label: "caregiver" },
              ]}
              style={styles.segmentedButtons}
            />
            <Text variant="bodySmall" style={styles.roleWarning}>
              ⚠️ Changing role will reset your profile (testing only)
            </Text>
          </Card.Content>
        </Card>

        <Card style={[styles.card, !isTrial && styles.disabledCard]}>
          <Card.Content>
            <Text variant="titleMedium">Font size {!isTrial && "🔒"}</Text>
            <SegmentedButtons
              value={preferences.fontSize || "medium"}
              onValueChange={(value) =>
                isTrial && setPreference("fontSize", value)
              }
              buttons={[
                { value: "small", label: "small" },
                { value: "medium", label: "medium" },
                { value: "large", label: "large" },
              ]}
              style={styles.segmentedButtons}
              density="regular"
            />
          </Card.Content>
        </Card>

        <Card style={[styles.card, !isTrial && styles.disabledCard]}>
          <Card.Content>
            <Text variant="titleMedium">
              AI voice intonation {!isTrial && "🔒"}
            </Text>
            <SegmentedButtons
              value={preferences.voiceTone || "gentle"}
              onValueChange={(value) =>
                isTrial && setPreference("voiceTone", value)
              }
              buttons={[
                { value: "gentle", label: "gentle" },
                { value: "friendly", label: "friendly" },
                { value: "professional", label: "professional" },
              ]}
              style={styles.segmentedButtons}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.switchRow}>
              <Text variant="titleMedium">Push notifications</Text>
              <Switch
                value={preferences.notifications !== false}
                onValueChange={(value) =>
                  handleSetPreference("notifications", value)
                }
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Add custom settings</Text>
            <TextInput
              label="Setting item name"
              value={newPreference.key}
              onChangeText={(text) =>
                setNewPreference((prev) => ({ ...prev, key: text }))
              }
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Set value (JSON supported)"
              value={newPreference.value}
              onChangeText={(text) =>
                setNewPreference((prev) => ({ ...prev, value: text }))
              }
              mode="outlined"
              style={styles.input}
              multiline
            />
            <Button
              mode="contained"
              onPress={handleAddPreference}
              disabled={!newPreference.key.trim()}
            >
              Add Settings
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Current Settings</Text>
            {Object.entries(preferences).map(([key, value]) => (
              <View key={key} style={styles.preferenceItem}>
                <View style={styles.preferenceText}>
                  <Text variant="bodyMedium" style={styles.preferenceKey}>
                    {key}:
                  </Text>
                  <Text variant="bodyMedium" style={styles.preferenceValue}>
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </Text>
                </View>
                {!["role", "fontSize", "voiceTone", "notifications"].includes(
                  key,
                ) && (
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => handleRemovePreference(key)}
                  >
                    delete
                  </Button>
                )}
              </View>
            ))}
            {Object.keys(preferences).length === 0 && (
              <Text style={styles.noPreferences}>No custom settings yet</Text>
            )}
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
  },
  card: {
    marginBottom: 16,
  },
  segmentedButtons: {
    marginTop: 8,
  },
  roleWarning: {
    marginTop: 8,
    color: "#f57c00",
    fontStyle: "italic",
  },
  trialBanner: {
    marginBottom: 16,
  },
  labelsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  labelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  noLabels: {
    color: "#666",
    fontStyle: "italic",
  },
  disabledCard: {
    opacity: 0.6,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  input: {
    marginBottom: 12,
  },
  preferenceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  preferenceText: {
    flex: 1,
    flexDirection: "row",
  },
  preferenceKey: {
    fontWeight: "bold",
    marginRight: 8,
  },
  preferenceValue: {
    flex: 1,
  },
  noPreferences: {
    textAlign: "center",
    color: "#666",
    fontStyle: "italic",
    marginVertical: 16,
  },
});
