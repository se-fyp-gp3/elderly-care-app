import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import {
  deleteCustomVoiceRecord,
  getCustomVoicesForCaregiver,
  saveCustomVoiceRecord,
} from "@/lib/custom-voice";
import { createPersonalVoice, readAudioFileAsBase64 } from "@/lib/personal-voice";
import { Caregiver, CustomVoice, CustomVoiceStatus, Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  List,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

type VoiceCreationStep = "idle" | "recording" | "converting" | "cloning" | "done" | "error";

export default function Settings() {
  const {
    user,
    preferences,
    setPreference,
    updatePreferences,
    isTrial,
    userLabels,
    signOut,
  } = useAuth();
  const theme = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [newPreference, setNewPreference] = useState({
    key: "",
    value: "",
  });
  const [caregiverProfile, setCaregiverProfile] = useState<Caregiver | null>(null);
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [selectedElderlyId, setSelectedElderlyId] = useState<string | null>(null);

  // ── Voice recording state ──
  const [recordingSampleUri, setRecordingSampleUri] = useState<string | null>(null);
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Playback state ──
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const samplePlayerRef = useRef<AudioPlayer | null>(null);

  // ── Voice creation state ──
  const [voiceStep, setVoiceStep] = useState<VoiceCreationStep>("idle");
  const [voiceStepMessage, setVoiceStepMessage] = useState("");

  // ── Existing voices ──
  const [existingVoices, setExistingVoices] = useState<CustomVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);

  const loadVoiceSetupData = useCallback(async () => {
    if (!user?.$id) return;

    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      setCaregiverProfile(caregiver);

      if (caregiver?.$id) {
        const elderlyList = await getLinkedElderly(caregiver.$id);
        setLinkedElderly(elderlyList);
        if (elderlyList.length > 0) {
          setSelectedElderlyId((prev) => prev || elderlyList[0].$id);
        }

        // Load existing voices
        setLoadingVoices(true);
        try {
          const voices = await getCustomVoicesForCaregiver(caregiver.$id);
          setExistingVoices(voices);
        } catch (e) {
          console.error("Error loading existing voices:", e);
        } finally {
          setLoadingVoices(false);
        }
      }
    } catch (error) {
      console.error("Error loading caregiver voice setup data:", error);
    }
  }, [user?.$id]);

  useEffect(() => {
    loadVoiceSetupData();
  }, [loadVoiceSetupData]);

  // Clean up sample player on unmount
  useEffect(() => {
    return () => {
      samplePlayerRef.current?.remove();
    };
  }, []);

  // ── Playback handler ──
  const handleTogglePlayback = async () => {
    try {
      if (isPlayingSample && samplePlayerRef.current) {
        samplePlayerRef.current.remove();
        samplePlayerRef.current = null;
        setIsPlayingSample(false);
        return;
      }

      if (!recordingSampleUri) return;

      await setAudioModeAsync({ playsInSilentMode: true });
      const player = createAudioPlayer(recordingSampleUri);
      samplePlayerRef.current = player;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setIsPlayingSample(false);
          samplePlayerRef.current?.remove();
          samplePlayerRef.current = null;
        }
      });
      player.play();
      setIsPlayingSample(true);
    } catch (err) {
      console.error("Sample playback error:", err);
      setIsPlayingSample(false);
    }
  };

  // ── Recording handlers ──
  const handlePickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      console.log("[Voice] Picked file:", asset.name, asset.size, "bytes");

      // Stop any active playback
      if (samplePlayerRef.current) {
        samplePlayerRef.current.remove();
        samplePlayerRef.current = null;
        setIsPlayingSample(false);
      }

      setRecordingSampleUri(asset.uri);
      // Estimate duration from file size (rough: ~16KB/s for typical audio)
      const estimatedSec = asset.size ? Math.round(asset.size / 16000) : 10;
      setRecordingSeconds(estimatedSec);
    } catch (err) {
      console.error("Pick audio file error:", err);
      Alert.alert("Error", "Could not pick audio file.");
    }
  };

  const handleStartVoiceRecording = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Microphone permission is required.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Stop any active sample playback first
      if (samplePlayerRef.current) {
        samplePlayerRef.current.remove();
        samplePlayerRef.current = null;
        setIsPlayingSample(false);
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      console.log("[Voice] Recording started");
      setRecordingSampleUri(null);
      setIsRecordingSample(true);
      setRecordingSeconds(0);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const handleStopVoiceRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      if (recorder.isRecording) {
        await recorder.stop();
      }

      const uri = recorder.uri;
      console.log("[Voice] Recording stopped, uri:", uri, "duration:", recordingSeconds, "s");
      setIsRecordingSample(false);

      if (!uri) {
        Alert.alert("Error", "No recorded sample found.");
        return;
      }

      if (recordingSeconds < 3) {
        setRecordingSampleUri(null);
        setRecordingSeconds(0);
        Alert.alert("Sample too short", "Please record at least 3 seconds.");
        return;
      }

      setRecordingSampleUri(uri);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecordingSample(false);
      Alert.alert("Error", "Could not stop recording.");
    }
  };

  // ── Voice creation handler ──
  const handleCreatePersonalVoice = async () => {
    if (!caregiverProfile?.$id) {
      Alert.alert("Profile missing", "Caregiver profile not found.");
      return;
    }
    if (!selectedElderlyId) {
      Alert.alert("Select elderly", "Please select an elderly profile first.");
      return;
    }
    if (!recordingSampleUri) {
      Alert.alert("Sample needed", "Please record one voice sample first.");
      return;
    }

    try {
      // Step 1: Converting
      setVoiceStep("converting");
      setVoiceStepMessage("Converting audio format...");
      const sampleBase64 = await readAudioFileAsBase64(recordingSampleUri);

      // Step 2: Cloning
      setVoiceStep("cloning");
      setVoiceStepMessage("Creating voice clone...");
      const speakerName = caregiverProfile.name || `caregiver_${caregiverProfile.$id}`;
      const { voiceId, mode } = await createPersonalVoice([sampleBase64], speakerName);

      // Step 3: Saving
      setVoiceStepMessage("Saving voice record...");
      await saveCustomVoiceRecord({
        caregiverId: caregiverProfile.$id,
        caregiverName: speakerName,
        elderlyId: selectedElderlyId,
        voiceId,
        status: CustomVoiceStatus.READY,
      });

      // Done
      setVoiceStep("done");
      const modeLabel = mode === "registered" ? "registered with DashScope" : "reference-based";
      setVoiceStepMessage(`Voice created (${modeLabel})`);
      setRecordingSampleUri(null);
      setRecordingSeconds(0);

      // Refresh voices list
      await loadVoiceSetupData();

      setTimeout(() => setVoiceStep("idle"), 3000);
    } catch (error) {
      console.error("Create personal voice error:", error);
      setVoiceStep("error");
      setVoiceStepMessage(
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  // ── Delete voice handler ──
  const handleDeleteVoice = async (voice: CustomVoice) => {
    Alert.alert(
      "Delete Voice",
      `Delete the voice for "${linkedElderly.find((e) => e.$id === voice.elderly_id)?.name || "Unknown"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingVoiceId(voice.$id);
            try {
              await deleteCustomVoiceRecord(voice.$id);
              setExistingVoices((prev) => prev.filter((v) => v.$id !== voice.$id));
            } catch (e) {
              Alert.alert("Error", "Failed to delete voice record.");
            } finally {
              setDeletingVoiceId(null);
            }
          },
        },
      ],
    );
  };

  // ── Preferences ──
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

  const isCreatingVoice = voiceStep !== "idle" && voiceStep !== "done" && voiceStep !== "error";

  // Helper: get elderly name for a voice
  const getElderlyName = (elderlyId: string) =>
    linkedElderly.find((e) => e.$id === elderlyId)?.name || "Unknown Elderly";

  // Voices for currently selected elderly
  const voicesForSelected = existingVoices.filter(
    (v) => v.elderly_id === selectedElderlyId,
  );

  return (
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
          Manage your caregiver preferences
        </Text>
      </View>

      {/* Trial status banner */}
      <Banner
        visible={!isTrial}
        icon="lock"
        actions={[]}
        style={styles.trialBanner}
      >
        Some settings are locked. Contact support to upgrade your account.
      </Banner>

      {/* ── Account ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Account
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Account Status"
          titleStyle={styles.listTitle}
          description={
            userLabels.length > 0
              ? userLabels.join(", ")
              : "No labels assigned"
          }
          descriptionStyle={styles.listDescription}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="shield-account"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
        {userLabels.length > 0 && (
          <View style={styles.labelsContainer}>
            {userLabels.map((label, index) => (
              <Chip
                key={index}
                compact
                style={{ backgroundColor: theme.colors.primaryContainer }}
                textStyle={{ color: theme.colors.onPrimaryContainer }}
              >
                {label}
              </Chip>
            ))}
          </View>
        )}
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title="User Role"
          titleStyle={styles.listTitle}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-switch"
                size={26}
                color={theme.colors.primary}
              />
            </View>
          )}
          style={styles.listItem}
        />
        <View style={styles.segmentedContainer}>
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
        </View>
      </Card>

      {/* ── Display ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Display
      </Text>
      <Card
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface },
          !isTrial && styles.disabledCard,
        ]}
      >
        <List.Item
          title={`Font Size${!isTrial ? " 🔒" : ""}`}
          titleStyle={styles.listTitle}
          description={preferences.fontSize || "medium"}
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
        </View>
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title={`AI Voice Intonation${!isTrial ? " 🔒" : ""}`}
          titleStyle={styles.listTitle}
          description={preferences.voiceTone || "gentle"}
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
          style={styles.listItem}
        />
        <View style={styles.segmentedContainer}>
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
        </View>
      </Card>

      {/* ── Notifications ── */}
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
                value={preferences.notifications !== false}
                onValueChange={(value) =>
                  handleSetPreference("notifications", value)
                }
              />
            </View>
          )}
          style={styles.listItem}
        />
      </Card>

      {/* ── Personal AI Voice ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Personal AI Voice
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={{ paddingVertical: 20 }}>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}
          >
            Record your voice to create a personal voice clone for selected
            elderly. The AI will speak in your voice when chatting with them.
          </Text>

          {/* Elderly selector */}
          <Text variant="titleSmall" style={styles.voiceSectionLabel}>
            Select Elderly
          </Text>
          {linkedElderly.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="account-off"
                size={32}
                color={theme.colors.outlineVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                No linked elderly found. Link an elderly first.
              </Text>
            </View>
          ) : (
            <View style={styles.elderlyChipsWrap}>
              {linkedElderly.map((elderly) => {
                const selected = selectedElderlyId === elderly.$id;
                const hasVoice = existingVoices.some(
                  (v) =>
                    v.elderly_id === elderly.$id &&
                    v.status === CustomVoiceStatus.READY,
                );
                return (
                  <Chip
                    key={elderly.$id}
                    selected={selected}
                    onPress={() => setSelectedElderlyId(elderly.$id)}
                    icon={hasVoice ? "check-circle" : undefined}
                    style={[
                      styles.elderlyChip,
                      selected && {
                        backgroundColor: theme.colors.primaryContainer,
                      },
                    ]}
                  >
                    {elderly.name || "Unnamed"}
                  </Chip>
                );
              })}
            </View>
          )}

          <Divider style={styles.sectionDivider} />

          {/* Recording section */}
          <Text variant="titleSmall" style={styles.voiceSectionLabel}>
            Voice Sample
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
          >
            Record at least 3 seconds of your voice, or pick an existing audio
            file. Speak naturally in a quiet environment.
          </Text>

          {/* Recording indicator */}
          {isRecordingSample && (
            <View
              style={[
                styles.recordingIndicator,
                { backgroundColor: theme.colors.errorContainer },
              ]}
            >
              <View style={styles.recordingDot} />
              <Text
                variant="bodyMedium"
                style={{
                  color: theme.colors.onErrorContainer,
                  fontWeight: "600",
                }}
              >
                Recording... {recordingSeconds}s
              </Text>
            </View>
          )}

          {recordingSampleUri && !isRecordingSample && (
            <View
              style={[
                styles.sampleReadyBanner,
                { backgroundColor: theme.colors.secondaryContainer },
              ]}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={theme.colors.onSecondaryContainer}
              />
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSecondaryContainer,
                  marginLeft: 8,
                  flex: 1,
                }}
              >
                Sample ready ({recordingSeconds}s)
              </Text>
              <IconButton
                icon={isPlayingSample ? "stop" : "play"}
                size={22}
                onPress={handleTogglePlayback}
                iconColor={theme.colors.onSecondaryContainer}
                style={{ margin: 0 }}
              />
            </View>
          )}

          <View style={styles.voiceActionsRow}>
            <Button
              mode={isRecordingSample ? "contained" : "outlined"}
              onPress={
                isRecordingSample
                  ? handleStopVoiceRecording
                  : handleStartVoiceRecording
              }
              disabled={isCreatingVoice}
              icon={isRecordingSample ? "stop" : "microphone"}
              buttonColor={isRecordingSample ? theme.colors.error : undefined}
              textColor={isRecordingSample ? theme.colors.onError : undefined}
              style={styles.actionButton}
            >
              {isRecordingSample ? "Stop" : "Record"}
            </Button>
            <Button
              mode="outlined"
              onPress={handlePickAudioFile}
              disabled={isCreatingVoice || isRecordingSample}
              icon="file-music"
              style={styles.actionButton}
            >
              Pick File
            </Button>
          </View>
          <View style={[styles.voiceActionsRow, { marginTop: 16 }]}>
            <Button
              mode="contained"
              onPress={handleCreatePersonalVoice}
              disabled={
                isCreatingVoice ||
                !recordingSampleUri ||
                !selectedElderlyId ||
                linkedElderly.length === 0
              }
              icon="creation"
              style={styles.actionButton}
            >
              Create Voice
            </Button>
          </View>

          {/* Voice creation progress */}
          {voiceStep !== "idle" && (
            <View
              style={[
                styles.progressBanner,
                {
                  backgroundColor:
                    voiceStep === "error"
                      ? theme.colors.errorContainer
                      : voiceStep === "done"
                        ? theme.colors.secondaryContainer
                        : theme.colors.surfaceVariant,
                },
              ]}
            >
              {isCreatingVoice && <ActivityIndicator size="small" />}
              {voiceStep === "done" && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color={theme.colors.onSecondaryContainer}
                />
              )}
              {voiceStep === "error" && (
                <MaterialCommunityIcons
                  name="alert-circle"
                  size={20}
                  color={theme.colors.error}
                />
              )}
              <Text
                variant="bodySmall"
                style={[
                  styles.progressText,
                  voiceStep === "error" && { color: theme.colors.error },
                ]}
              >
                {voiceStepMessage}
              </Text>
              {voiceStep === "error" && (
                <Button
                  mode="text"
                  compact
                  onPress={() => setVoiceStep("idle")}
                >
                  Dismiss
                </Button>
              )}
            </View>
          )}

          <Divider style={styles.sectionDivider} />

          {/* Existing voices for selected elderly */}
          <Text variant="titleSmall" style={styles.voiceSectionLabel}>
            Existing Voices{" "}
            {selectedElderlyId
              ? `for ${getElderlyName(selectedElderlyId)}`
              : ""}
          </Text>

          {loadingVoices ? (
            <ActivityIndicator size="small" style={{ marginTop: 12 }} />
          ) : voicesForSelected.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="volume-off"
                size={28}
                color={theme.colors.outlineVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                No voice clones yet. Record and create one above.
              </Text>
            </View>
          ) : (
            voicesForSelected.map((voice) => (
              <View
                key={voice.$id}
                style={[
                  styles.voiceRow,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <View style={styles.voiceRowInfo}>
                  <MaterialCommunityIcons
                    name="account-voice"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                      {voice.caregiver_name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                      numberOfLines={1}
                    >
                      {voice.voice_id.startsWith("ref:")
                        ? "Reference voice"
                        : `ID: ${voice.voice_id}`}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Status: {voice.status}
                      {voice.created_at
                        ? ` · ${new Date(voice.created_at).toLocaleDateString()}`
                        : ""}
                    </Text>
                  </View>
                </View>
                <IconButton
                  icon="delete"
                  size={20}
                  iconColor={theme.colors.error}
                  onPress={() => handleDeleteVoice(voice)}
                  disabled={deletingVoiceId === voice.$id}
                />
                {deletingVoiceId === voice.$id && (
                  <ActivityIndicator size="small" />
                )}
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* ── Voice Reply Language ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Voice Reply Language
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Reply Language"
          titleStyle={styles.listTitle}
          description="Set the language for AI voice replies to elderly users"
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
          {(
            [
              { key: "cantonese", label: "粵語" },
              { key: "mandarin", label: "普通話" },
              { key: "english", label: "English" },
            ] as const
          ).map((opt) => {
            const currentLang =
              (preferences.voiceReplyLang as string) ?? "cantonese";
            return (
              <Chip
                key={opt.key}
                selected={currentLang === opt.key}
                onPress={() =>
                  handleSetPreference("voiceReplyLang", opt.key)
                }
                style={[
                  styles.langChip,
                  currentLang === opt.key && {
                    backgroundColor: theme.colors.primaryContainer,
                  },
                ]}
                textStyle={
                  currentLang === opt.key
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
            );
          })}
        </View>
      </Card>

      {/* ── Custom Settings ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Custom Settings
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={{ paddingVertical: 20 }}>
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons
              name="cog-outline"
              size={22}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={{ marginLeft: 8, fontWeight: "600" }}
            >
              Add Custom Setting
            </Text>
          </View>
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
            icon="plus"
            style={{ borderRadius: 12 }}
          >
            Add Setting
          </Button>
        </Card.Content>
      </Card>

      {/* ── Current Settings ── */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={{ paddingVertical: 20 }}>
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={22}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={{ marginLeft: 8, fontWeight: "600" }}
            >
              Current Settings
            </Text>
          </View>
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
                  icon="delete"
                  style={{ borderRadius: 12 }}
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

      {/* ── About ── */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        About
      </Text>
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

      {/* ── Sign Out ── */}
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
  trialBanner: {
    marginBottom: 16,
    borderRadius: 12,
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
  disabledCard: {
    opacity: 0.6,
  },
  segmentedButtons: {
    marginTop: 4,
  },
  segmentedContainer: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  roleWarning: {
    marginTop: 8,
    color: "#f57c00",
    fontStyle: "italic",
  },
  labelsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  // ── Voice section styles ──
  voiceSectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: "600",
  },
  elderlyChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  elderlyChip: {
    marginBottom: 4,
  },
  sectionDivider: {
    marginVertical: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 8,
    gap: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D32F2F",
  },
  sampleReadyBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  voiceActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap",
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
    borderRadius: 12,
  },
  progressBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    gap: 10,
  },
  progressText: {
    flex: 1,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  voiceRowInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  // ── Language chips ──
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
  // ── Input ──
  input: {
    marginBottom: 12,
  },
  // ── Preferences ──
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  preferenceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
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
  // ── Logout ──
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
});
