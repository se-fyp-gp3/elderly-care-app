import { VERSION_OPTIONS } from "@/components/MiniSettingsModal";
import { useAuth } from "@/lib/auth-context";
import { getCustomVoicesForElderly } from "@/lib/custom-voice";
import {
    getElderlyByUserId,
    getLinkedCaregivers,
    updateElderlyEmergencyContact,
} from "@/lib/elderly";
import { useFontSize } from "@/lib/font-size-context";
import { useLanguage } from "@/lib/language-context";
import { buildAvatarUrl, updateProfileAvatar, uploadAvatar } from "@/lib/user";
import { Caregiver, CustomVoice, Elderly } from "@/types/appwrite";
import { FontSize, UIVersion } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useColorScheme,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Avatar,
    Button,
    Card,
    Chip,
    List,
    SegmentedButtons,
    Switch,
    Text,
    useTheme,
} from "react-native-paper";

export default function ElderlySettings() {
  const { user, preferences, updatePreferences, setPreference, signOut } =
    useAuth();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation();
  const { fontSize, setFontSize } = useFontSize();
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const [notifications, setNotifications] = React.useState(
    preferences.notifications ?? true,
  );

  // ── UI Version state ──
  const [versionPickerVisible, setVersionPickerVisible] = useState(false);
  const currentVersion =
    (preferences.uiVersion as UIVersion) || UIVersion.Default;

  const handleVersionChange = async (version: UIVersion) => {
    await setPreference("uiVersion", version);
    setVersionPickerVisible(false);
    router.replace("/(elderly-tabs)/" as any);
  };

  // ── Emergency contact state ──
  const [elderlyProfile, setElderlyProfile] = useState<Elderly | null>(null);
  const [linkedCaregivers, setLinkedCaregivers] = useState<Caregiver[]>([]);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(
    preferences.aiVoiceEnabled ?? false,
  );
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<CustomVoice[]>([]);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceReplyLang, setVoiceReplyLang] = useState<string>(
    (preferences.voiceReplyLang as string) ?? "cantonese",
  );

  // ── Avatar state ──
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleChangeAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploadingAvatar(true);
      const fileId = await uploadAvatar(result.assets[0]);
      await updateProfileAvatar(elderlyProfile!.$id, "elderly", fileId);
      setAvatarFileId(fileId);
      Alert.alert(t("settings.avatarUpdated"));
    } catch (e) {
      console.error("Avatar upload error:", e);
      Alert.alert(t("settings.avatarUploadFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Load elderly profile + linked caregivers
  const loadEmergencyData = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await getElderlyByUserId(user.$id);
      if (!profile) return;
      setElderlyProfile(profile);
      setAvatarFileId((profile as any).avatar_file_id ?? null);
      setEmergencyContact(profile.emergency_contact ?? null);
      const caregivers = await getLinkedCaregivers(profile.$id);
      setLinkedCaregivers(caregivers);

      const customVoices = await getCustomVoicesForElderly(profile.$id);
      const caregiverIdSet = new Set(caregivers.map((c) => c.$id));
      const filtered = customVoices.filter((voice) =>
        caregiverIdSet.has(voice.caregiver_id),
      );
      setVoiceOptions(filtered);
    } catch (e) {
      console.error("Error loading emergency data:", e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadEmergencyData();
    }, [loadEmergencyData]),
  );

  useEffect(() => {
    setAiVoiceEnabled(preferences.aiVoiceEnabled ?? false);
  }, [preferences.aiVoiceEnabled]);

  // Get the name of the currently‐selected emergency contact
  const selectedCaregiverName = linkedCaregivers.find(
    (c) => c.phone === emergencyContact,
  )?.name;

  const dedupedVoiceOptions = useMemo(() => {
    return Array.from(
      new Map(
        voiceOptions.map((voice) => [voice.caregiver_id, voice]),
      ).values(),
    );
  }, [voiceOptions]);

  const hasVoiceOptions = dedupedVoiceOptions.length > 0;

  const selectedVoice = dedupedVoiceOptions.find(
    (voice) => voice.voice_id === preferences.aiVoiceId,
  );

  const handleSelectEmergencyContact = async (caregiver: Caregiver) => {
    if (!elderlyProfile) return;
    setSaving(true);
    try {
      await updateElderlyEmergencyContact(elderlyProfile.$id, caregiver.phone);
      setEmergencyContact(caregiver.phone);
      setPickerVisible(false);
      Alert.alert(
        "Saved",
        `Emergency contact set to ${caregiver.name ?? caregiver.phone}`,
      );
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

  const handleAiVoiceToggle = async (value: boolean) => {
    if (value && !hasVoiceOptions) {
      Alert.alert(
        "No available voice",
        "No linked caregiver voice found. Please ask caregiver to create one first.",
      );
      return;
    }

    setAiVoiceEnabled(value);
    await updatePreferences({
      ...preferences,
      aiVoiceEnabled: value,
    });
  };

  useEffect(() => {
    if (!hasVoiceOptions && aiVoiceEnabled) {
      setAiVoiceEnabled(false);
      void updatePreferences({
        ...preferences,
        aiVoiceEnabled: false,
      });
    }
  }, [aiVoiceEnabled, hasVoiceOptions, preferences, updatePreferences]);

  const handleSelectAiVoice = async (voice: CustomVoice) => {
    setVoiceSaving(true);
    try {
      await updatePreferences({
        ...preferences,
        aiVoiceEnabled: true,
        aiVoiceId: voice.voice_id,
        aiVoiceCaregiverId: voice.caregiver_id,
        aiVoiceCaregiverName: voice.caregiver_name,
      });
      setAiVoiceEnabled(true);
      setVoicePickerVisible(false);
      Alert.alert("Saved", `AI voice set to ${voice.caregiver_name}.`);
    } catch (e) {
      Alert.alert("Error", "Failed to save AI voice selection.");
    } finally {
      setVoiceSaving(false);
    }
  };

  const handleClearAiVoice = async () => {
    setVoiceSaving(true);
    try {
      await updatePreferences({
        ...preferences,
        aiVoiceEnabled: false,
        aiVoiceId: undefined,
        aiVoiceCaregiverId: undefined,
        aiVoiceCaregiverName: undefined,
      });
      setAiVoiceEnabled(false);
      Alert.alert("Cleared", "AI voice selection has been removed.");
    } catch {
      Alert.alert("Error", "Failed to clear AI voice selection.");
    } finally {
      setVoiceSaving(false);
    }
  };

  const handleVoiceReplyLangChange = async (lang: string) => {
    setVoiceReplyLang(lang);
    await updatePreferences({
      ...preferences,
      voiceReplyLang: lang,
    });
  };

  const LANG_OPTIONS = [
    { key: "cantonese", label: t("settings.cantonese") },
    { key: "mandarin", label: t("settings.mandarin") },
    { key: "english", label: t("settings.english") },
  ] as const;

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            {t("settings.title")}
          </Text>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          >
            {t("settings.customizeExperience")}
          </Text>
        </View>

        {/* ── Profile Avatar ── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar || !elderlyProfile}
            activeOpacity={0.7}
          >
            <View style={styles.avatarWrapper}>
              {avatarFileId ? (
                <Image
                  source={{ uri: buildAvatarUrl(avatarFileId).toString() }}
                  style={styles.avatarImage}
                />
              ) : (
                <Avatar.Text
                  size={80}
                  label={(user?.name ?? "??").substring(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  labelStyle={{
                    color: theme.colors.onPrimaryContainer,
                    fontWeight: "600",
                    fontSize: 28,
                  }}
                />
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
              <View
                style={[
                  styles.avatarEditBadge,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <MaterialCommunityIcons
                  name="camera"
                  size={14}
                  color={theme.colors.onPrimary}
                />
              </View>
            </View>
          </TouchableOpacity>
          <Text
            variant="titleMedium"
            style={{
              marginTop: 10,
              fontWeight: "600",
              color: theme.colors.onSurface,
            }}
          >
            {user?.name ?? ""}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("settings.changeAvatar")}
          </Text>
        </View>

        {/* Notifications */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("settings.notifications")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.pushNotifications")}
            titleStyle={styles.listTitle}
            description={t("settings.pushNotificationsDesc")}
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
          {t("settings.emergencyContact")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.emergencyContact")}
            titleStyle={styles.listTitle}
            description={
              emergencyContact
                ? `${selectedCaregiverName ?? t("common.caregiver")} (${emergencyContact})`
                : t("settings.emergencyContactNotSet")
            }
            descriptionStyle={styles.listDescription}
            left={() => (
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(211,47,47,0.12)"
                      : "#FFEBEE",
                  },
                ]}
              >
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
              <View
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <List.Item
                title={t("settings.clearEmergencyContact")}
                titleStyle={[styles.listTitle, { color: theme.colors.error }]}
                left={() => (
                  <View
                    style={[
                      styles.iconContainer,
                      {
                        backgroundColor: isDark
                          ? "rgba(211,47,47,0.12)"
                          : "#FFEBEE",
                      },
                    ]}
                  >
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
          {t("settings.display")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.fontSize")}
            titleStyle={styles.listTitle}
            description={fontSize}
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
            style={styles.listItem}
          />
          <View style={styles.segmentedContainer}>
            <SegmentedButtons
              value={fontSize}
              onValueChange={(value) => {
                setFontSize(value as FontSize);
                setPreference("fontSize", value);
              }}
              buttons={[
                { value: FontSize.Small, label: t("settings.fontSizeSmall") },
                { value: FontSize.Medium, label: t("settings.fontSizeMedium") },
                { value: FontSize.Large, label: t("settings.fontSizeLarge") },
              ]}
              style={styles.segmentedButtons}
              density="regular"
            />
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
          {/* ── Interface Language ── */}
          <List.Item
            title={t("settings.interfaceLanguage")}
            titleStyle={styles.listTitle}
            description={t("settings.interfaceLanguageDesc")}
            descriptionStyle={styles.listDescription}
            left={() => (
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name="translate"
                  size={26}
                  color={theme.colors.primary}
                />
              </View>
            )}
            style={styles.listItem}
          />
          <View style={styles.langChipRow}>
            {[
              { key: "zh" as const, label: t("settings.languageChinese") },
              {
                key: "zh-Hant" as const,
                label: t("settings.languageTraditionalChinese"),
              },
              { key: "en" as const, label: t("settings.languageEnglish") },
            ].map((opt) => (
              <Chip
                key={opt.key}
                selected={language === opt.key}
                onPress={() => setLanguage(opt.key)}
                style={[
                  styles.langChip,
                  language === opt.key && {
                    backgroundColor: theme.colors.primaryContainer,
                  },
                ]}
                textStyle={
                  language === opt.key
                    ? {
                        color: theme.colors.onPrimaryContainer,
                        fontWeight: "600",
                      }
                    : undefined
                }
                showSelectedOverlay
              >
                {opt.label}
              </Chip>
            ))}
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
          <List.Item
            title={t("settings.aiVoiceIntonation")}
            titleStyle={styles.listTitle}
            description={preferences.voiceTone || t("settings.friendly")}
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
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
          <List.Item
            title={t("settings.aiChatVoicePlayback")}
            titleStyle={styles.listTitle}
            description={
              aiVoiceEnabled ? t("settings.enabled") : t("settings.disabled")
            }
            descriptionStyle={styles.listDescription}
            left={() => (
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name={aiVoiceEnabled ? "volume-high" : "volume-off"}
                  size={26}
                  color={theme.colors.primary}
                />
              </View>
            )}
            right={() => (
              <View style={styles.rightContainer}>
                <Switch
                  value={aiVoiceEnabled}
                  onValueChange={handleAiVoiceToggle}
                  disabled={!hasVoiceOptions}
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
            title={t("settings.caregiverVoice")}
            titleStyle={styles.listTitle}
            description={
              selectedVoice
                ? `${selectedVoice.caregiver_name} (${selectedVoice.voice_id})`
                : t("settings.voiceNotSelected")
            }
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
            onPress={() => setVoicePickerVisible(true)}
            style={styles.listItem}
          />
          {selectedVoice && (
            <View>
              <View
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <List.Item
                title={t("settings.clearAiVoice")}
                titleStyle={[styles.listTitle, { color: theme.colors.error }]}
                left={() => (
                  <View
                    style={[
                      styles.iconContainer,
                      {
                        backgroundColor: isDark
                          ? "rgba(211,47,47,0.12)"
                          : "#FFEBEE",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="delete"
                      size={26}
                      color={theme.colors.error}
                    />
                  </View>
                )}
                onPress={handleClearAiVoice}
                style={styles.listItem}
              />
            </View>
          )}
          {aiVoiceEnabled && (
            <View>
              <View
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <List.Item
                title={t("settings.voiceReplyLanguage")}
                titleStyle={styles.listTitle}
                description={t("settings.replyLanguageDesc")}
                descriptionStyle={styles.listDescription}
                left={() => (
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons
                      name="translate"
                      size={26}
                      color={theme.colors.primary}
                    />
                  </View>
                )}
                style={styles.listItem}
              />
              <View style={styles.langChipRow}>
                {LANG_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.key}
                    selected={voiceReplyLang === opt.key}
                    onPress={() => handleVoiceReplyLangChange(opt.key)}
                    style={[
                      styles.langChip,
                      voiceReplyLang === opt.key && {
                        backgroundColor: theme.colors.primaryContainer,
                      },
                    ]}
                    textStyle={
                      voiceReplyLang === opt.key
                        ? {
                            color: theme.colors.onPrimaryContainer,
                            fontWeight: "600",
                          }
                        : undefined
                    }
                    showSelectedOverlay
                  >
                    {opt.label}
                  </Chip>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Account */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("settings.account")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.role")}
            titleStyle={styles.listTitle}
            description={t("settings.roleElderly")}
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

        {/* Connect Caregiver — only when no caregivers linked */}
        {linkedCaregivers.length === 0 && elderlyProfile && (
          <>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              {t("common.caregiver")}
            </Text>
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
            >
              <List.Item
                title={t("settings.connectCaregiver")}
                titleStyle={styles.listTitle}
                description={t("settings.connectCaregiverDesc")}
                descriptionStyle={styles.listDescription}
                left={() => (
                  <View
                    style={[
                      styles.iconContainer,
                      {
                        backgroundColor: isDark
                          ? "rgba(33,150,243,0.15)"
                          : "#E3F2FD",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account-plus"
                      size={26}
                      color="#2196F3"
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
                onPress={() =>
                  router.push("/(elderly-tabs)/connect-caregiver" as any)
                }
                style={styles.listItem}
              />
            </Card>
          </>
        )}

        {/* Interface Style */}
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {t("settings.interfaceStyle")}
        </Text>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.uiVersion")}
            titleStyle={styles.listTitle}
            description={
              currentVersion === UIVersion.Simplified
                ? t("settings.uiSimplified")
                : currentVersion === UIVersion.Accessible
                  ? t("settings.uiAccessible")
                  : t("settings.uiDefault")
            }
            descriptionStyle={styles.listDescription}
            left={() => (
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name="monitor-cellphone"
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
            onPress={() => setVersionPickerVisible(true)}
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
                style={{
                  marginLeft: 10,
                  color: theme.colors.onPrimaryContainer,
                  fontWeight: "bold",
                }}
              >
                {t("settings.needHelp")}
              </Text>
            </View>
            <Text
              variant="bodyLarge"
              style={{
                color: theme.colors.onPrimaryContainer,
                marginTop: 12,
                lineHeight: 26,
              }}
            >
              {t("settings.needHelpDesc")}
            </Text>
          </Card.Content>
        </Card>

        {/* About App */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <List.Item
            title={t("settings.aboutApp")}
            titleStyle={styles.listTitle}
            description={t("settings.version")}
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
          {t("common.signOut")}
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
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                    {t("settings.selectEmergencyContact")}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.onSurface}
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginBottom: 16,
                  }}
                >
                  Choose from your linked caregivers
                </Text>

                {linkedCaregivers.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <MaterialCommunityIcons
                      name="account-off"
                      size={40}
                      color={theme.colors.outlineVariant}
                    />
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 10,
                        textAlign: "center",
                      }}
                    >
                      {t("settings.noLinkedCaregivers")}
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
                          label={(cg.name ?? "??")
                            .substring(0, 2)
                            .toUpperCase()}
                          style={{
                            backgroundColor: theme.colors.tertiaryContainer,
                          }}
                          labelStyle={{
                            color: theme.colors.onTertiaryContainer,
                            fontWeight: "600",
                          }}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text
                            variant="titleMedium"
                            style={{ fontWeight: "600" }}
                          >
                            {cg.name ?? t("common.unknown")}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: theme.colors.onSurfaceVariant,
                              marginTop: 2,
                            }}
                          >
                            {cg.phone ?? t("common.noPhoneNumber")}
                          </Text>
                        </View>
                        {isSelected && (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={24}
                            color={theme.colors.primary}
                          />
                        )}
                        {saving && isSelected && (
                          <ActivityIndicator
                            size="small"
                            style={{ marginLeft: 8 }}
                          />
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

      {/* ── UI Version Picker Modal ── */}
      <Modal
        visible={versionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVersionPickerVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setVersionPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                    {t("settings.chooseInterfaceStyle")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setVersionPickerVisible(false)}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.onSurface}
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginBottom: 16,
                  }}
                >
                  {t("settings.selectLayoutDesc")}
                </Text>

                {VERSION_OPTIONS.map((option) => {
                  const isSelected = currentVersion === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => handleVersionChange(option.key)}
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
                      <View
                        style={[
                          styles.iconContainer,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary + "20"
                              : isDark
                                ? "rgba(33,150,243,0.12)"
                                : "#E8F0FE",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={option.icon as any}
                          size={26}
                          color={
                            isSelected
                              ? theme.colors.onPrimary
                              : theme.colors.onSurfaceVariant
                          }
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          variant="titleMedium"
                          style={{ fontWeight: "600" }}
                        >
                          {t(option.labelKey)}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {t(option.descKey)}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={24}
                          color={theme.colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={voicePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVoicePickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setVoicePickerVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                    {t("settings.selectCaregiverVoice")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setVoicePickerVisible(false)}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.onSurface}
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginBottom: 16,
                  }}
                >
                  {t("settings.chooseFromVoices")}
                </Text>

                {dedupedVoiceOptions.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <MaterialCommunityIcons
                      name="account-voice-off"
                      size={40}
                      color={theme.colors.outlineVariant}
                    />
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 10,
                        textAlign: "center",
                      }}
                    >
                      {t("settings.noCaregiverVoice")}
                    </Text>
                  </View>
                ) : (
                  dedupedVoiceOptions.map((voice) => {
                    const isSelected = voice.voice_id === preferences.aiVoiceId;
                    return (
                      <TouchableOpacity
                        key={voice.$id}
                        onPress={() => handleSelectAiVoice(voice)}
                        disabled={voiceSaving}
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
                          label={(voice.caregiver_name ?? "CG")
                            .substring(0, 2)
                            .toUpperCase()}
                          style={{
                            backgroundColor: theme.colors.tertiaryContainer,
                          }}
                          labelStyle={{
                            color: theme.colors.onTertiaryContainer,
                            fontWeight: "600",
                          }}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text
                            variant="titleMedium"
                            style={{ fontWeight: "600" }}
                          >
                            {voice.caregiver_name ?? t("common.caregiver")}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: theme.colors.onSurfaceVariant,
                              marginTop: 2,
                            }}
                          >
                            {voice.voice_id}
                          </Text>
                        </View>
                        {isSelected && (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={24}
                            color={theme.colors.primary}
                          />
                        )}
                        {voiceSaving && isSelected && (
                          <ActivityIndicator
                            size="small"
                            style={{ marginLeft: 8 }}
                          />
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
  avatarSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
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
  langChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  langChip: {
    borderRadius: 20,
  },
  segmentedContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  segmentedButtons: {
    borderRadius: 12,
  },
});
