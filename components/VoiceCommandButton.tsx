// components/VoiceCommandButton.tsx
// Floating voice command button for elderly users
// Records audio → Qwen3.5-audio (recognition + intent) → Execute → CosyVoice-v2 (TTS response)

import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import {
    executePendingAction,
    executeVoiceCommand,
    synthesizeCommandResponse
} from "@/lib/voice-command-executor";
import {
    readAudioAsBase64,
    recognizeVoiceCommand,
    VOICE_LANGUAGE_LABELS,
    type ConversationTurn,
    type VoiceLanguage,
} from "@/lib/voice-recognition";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { AudioPlayer } from "expo-audio";
import {
    createAudioPlayer,
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    Modal,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Button,
    Chip,
    Text,
    useTheme,
} from "react-native-paper";

type VoiceState =
  | "idle"
  | "recording"
  | "processing"
  | "speaking"
  | "error";

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "撳住講嘢",
  recording: "聽緊...",
  processing: "諗緊...",
  speaking: "講緊...",
  error: "出錯咗",
};

const MESSAGES_FOR_CANCEL: Record<string, string> = {
  yue: "好嘅，取消咗。",
  zh: "好的，已取消。",
  en: "OK, cancelled.",
};

export default function VoiceCommandButton() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [language, setLanguage] = useState<VoiceLanguage>("yue");
  const [modalVisible, setModalVisible] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [elderlyProfileId, setElderlyProfileId] = useState<string | null>(null);

  // Multi-turn conversation history (kept while modal is open)
  const conversationHistory = useRef<ConversationTurn[]>([]);

  // Pending action awaiting user confirmation
  const pendingAction = useRef<any>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const playerRef = useRef<AudioPlayer | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load elderly profile once
  useEffect(() => {
    if (user) {
      getElderlyByUserId(user.$id).then((profile) => {
        if (profile) setElderlyProfileId(profile.$id);
      });
    }
  }, [user]);

  // Pulse animation during recording
  useEffect(() => {
    if (voiceState === "recording") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voiceState, pulseAnim]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setErrorMessage("");
      setResultMessage("");

      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorMessage("需要錄音權限");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceState("recording");
      setModalVisible(true);
    } catch (err) {
      console.error("[voice-btn] Start recording error:", err);
      setVoiceState("error");
      setErrorMessage(String(err));
    }
  }, [recorder]);

  // Stop recording and process
  const stopRecording = useCallback(async () => {
    if (voiceState !== "recording") return;

    try {
      setVoiceState("processing");
      await recorder.stop();

      // Wait for the recording file to be available
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("No recording URI");
      }

      // Read audio as base64
      const audioBase64 = await readAudioAsBase64(uri);

      // Clean up temp file
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      // Send to Qwen3.5-audio for recognition + intent extraction
      const recognitionResult = await recognizeVoiceCommand(
        audioBase64,
        language,
        "audio/m4a",
        conversationHistory.current,
      );

      console.log("[voice-btn] Recognition:", JSON.stringify(recognitionResult));

      if (!user) {
        throw new Error("Not authenticated");
      }

      // Add user's transcript to conversation history
      conversationHistory.current.push({
        role: "user",
        text: recognitionResult.transcript || recognitionResult.reply,
      });

      let commandResult;

      // Check if there's a pending action waiting for confirmation
      if (pendingAction.current) {
        const transcript = (recognitionResult.transcript || recognitionResult.reply || "").toLowerCase();
        const isConfirm = /^(好|確認|确认|係|是|yes|ok|okay|對|对|冇問題|没问题|confirm|得|sure)\b/.test(transcript.trim());
        const isCancel = /^(唔好|不|取消|cancel|no|算|唔使|不用|唔要|不要)\b/.test(transcript.trim());

        if (isConfirm) {
          commandResult = await executePendingAction(
            pendingAction.current,
            user.$id,
            language,
          );
          pendingAction.current = null;
        } else if (isCancel) {
          pendingAction.current = null;
          const cancelMsg = (MESSAGES_FOR_CANCEL as any)[language] || "好嘅，取消咗。";
          commandResult = { success: true, message: cancelMsg, action: "cancelled" };
        } else {
          // Not a clear confirm/cancel — treat as new command, discard pending
          pendingAction.current = null;
          commandResult = await executeVoiceCommand(
            recognitionResult,
            user.$id,
            language,
          );
        }
      } else {
        // Execute the command normally
        commandResult = await executeVoiceCommand(
          recognitionResult,
          user.$id,
          language,
        );
      }

      // If the result needs confirmation with ready data, store as pending
      if (commandResult.needsConfirmation && commandResult.confirmationData?.readyToExecute) {
        pendingAction.current = commandResult.confirmationData;
      }

      // Add AI response to conversation history
      conversationHistory.current.push({
        role: "assistant",
        text: commandResult.message,
      });

      setResultMessage(commandResult.message);

      // Handle special actions that need navigation (only when creation is done)
      if (commandResult.action === "add_medication" && !commandResult.needsConfirmation) {
        // Navigate to medication tab after TTS
        setTimeout(() => {
          setModalVisible(false);
          router.push("/(elderly-tabs)/medication");
        }, 2000);
      }

      // Synthesize response with family voice using CosyVoice-v2
      setVoiceState("speaking");
      await playTTSResponse(commandResult.message);
      setVoiceState("idle");
    } catch (err) {
      console.error("[voice-btn] Processing error:", err);
      setVoiceState("error");
      // Show friendly error in user's language
      const friendlyError = language === "yue"
        ? "對唔住，我聽唔清楚，請再講一次"
        : language === "zh"
          ? "对不起，我听不清楚，请再说一次"
          : "Sorry, I didn't catch that. Please try again.";
      setErrorMessage(friendlyError);
      setResultMessage(friendlyError);
      // Try to speak the error message too
      try {
        await playTTSResponse(friendlyError);
      } catch {}
      setTimeout(() => setVoiceState("idle"), 3000);
    }
  }, [voiceState, recorder, user, elderlyProfileId, router]);

  // Play TTS response using CosyVoice-v2
  const playTTSResponse = useCallback(
    async (message: string) => {
      if (!elderlyProfileId) return;

      try {
        const audioBase64 = await synthesizeCommandResponse(
          message,
          elderlyProfileId,
          language,
        );

        if (audioBase64) {
          // Write to temp file and play
          const tempPath = `${FileSystem.cacheDirectory}voice_cmd_${Date.now()}.mp3`;
          await FileSystem.writeAsStringAsync(tempPath, audioBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Clean up previous player
          if (playerRef.current) {
            playerRef.current.remove();
            playerRef.current = null;
          }

          const player = createAudioPlayer({ uri: tempPath });
          playerRef.current = player;

          await new Promise<void>((resolve) => {
            player.addListener("playbackStatusUpdate", (status: any) => {
              if (status.didJustFinish) {
                resolve();
              }
            });
            player.play();
            // Timeout fallback
            setTimeout(resolve, 15000);
          });

          // Clean up
          player.remove();
          playerRef.current = null;
          await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(
            () => {},
          );
        }
      } catch (err) {
        console.warn("[voice-btn] TTS playback error:", err);
      }
    },
    [elderlyProfileId, language],
  );

  // Close modal
  const handleClose = useCallback(() => {
    if (voiceState === "recording") {
      recorder.stop().catch(() => {});
    }
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setVoiceState("idle");
    setModalVisible(false);
    setResultMessage("");
    setErrorMessage("");
    // Clear conversation history and pending action on close
    conversationHistory.current = [];
    pendingAction.current = null;
  }, [voiceState, recorder]);

  const stateLabel = STATE_LABELS[voiceState];

  return (
    <>
      {/* Floating button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => {
          if (voiceState === "idle") {
            startRecording();
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="microphone"
          size={32}
          color={theme.colors.onPrimary}
        />
      </TouchableOpacity>

      {/* Voice command modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            {/* Title */}
            <Text variant="titleLarge" style={{ textAlign: "center", marginBottom: 16, color: theme.colors.onSurface }}>
              🎙️ 語音助手（中英粵）
            </Text>

            {/* Language selector */}
            <View style={styles.languageRow}>
              {(Object.keys(VOICE_LANGUAGE_LABELS) as VoiceLanguage[]).map(
                (lang) => (
                  <Chip
                    key={lang}
                    selected={language === lang}
                    onPress={() => setLanguage(lang)}
                    style={styles.langChip}
                    showSelectedOverlay
                  >
                    {VOICE_LANGUAGE_LABELS[lang]}
                  </Chip>
                ),
              )}
            </View>

            {/* Status indicator */}
            <View style={styles.statusArea}>
              {voiceState === "recording" && (
                <Animated.View
                  style={[
                    styles.micCircle,
                    {
                      backgroundColor: theme.colors.error,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="microphone"
                    size={48}
                    color="#fff"
                  />
                </Animated.View>
              )}

              {voiceState === "processing" && (
                <View style={styles.processingArea}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              )}

              {voiceState === "speaking" && (
                <View
                  style={[
                    styles.micCircle,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="volume-high"
                    size={48}
                    color="#fff"
                  />
                </View>
              )}

              {voiceState === "idle" && !resultMessage && (
                <View
                  style={[
                    styles.micCircle,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="microphone-outline"
                    size={48}
                    color={theme.colors.onSurfaceVariant}
                  />
                </View>
              )}

              {voiceState === "error" && (
                <View
                  style={[
                    styles.micCircle,
                    { backgroundColor: theme.colors.errorContainer },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={48}
                    color={theme.colors.error}
                  />
                </View>
              )}

              <Text
                variant="titleMedium"
                style={[styles.stateLabel, { color: theme.colors.onSurface }]}
              >
                {stateLabel}
              </Text>
            </View>

            {/* Result message */}
            {resultMessage ? (
              <View
                style={[
                  styles.resultBox,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.colors.onPrimaryContainer }}
                >
                  {resultMessage}
                </Text>
              </View>
            ) : null}

            {/* Error message */}
            {errorMessage ? (
              <View
                style={[
                  styles.resultBox,
                  { backgroundColor: theme.colors.errorContainer },
                ]}
              >
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.error }}
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Action buttons */}
            <View style={styles.buttonRow}>
              {voiceState === "recording" ? (
                <Button
                  mode="contained"
                  onPress={stopRecording}
                  icon="stop"
                  style={[
                    styles.actionButton,
                    { backgroundColor: theme.colors.error },
                  ]}
                  labelStyle={{ fontSize: 18 }}
                >
                  停止
                </Button>
              ) : voiceState === "idle" ? (
                <>
                  <Button
                    mode="contained"
                    onPress={startRecording}
                    icon="microphone"
                    style={[
                      styles.actionButton,
                      { backgroundColor: theme.colors.primary },
                    ]}
                    labelStyle={{ fontSize: 18 }}
                  >
                    開始講
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={handleClose}
                    style={styles.closeButton}
                    labelStyle={{ fontSize: 16 }}
                  >
                    關閉
                  </Button>
                </>
              ) : (
                <Button
                  mode="outlined"
                  onPress={handleClose}
                  style={styles.closeButton}
                  labelStyle={{ fontSize: 16 }}
                >
                  關閉
                </Button>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 90,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    zIndex: 1000,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    minHeight: 400,
  },
  languageRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  langChip: {
    paddingHorizontal: 4,
  },
  statusArea: {
    alignItems: "center",
    marginBottom: 20,
  },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  processingArea: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  stateLabel: {
    textAlign: "center",
    fontSize: 18,
  },
  resultBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  closeButton: {
    paddingHorizontal: 16,
  },
});
