import MiniSettingsModal from "@/components/MiniSettingsModal";
import { Contact } from "@/lib/contacts";
import { Elderly, ElderlyMedicationReminder } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { openURL } from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Card, Text, useTheme } from "react-native-paper";

type TodoItem = {
  reminder: ElderlyMedicationReminder;
  time: string;
  scheduledAt: string;
  status: "pending" | "taken" | "missing";
  logId?: string;
  medicationName: string;
  dosage: string;
};

interface SimplifiedHomeViewProps {
  elderlyProfile: Elderly | null;
  userName: string;
  todoList: TodoItem[];
  contacts: Contact[];
  onTakeMedication: (item: TodoItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export default function SimplifiedHomeView({
  elderlyProfile,
  userName,
  todoList,
  contacts,
  onTakeMedication,
  refreshing,
  onRefresh,
}: SimplifiedHomeViewProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const handleEmergencyCall = () => {
    const num = elderlyProfile?.emergency_contact;
    if (!num) {
      Alert.alert(
        t('home.noEmergencyContact'),
        t('home.askCaregiverToSet'),
      );
      return;
    }
    Alert.alert(t('emergency.emergencyCall'), t('home.callConfirm', { number: num }), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('home.callNow'),
        style: "destructive",
        onPress: () => openURL(`tel:${num}`),
      },
    ]);
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.greeting, { color: theme.colors.onBackground }]}
            >
              {t('home.hello', { name: userName })}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {t('home.howAreYou')}
            </Text>
          </View>
        </View>

        {/* Emergency Call Button */}
        <TouchableOpacity
          onPress={handleEmergencyCall}
          activeOpacity={0.8}
          style={styles.emergencyButton}
        >
          <MaterialCommunityIcons
            name="phone-in-talk"
            size={52}
            color="#FFFFFF"
          />
          <Text style={styles.emergencyText}>{t('home.emergencyCall')}</Text>
          <Text style={styles.emergencySubtext}>
            {t('home.tapToCallEmergency')}
          </Text>
        </TouchableOpacity>

        {/* Today's Medications */}
        <Text
          style={[styles.sectionTitle, { color: theme.colors.onBackground }]}
        >
          {t('home.todaysMedications')}
        </Text>

        {todoList.length === 0 ? (
          <Card
            style={[
              styles.emptyCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Card.Content style={styles.emptyCardContent}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={40}
                color={theme.colors.primary}
              />
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {t('home.noMedsToday')}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          todoList.map((item, idx) => {
            const isTaken = item.status === "taken";
            const isMissing = item.status === "missing";
            const iconName = isTaken
              ? "check-circle"
              : isMissing
                ? "alert-circle"
                : "pill";
            const iconColor = isTaken
              ? "#4CAF50"
              : isMissing
                ? "#E53935"
                : theme.colors.primary;

            return (
              <TouchableOpacity
                key={`${item.reminder.$id}-${item.time}-${idx}`}
                onPress={() => onTakeMedication(item)}
                activeOpacity={0.7}
                style={[
                  styles.medCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderLeftColor: iconColor,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={iconName as any}
                  size={40}
                  color={iconColor}
                />
                <View style={styles.medInfo}>
                  <Text
                    style={[styles.medName, { color: theme.colors.onSurface }]}
                  >
                    {item.medicationName}
                  </Text>
                  <Text
                    style={[
                      styles.medDetail,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {item.time} — {item.dosage}
                  </Text>
                </View>
                <Text style={[styles.medStatus, { color: iconColor }]}>
                  {isTaken ? t('common.taken') : isMissing ? t('common.missed') : t('medication.take')}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* Message Shortcuts */}
        <Text
          style={[styles.sectionTitle, { color: theme.colors.onBackground }]}
        >
          {t('home.sendMessage')}
        </Text>

        {contacts.length === 0 ? (
          <Card
            style={[
              styles.emptyCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Card.Content style={styles.emptyCardContent}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={40}
                color={theme.colors.outlineVariant}
              />
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {t('home.noContactsYet')}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          contacts.slice(0, 5).map((contact) => (
            <TouchableOpacity
              key={contact.id}
              onPress={() =>
                router.push({
                  pathname: "/conversation",
                  params: {
                    contactId: contact.id,
                    contactName: contact.name,
                    contactRole: contact.role,
                  },
                })
              }
              activeOpacity={0.7}
              style={[
                styles.contactCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <View
                style={[
                  styles.contactAvatar,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text
                  style={[
                    styles.contactAvatarText,
                    { color: theme.colors.onPrimaryContainer },
                  ]}
                >
                  {contact.avatarLabel}
                </Text>
              </View>
              <View style={styles.contactInfo}>
                <Text
                  style={[
                    styles.contactName,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {contact.name}
                </Text>
                <Text
                  style={[
                    styles.contactRole,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {contact.role === "caregiver" ? t('common.caregiver') : t('common.friend')}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="message-text"
                size={28}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <MiniSettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 18,
    marginTop: 2,
  },
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  emergencyButton: {
    backgroundColor: "#D32F2F",
    borderRadius: 24,
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    elevation: 6,
    shadowColor: "#B71C1C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  emergencyText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "bold",
    marginTop: 10,
    letterSpacing: 1,
  },
  emergencySubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 14,
    marginTop: 8,
  },
  emptyCard: {
    borderRadius: 18,
    marginBottom: 16,
    elevation: 1,
  },
  emptyCardContent: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 18,
  },
  medCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    elevation: 2,
    borderLeftWidth: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  medInfo: {
    flex: 1,
    marginLeft: 16,
  },
  medName: {
    fontSize: 22,
    fontWeight: "700",
  },
  medDetail: {
    fontSize: 18,
    marginTop: 4,
  },
  medStatus: {
    fontSize: 18,
    fontWeight: "700",
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  contactAvatarText: {
    fontSize: 20,
    fontWeight: "700",
  },
  contactInfo: {
    flex: 1,
    marginLeft: 14,
  },
  contactName: {
    fontSize: 22,
    fontWeight: "600",
  },
  contactRole: {
    fontSize: 16,
    marginTop: 2,
  },
});
