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

        {/* ───────── Personal AI Voice Section ───────── */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.voiceSectionHeader}>
              <MaterialCommunityIcons
                name="account-voice"
                size={24}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.voiceSectionTitle}>
                Personal AI Voice
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.hintText}>
              Record your voice to create a personal voice clone for selected
              elderly. The AI will speak in your voice when chatting with them.
            </Text>

            {/* Elderly selector */}
            <Text variant="labelLarge" style={styles.voiceSectionLabel}>
              Select Elderly
            </Text>
            {linkedElderly.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="account-off"
                  size={32}
                  color={theme.colors.outlineVariant}
                />
                <Text variant="bodySmall" style={styles.hintText}>
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
            <Text variant="labelLarge" style={styles.voiceSectionLabel}>
              Voice Sample
            </Text>
            <Text variant="bodySmall" style={styles.hintText}>
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
                  style={{ color: theme.colors.onErrorContainer, fontWeight: "600" }}
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
            <View style={[styles.voiceActionsRow, { marginTop: 0 }]}>
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
            <Text variant="labelLarge" style={styles.voiceSectionLabel}>
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
                <Text variant="bodySmall" style={styles.hintText}>
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

        {/* ───────── Voice Reply Language Section ───────── */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons
                name="translate"
                size={22}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={{ marginLeft: 8, fontWeight: "600" }}>
                Voice Reply Language
              </Text>
            </View>
            <Text variant="bodySmall" style={[styles.hintText, { marginBottom: 12 }]}>
              Set the language for AI voice replies to elderly users.
            </Text>
            <View style={styles.langChipRow}>
              {([
                { key: "cantonese", label: "粵語" },
                { key: "mandarin", label: "普通話" },
                { key: "english", label: "English" },
              ] as const).map((opt) => {
                const currentLang = (preferences.voiceReplyLang as string) ?? "cantonese";
                return (
                  <Chip
                    key={opt.key}
                    selected={currentLang === opt.key}
                    onPress={() => handleSetPreference("voiceReplyLang", opt.key)}
                    style={[
                      styles.langChip,
                      currentLang === opt.key && { backgroundColor: theme.colors.primaryContainer },
                    ]}
                    textStyle={currentLang === opt.key ? { color: theme.colors.onPrimaryContainer, fontWeight: "600" } : undefined}
                    showSelectedOverlay
                  >
                    {opt.label}
                  </Chip>
                );
              })}
            </View>
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

        <Button
          mode="contained"
          buttonColor={theme.colors.error}
          onPress={signOut}
          style={styles.card}
        >
          Log Out
        </Button>
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
  hintText: {
    marginTop: 6,
    color: "#666",
  },
  // ── Voice section styles ──
  voiceSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  voiceSectionTitle: {
    marginLeft: 8,
    fontWeight: "bold",
  },
  voiceSectionLabel: {
    marginTop: 12,
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
    marginVertical: 14,
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
    borderRadius: 10,
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
    padding: 10,
    borderRadius: 10,
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
  },
  progressBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    gap: 10,
  },
  progressText: {
    flex: 1,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  voiceRowInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  langChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  langChip: {
    borderRadius: 20,
  },
});
