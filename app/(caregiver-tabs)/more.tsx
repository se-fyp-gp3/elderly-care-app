import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import {
    RECORDING_PROMPTS,
    useCustomVoice,
} from "@/lib/hooks/useCustomVoice";
import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    View
} from "react-native";
import {
    ActivityIndicator,
    Button,
    Card,
    Chip,
    Divider,
    IconButton,
    List,
    Menu,
    Text,
    useTheme,
} from "react-native-paper";

export default function More() {
  const { signOut, user } = useAuth();
  const theme = useTheme();

  // Caregiver & linked elderly
  const [caregiverId, setCaregiverId] = useState<string | null>(null);
  const [caregiverName, setCaregiverName] = useState("Caregiver");
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [selectedElderlyId, setSelectedElderlyId] = useState<string | null>(
    null,
  );
  const [elderlyMenuVisible, setElderlyMenuVisible] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Custom voice hook
  const {
    samples,
    isRecording,
    isUploading,
    isPlaying,
    currentPromptIndex,
    existingVoices,
    errorMessage,
    startRecording,
    stopRecording,
    deleteSample,
    uploadAndCloneVoice,
    previewSample,
    stopPreview,
    loadExistingVoices,
    deleteVoiceRecord,
  } = useCustomVoice();

  // -----------------------------------------------------------------------
  // Load caregiver profile & linked elderly on mount
  // -----------------------------------------------------------------------
  const loadProfile = useCallback(async () => {
    if (!user?.$id) return;
    setIsLoadingProfile(true);
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (caregiver) {
        setCaregiverId(caregiver.$id);
        setCaregiverName(caregiver.name || "Caregiver");
        const elderly = await getLinkedElderly(caregiver.$id);
        setLinkedElderly(elderly);
        if (elderly.length > 0) {
          setSelectedElderlyId(elderly[0].$id);
        }
        await loadExistingVoices(caregiver.$id);
      }
    } catch (error) {
      console.error("Error loading caregiver profile:", error);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user?.$id, loadExistingVoices]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleUpload = async () => {
    if (!caregiverId || !selectedElderlyId) {
      const msg = "Please select an elderly user to link this voice to.";
      Platform.OS === "web" ? alert(msg) : Alert.alert("Notice", msg);
      return;
    }
    await uploadAndCloneVoice(caregiverId, caregiverName, selectedElderlyId);
  };

  const handleDeleteVoice = (docId: string) => {
    const doDelete = () => deleteVoiceRecord(docId);
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this voice?"))
        doDelete();
    } else {
      Alert.alert("Delete Voice", "Are you sure you want to delete this voice?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const selectedElderlyName =
    linkedElderly.find((e) => e.$id === selectedElderlyId)?.name ||
    "Select elderly";

  const currentPrompt = RECORDING_PROMPTS[currentPromptIndex];

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------
  if (isLoadingProfile) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator animating size="large" />
        <Text style={{ marginTop: 12 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          More
        </Text>
      </View>

      {/* ============================================================== */}
      {/* Custom Voice Recording Section                                 */}
      {/* ============================================================== */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Custom Voice Recording
      </Text>
      <Text
        variant="bodySmall"
        style={[styles.sectionSubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        Record your voice so the AI can read messages to your elderly in your
        voice. You can record up to 5 samples (3-30 seconds each).
      </Text>

      {/* Elderly selector */}
      {linkedElderly.length > 0 && (
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
        >
          <List.Item
            title="Elderly"
            description={selectedElderlyName}
            left={() => (
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name="account-heart"
                  size={24}
                  color={theme.colors.primary}
                />
              </View>
            )}
            right={() => (
              <Menu
                visible={elderlyMenuVisible}
                onDismiss={() => setElderlyMenuVisible(false)}
                anchor={
                  <IconButton
                    icon="chevron-down"
                    onPress={() => setElderlyMenuVisible(true)}
                  />
                }
              >
                {linkedElderly.map((elderly) => (
                  <Menu.Item
                    key={elderly.$id}
                    onPress={() => {
                      setSelectedElderlyId(elderly.$id);
                      setElderlyMenuVisible(false);
                    }}
                    title={elderly.name}
                  />
                ))}
              </Menu>
            )}
          />
        </Card>
      )}

      {linkedElderly.length === 0 && (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.errorContainer },
          ]}
        >
          <Card.Content>
            <Text style={{ color: theme.colors.onErrorContainer }}>
              You have no linked elderly users. Please link an elderly user
              first to record a custom voice.
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Recording prompt */}
      <Card
        style={[
          styles.promptCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content>
          <View style={styles.promptHeader}>
            <MaterialCommunityIcons
              name="microphone"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{
                marginLeft: 8,
                color: theme.colors.onPrimaryContainer,
              }}
            >
              Read aloud (Sample {currentPromptIndex + 1}/
              {RECORDING_PROMPTS.length}):
            </Text>
          </View>
          <Text
            variant="bodyLarge"
            style={{
              color: theme.colors.onPrimaryContainer,
              marginTop: 12,
              fontSize: 18,
              lineHeight: 28,
            }}
          >
            {currentPrompt?.text || "All prompts completed!"}
          </Text>
        </Card.Content>
      </Card>

      {/* Record button */}
      <View style={styles.recordButtonContainer}>
        {isRecording ? (
          <Button
            mode="contained"
            onPress={stopRecording}
            style={[styles.recordButton, { backgroundColor: "#ff3b30" }]}
            contentStyle={styles.recordButtonContent}
            icon="stop"
            labelStyle={styles.recordButtonLabel}
          >
            Stop Recording
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={startRecording}
            style={styles.recordButton}
            contentStyle={styles.recordButtonContent}
            icon="microphone"
            disabled={samples.length >= 5 || linkedElderly.length === 0}
            labelStyle={styles.recordButtonLabel}
          >
            Start Recording
          </Button>
        )}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording...</Text>
          </View>
        )}
      </View>

      {/* Recorded samples list */}
      {samples.length > 0 && (
        <>
          <Text variant="titleSmall" style={styles.samplesTitle}>
            Recorded Samples ({samples.length}/5)
          </Text>
          {samples.map((sample, idx) => (
            <Card
              key={sample.id}
              style={[
                styles.sampleCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Card.Content style={styles.sampleRow}>
                <View style={styles.sampleInfo}>
                  <MaterialCommunityIcons
                    name="waveform"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <View style={{ marginLeft: 8 }}>
                    <Text variant="bodyMedium">Sample {idx + 1}</Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {(sample.durationMs / 1000).toFixed(1)}s
                    </Text>
                  </View>
                </View>
                <View style={styles.sampleActions}>
                  <IconButton
                    icon={isPlaying ? "pause" : "play"}
                    size={22}
                    onPress={() =>
                      isPlaying ? stopPreview() : previewSample(sample.uri)
                    }
                    iconColor={theme.colors.primary}
                  />
                  <IconButton
                    icon="delete"
                    size={22}
                    onPress={() => deleteSample(sample.id)}
                    iconColor={theme.colors.error}
                  />
                </View>
              </Card.Content>
            </Card>
          ))}
        </>
      )}

      {/* Upload button */}
      {samples.length > 0 && (
        <Button
          mode="contained"
          onPress={handleUpload}
          loading={isUploading}
          disabled={isUploading || linkedElderly.length === 0}
          style={styles.uploadButton}
          contentStyle={styles.uploadButtonContent}
          icon="cloud-upload"
        >
          {isUploading
            ? "Creating Custom Voice..."
            : "Upload & Create Custom Voice"}
        </Button>
      )}

      {/* Error message */}
      {errorMessage && (
        <Card
          style={[
            styles.errorCard,
            { backgroundColor: theme.colors.errorContainer },
          ]}
        >
          <Card.Content>
            <Text style={{ color: theme.colors.onErrorContainer }}>
              {errorMessage}
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* ============================================================== */}
      {/* Existing Custom Voices                                         */}
      {/* ============================================================== */}
      {existingVoices.length > 0 && (
        <>
          <Divider style={styles.divider} />
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Your Custom Voices
          </Text>
          {existingVoices.map((voice) => (
            <Card
              key={voice.$id}
              style={[
                styles.voiceCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Card.Content style={styles.voiceRow}>
                <View style={styles.voiceInfo}>
                  <MaterialCommunityIcons
                    name="account-voice"
                    size={24}
                    color={theme.colors.primary}
                  />
                  <View style={{ marginLeft: 10 }}>
                    <Text variant="bodyMedium">
                      Voice for {voice.caregiver_name}
                    </Text>
                    <Chip
                      compact
                      style={{ marginTop: 4 }}
                      textStyle={{ fontSize: 11 }}
                    >
                      {voice.status}
                    </Chip>
                  </View>
                </View>
                <IconButton
                  icon="delete"
                  size={22}
                  onPress={() => handleDeleteVoice(voice.$id!)}
                  iconColor={theme.colors.error}
                />
              </Card.Content>
            </Card>
          ))}
        </>
      )}

      {/* ============================================================== */}
      {/* Note about EAS Build                                           */}
      {/* ============================================================== */}
      <Card
        style={[
          styles.infoCard,
          { backgroundColor: theme.colors.tertiaryContainer || "#f0f4ff" },
        ]}
      >
        <Card.Content>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons
              name="information"
              size={20}
              color={theme.colors.primary}
            />
            <Text
              variant="bodySmall"
              style={{
                marginLeft: 8,
                flex: 1,
                color: theme.colors.onSurface,
              }}
            >
              Recording requires a dev client built with EAS Build. It cannot
              be tested in Expo Go.
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Divider style={styles.divider} />

      {/* Log Out */}
      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutButtonContent}
        icon="logout"
        buttonColor="#ff3b30"
      >
        Log Out
      </Button>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 4,
  },
  sectionSubtitle: {
    marginBottom: 12,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  promptCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordButtonContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  recordButton: {
    borderRadius: 28,
    minWidth: 200,
  },
  recordButtonContent: {
    height: 56,
  },
  recordButtonLabel: {
    fontSize: 16,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff3b30",
    marginRight: 6,
  },
  recordingText: {
    color: "#ff3b30",
    fontWeight: "600",
  },
  samplesTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  sampleCard: {
    marginBottom: 8,
    borderRadius: 10,
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sampleInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  sampleActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  uploadButton: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
  },
  uploadButtonContent: {
    height: 52,
  },
  errorCard: {
    borderRadius: 10,
    marginBottom: 12,
  },
  divider: {
    marginVertical: 16,
  },
  voiceCard: {
    marginBottom: 8,
    borderRadius: 10,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  voiceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  infoCard: {
    borderRadius: 10,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoutButton: {
    borderRadius: 12,
  },
  logoutButtonContent: {
    height: 48,
  },
  bottomSpacer: {
    height: 32,
  },
});
