/**
 * useChatVoice – Hook for elderly chat voice broadcast
 *
 * Encapsulates:
 * - Voice on/off toggle (persisted with AsyncStorage)
 * - Selected voice_id for TTS (persisted in Appwrite user prefs)
 * - Speaking AI responses with the selected custom voice
 * - Pause / stop playback controls
 * - Loading available custom voices for the current elderly user
 *
 * Elderly-friendly: error messages are non-technical.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  CustomVoiceRecord,
  getCustomVoicesForElderly,
} from "../azureCustomVoice";
import {
  speakText,
  stopCurrentPlayback,
  isPlaying as checkIsPlaying,
} from "../azureTTS";

// ---------------------------------------------------------------------------
// AsyncStorage keys
// ---------------------------------------------------------------------------

const VOICE_ENABLED_KEY = "@elderly_voice_enabled";
const SELECTED_VOICE_KEY = "@elderly_selected_voice_id";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChatVoiceReturn {
  // State
  voiceEnabled: boolean;
  isSpeaking: boolean;
  selectedVoiceId: string | null;
  availableVoices: CustomVoiceRecord[];
  isLoadingVoices: boolean;

  // Actions
  toggleVoice: () => Promise<void>;
  setVoiceEnabled: (enabled: boolean) => Promise<void>;
  speakResponse: (text: string) => Promise<void>;
  pausePlayback: () => Promise<void>;
  stopPlayback: () => Promise<void>;
  selectVoice: (voiceId: string | null) => Promise<void>;
  loadVoices: (elderlyId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatVoice(elderlyId?: string): UseChatVoiceReturn {
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVoiceId, setSelectedVoiceIdState] = useState<string | null>(
    null,
  );
  const [availableVoices, setAvailableVoices] = useState<CustomVoiceRecord[]>(
    [],
  );
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  const playbackControlsRef = useRef<{
    pause: () => Promise<void>;
    stop: () => Promise<void>;
  } | null>(null);

  // -----------------------------------------------------------------------
  // Load persisted state on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const [enabledStr, voiceId] = await Promise.all([
          AsyncStorage.getItem(VOICE_ENABLED_KEY),
          AsyncStorage.getItem(SELECTED_VOICE_KEY),
        ]);
        setVoiceEnabledState(enabledStr === "true");
        setSelectedVoiceIdState(voiceId || null);
      } catch {
        // Defaults are fine
      }
    })();
  }, []);

  // Load voices when elderlyId is available
  useEffect(() => {
    if (elderlyId) {
      loadVoices(elderlyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elderlyId]);

  // -----------------------------------------------------------------------
  // Toggle
  // -----------------------------------------------------------------------

  const setVoiceEnabled = useCallback(async (enabled: boolean) => {
    setVoiceEnabledState(enabled);
    try {
      await AsyncStorage.setItem(VOICE_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // Non-critical
    }
    if (!enabled) {
      await stopCurrentPlayback();
      setIsSpeaking(false);
      playbackControlsRef.current = null;
    }
  }, []);

  const toggleVoice = useCallback(async () => {
    await setVoiceEnabled(!voiceEnabled);
  }, [voiceEnabled, setVoiceEnabled]);

  // -----------------------------------------------------------------------
  // Voice selection (persisted)
  // -----------------------------------------------------------------------

  const selectVoice = useCallback(async (voiceId: string | null) => {
    setSelectedVoiceIdState(voiceId);
    try {
      if (voiceId) {
        await AsyncStorage.setItem(SELECTED_VOICE_KEY, voiceId);
      } else {
        await AsyncStorage.removeItem(SELECTED_VOICE_KEY);
      }
    } catch {
      // Non-critical
    }
  }, []);

  // -----------------------------------------------------------------------
  // Speech
  // -----------------------------------------------------------------------

  const speakResponse = useCallback(
    async (text: string) => {
      if (!voiceEnabled || !text.trim()) return;

      try {
        setIsSpeaking(true);
        const controls = await speakText({
          text,
          voiceId: selectedVoiceId || undefined,
        });
        playbackControlsRef.current = controls;

        // Poll to detect when playback finishes
        const interval = setInterval(async () => {
          const playing = await checkIsPlaying();
          if (!playing) {
            setIsSpeaking(false);
            playbackControlsRef.current = null;
            clearInterval(interval);
          }
        }, 500);
      } catch (error) {
        console.error("TTS error:", error);
        setIsSpeaking(false);
        playbackControlsRef.current = null;
        // Non-blocking: don't show error to avoid disrupting chat
      }
    },
    [voiceEnabled, selectedVoiceId],
  );

  const pausePlayback = useCallback(async () => {
    if (playbackControlsRef.current) {
      await playbackControlsRef.current.pause();
    }
  }, []);

  const stopPlayback = useCallback(async () => {
    await stopCurrentPlayback();
    setIsSpeaking(false);
    playbackControlsRef.current = null;
  }, []);

  // -----------------------------------------------------------------------
  // Load available voices
  // -----------------------------------------------------------------------

  const loadVoices = useCallback(async (eid: string) => {
    setIsLoadingVoices(true);
    try {
      const voices = await getCustomVoicesForElderly(eid);
      setAvailableVoices(voices);
    } catch (error) {
      console.error("Error loading voices:", error);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  return {
    voiceEnabled,
    isSpeaking,
    selectedVoiceId,
    availableVoices,
    isLoadingVoices,

    toggleVoice,
    setVoiceEnabled,
    speakResponse,
    pausePlayback,
    stopPlayback,
    selectVoice,
    loadVoices,
  };
}
