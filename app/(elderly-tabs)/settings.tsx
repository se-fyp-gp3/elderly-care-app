import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId, getLinkedCaregivers, updateElderlyEmergencyContact } from "@/lib/elderly";
import { Caregiver, Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { ActivityIndicator, Avatar, Button, Card, List, Switch, Text, useTheme } from "react-native-paper";

export default function ElderlySettings() {
  const { user, preferences, updatePreferences, signOut } = useAuth();
  const theme = useTheme();
  const [notifications, setNotifications] = React.useState(
    preferences.notifications ?? true,
  );

  // ── Emergency contact state ──
  const [elderlyProfile, setElderlyProfile] = useState<Elderly | null>(null);
  const [linkedCaregivers, setLinkedCaregivers] = useState<Caregiver[]>([]);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load elderly profile + linked caregivers
  const loadEmergencyData = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await getElderlyByUserId(user.$id);
      if (!profile) return;
      setElderlyProfile(profile);
      setEmergencyContact(profile.emergency_contact ?? null);
      const caregivers = await getLinkedCaregivers(profile.$id);
      setLinkedCaregivers(caregivers);
    } catch (e) {
      console.error("Error loading emergency data:", e);
    }
  }, [user]);

  useEffect(() => {
    loadEmergencyData();
  }, [loadEmergencyData]);

  // Get the name of the currently‐selected emergency contact
  const selectedCaregiverName = linkedCaregivers.find(
    (c) => c.phone === emergencyContact,
  )?.name;

  const handleSelectEmergencyContact = async (caregiver: Caregiver) => {
    if (!elderlyProfile) return;
    setSaving(true);
    try {
      await updateElderlyEmergencyContact(elderlyProfile.$id, caregiver.phone);
      setEmergencyContact(caregiver.phone);
      setPickerVisible(false);
      Alert.alert("Saved", `Emergency contact set to ${caregiver.name ?? caregiver.phone}`);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save emergency contact.");
    } finally {
      setSaving(false);
    }
  };

  const handleClearEmergencyContact = async () => {
    if (!elderlyProfile) return;
    setSaving(true);
    try {
      await updateElderlyEmergencyContact(elderlyProfile.$id, null);
      setEmergencyContact(null);
      Alert.alert("Cleared", "Emergency contact has been removed.");
    } catch (e) {
      Alert.alert("Error", "Failed to clear emergency contact.");
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    setNotifications(value);
    await updatePreferences({ ...preferences, notifications: value });
  };

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Settings
        </Text>
        <Text
          variant="bodyLarge"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
        >
          Customize your app experience
        </Text>
      </View>

      {/* Notifications */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Notifications
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Push Notifications"
          titleStyle={styles.listTitle}
          description="Receive medication and appointment reminders"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="bell"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <Switch
                value={notifications}
                onValueChange={handleNotificationToggle}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Emergency Contact */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Emergency Contact
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Emergency Contact"
          titleStyle={styles.listTitle}
          description={
            emergencyContact
              ? `${selectedCaregiverName ?? "Caregiver"} (${emergencyContact})`
              : "Not set — tap to choose"
          }
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={[styles.iconContainer, { backgroundColor: "#FFEBEE" }]}>
              <MaterialCommunityIcons
                name="phone-alert"
                size={26}
                color="#D32F2F"
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={26}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          )}
          onPress={() => setPickerVisible(true)}
          style={styles.listItem}
        />
        {emergencyContact && (
          <View>
            <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
            <List.Item
              title="Clear Emergency Contact"
              titleStyle={[styles.listTitle, { color: theme.colors.error }]}
              left={() => (
                <View style={[styles.iconContainer, { backgroundColor: "#FFEBEE" }]}>
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={26}
                    color={theme.colors.error}
                  />
                </View>
              )}
              onPress={handleClearEmergencyContact}
              style={styles.listItem}
            />
          </View>
        )}
      </Card>

      {/* Display */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Display
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Font Size"
          titleStyle={styles.listTitle}
          description={preferences.fontSize || "Medium"}
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="format-size"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={26}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          )}
          style={styles.listItem}
        />
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title="Voice Tone"
          titleStyle={styles.listTitle}
          description={preferences.voiceTone || "Friendly"}
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-voice"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <View style={styles.rightContainer}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={26}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Account */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Account
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Role"
          titleStyle={styles.listTitle}
          description="Elderly"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-heart"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* Info */}
      <Card
        style={[
          styles.infoCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={{ padding: 20 }}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons
              name="information"
              size={28}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={{ marginLeft: 10, color: theme.colors.onPrimaryContainer, fontWeight: "bold" }}
            >
              Need Help?
            </Text>
          </View>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 12, lineHeight: 26 }}
          >
            Contact your caregiver if you need help with any settings or have
            questions about the app.
          </Text>
        </Card.Content>
      </Card>

      {/* Settings Options */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="About App"
          titleStyle={styles.listTitle}
          description="Version 1.0.0"
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="information"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutButtonContent}
        labelStyle={styles.logoutButtonLabel}
        icon="logout"
        buttonColor={theme.colors.error}
      >
        Sign Out
      </Button>

      <View style={styles.bottomSpacer} />
    </ScrollView>

    {/* ── Emergency Contact Picker Modal ── */}
    <Modal
      visible={pickerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setPickerVisible(false)}
    >
      <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                  Select Emergency Contact
                </Text>
                <TouchableOpacity onPress={() => setPickerVisible(false)}>
                  <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
                </TouchableOpacity>
              </View>

              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
                Choose from your linked caregivers
              </Text>

              {linkedCaregivers.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <MaterialCommunityIcons name="account-off" size={40} color={theme.colors.outlineVariant} />
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 10, textAlign: "center" }}>
                    No linked caregivers found.{"\n"}Ask your caregiver to link you first.
                  </Text>
                </View>
              ) : (
                linkedCaregivers.map((cg) => {
                  const isSelected = cg.phone === emergencyContact;
                  return (
                    <TouchableOpacity
                      key={cg.$id}
                      onPress={() => handleSelectEmergencyContact(cg)}
                      disabled={saving}
                      activeOpacity={0.7}
                      style={[
                        styles.caregiverRow,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primaryContainer
                            : theme.colors.surfaceVariant,
                        },
                      ]}
                    >
                      <Avatar.Text
                        size={42}
                        label={(cg.name ?? "??").substring(0, 2).toUpperCase()}
                        style={{ backgroundColor: theme.colors.tertiaryContainer }}
                        labelStyle={{ color: theme.colors.onTertiaryContainer, fontWeight: "600" }}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text variant="titleMedium" style={{ fontWeight: "600" }}>
                          {cg.name ?? "Unknown"}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                          {cg.phone ?? "No phone"}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={24} color={theme.colors.primary} />
                      )}
                      {saving && isSelected && (
                        <ActivityIndicator size="small" style={{ marginLeft: 8 }} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 14,
  },
  card: {
    marginBottom: 20,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  listItem: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  listDescription: {
    fontSize: 14,
    marginTop: 3,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8F0FE",
    marginLeft: 8,
  },
  rightContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
  },
  infoCard: {
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 20,
    elevation: 2,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButton: {
    marginTop: 28,
    borderRadius: 20,
    elevation: 3,
  },
  logoutButtonContent: {
    height: 56,
  },
  logoutButtonLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  bottomSpacer: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  caregiverRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
});
