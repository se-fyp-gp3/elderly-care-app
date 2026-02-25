/**
 * useCustomVoice – Hook for caregiver voice recording & cloning
 *
 * Encapsulates:
 * - Recording audio samples via expo-av
 * - Managing sample list (add / delete, max 5)
 * - Uploading samples to Azure Custom Neural Voice (Personal Voice) for cloning
 * - Saving the generated voice_id to Appwrite
 * - Elderly-friendly error messages (no technical jargon)
 */

import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { useCallback, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  createCustomVoice,
  CustomVoiceRecord,
  getCustomVoicesForCaregiver,
  deleteCustomVoiceRecord as deleteVoiceRecordFromDB,
  MAX_SAMPLES,
  saveCustomVoiceRecord,
  VoiceSample,
} from "../azureCustomVoice";
import { playLocalAudio, stopCurrentPlayback } from "../azureTTS";

// ---------------------------------------------------------------------------
// Recording prompt texts (>50 Chinese characters total)
// ---------------------------------------------------------------------------

export const RECORDING_PROMPTS: { id: number; text: string }[] = [
  {
    id: 1,
    text: "今天的步数已同步，记得按时吃药，保持健康的生活习惯。",
  },
  {
    id: 2,
    text: "早上好，今天天气不错，出门散步的时候注意安全，多喝水。",
  },
  {
    id: 3,
    text: "您今天的血压和心率都很正常，继续保持良好的作息时间。",
  },
  {
    id: 4,
    text: "下午三点有一个医生预约，需要我帮您叫车吗？别忘了带病历。",
  },
  {
    id: 5,
    text: "晚饭后记得吃降压药，一天三次，每次一粒，饭后半小时服用。",
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCustomVoiceReturn {
  // State
  samples: VoiceSample[];
  isRecording: boolean;
  isUploading: boolean;
  isPlaying: boolean;
  currentPromptIndex: number;
  existingVoices: CustomVoiceRecord[];
  errorMessage: string | null;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  deleteSample: (id: string) => void;
  uploadAndCloneVoice: (
    caregiverId: string,
    caregiverName: string,
    elderlyId: string,
  ) => Promise<void>;
  previewSample: (uri: string) => Promise<void>;
  stopPreview: () => Promise<void>;
  loadExistingVoices: (caregiverId: string) => Promise<void>;
  deleteVoiceRecord: (docId: string) => Promise<void>;
  clearError: () => void;
}

export function useCustomVoice(): UseCustomVoiceReturn {
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [existingVoices, setExistingVoices] = useState<CustomVoiceRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Debounce guard
  const actionLockRef = useRef(false);
  const lockAction = () => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setTimeout(() => {
      actionLockRef.current = false;
    }, 500);
    return true;
  };

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    if (Platform.OS === "web") {
      alert(msg);
    } else {
      Alert.alert("Notice", msg);
    }
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  // -----------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    if (!lockAction()) return;

    if (samples.length >= MAX_SAMPLES) {
      showError(
        `You can record up to ${MAX_SAMPLES} samples. Delete one to record again.`,
      );
      return;
    }

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        showError(
          "Microphone permission is required. Please allow microphone access in your device settings.",
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: ".mp3",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      clearError();
    } catch (error) {
      console.error("Recording start error:", error);
      showError(
        "Could not start recording. Please check your microphone and try again.",
      );
    }
  }, [samples.length, showError, clearError]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        showError("Recording failed. Please try again.");
        return;
      }

      const durationMs = Date.now() - recordingStartTimeRef.current;

      if (durationMs < 3000) {
        showError("Recording is too short. Please record at least 3 seconds.");
        return;
      }

      if (durationMs > 30000) {
        showError(
          "Recording is too long. Please keep it under 30 seconds.",
        );
        return;
      }

      const newSample: VoiceSample = {
        id: `sample_${Date.now()}`,
        uri,
        durationMs,
        fileName: `Voice Sample ${samples.length + 1}`,
      };

      setSamples((prev) => [...prev, newSample]);
      setCurrentPromptIndex((prev) =>
        Math.min(prev + 1, RECORDING_PROMPTS.length - 1),
      );
    } catch (error) {
      console.error("Recording stop error:", error);
      showError("Error saving recording. Please try again.");
    }
  }, [samples.length, showError]);

  // -----------------------------------------------------------------------
  // Sample management
  // -----------------------------------------------------------------------

  const deleteSample = useCallback((id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // -----------------------------------------------------------------------
  // Playback preview
  // -----------------------------------------------------------------------

  const previewSample = useCallback(
    async (uri: string) => {
      try {
        setIsPlaying(true);
        const controls = await playLocalAudio(uri);
        // Auto-reset when finished — use a short poll
        const check = setInterval(async () => {
          try {
            const { isPlaying: stillPlaying } = await import("../azureTTS");
            const playing = await stillPlaying();
            if (!playing) {
              setIsPlaying(false);
              clearInterval(check);
            }
          } catch {
            setIsPlaying(false);
            clearInterval(check);
          }
        }, 500);
      } catch (error) {
        setIsPlaying(false);
        showError("Could not play the recording. Please try again.");
      }
    },
    [showError],
  );

  const stopPreview = useCallback(async () => {
    await stopCurrentPlayback();
    setIsPlaying(false);
  }, []);

  // -----------------------------------------------------------------------
  // Upload & clone voice
  // -----------------------------------------------------------------------

  const uploadAndCloneVoice = useCallback(
    async (
      caregiverId: string,
      caregiverName: string,
      elderlyId: string,
    ) => {
      if (!lockAction()) return;

      if (samples.length === 0) {
        showError("Please record at least one audio sample first.");
        return;
      }

      setIsUploading(true);
      clearError();

      try {
        // Read each sample file as base64
        const samplesBase64: string[] = [];
        for (const sample of samples) {
          const b64 = await FileSystem.readAsStringAsync(sample.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          samplesBase64.push(b64);
        }

        // Call Azure Custom Neural Voice API
        const voiceId = await createCustomVoice(
          samplesBase64,
          `${caregiverName}_voice`,
        );

        // Save to Appwrite
        await saveCustomVoiceRecord({
          caregiver_id: caregiverId,
          caregiver_name: caregiverName,
          elderly_id: elderlyId,
          voice_id: voiceId,
          status: "ready",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Reset samples
        setSamples([]);
        setCurrentPromptIndex(0);

        // Reload
        await loadExistingVoices(caregiverId);

        if (Platform.OS === "web") {
          alert("Custom voice created successfully!");
        } else {
          Alert.alert("Success", "Custom voice created successfully!");
        }
      } catch (error) {
        console.error("Voice cloning error:", error);
        showError(
          "Voice creation failed. Please check your internet connection and try again.",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [samples, showError, clearError],
  );

  // -----------------------------------------------------------------------
  // Load existing voices
  // -----------------------------------------------------------------------

  const loadExistingVoices = useCallback(async (caregiverId: string) => {
    try {
      const voices = await getCustomVoicesForCaregiver(caregiverId);
      setExistingVoices(voices);
    } catch (error) {
      console.error("Error loading voices:", error);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Delete voice record
  // -----------------------------------------------------------------------

  const deleteVoiceRecord = useCallback(
    async (docId: string) => {
      try {
        await deleteVoiceRecordFromDB(docId);
        setExistingVoices((prev) => prev.filter((v) => v.$id !== docId));
      } catch (error) {
        showError("Could not delete the voice. Please try again.");
      }
    },
    [showError],
  );

  return {
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
    clearError,
  };
}
