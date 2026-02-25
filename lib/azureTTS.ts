/**
 * Azure TTS – Text-to-Speech using Azure Speech Service
 *
 * This module handles:
 * 1. Converting text to speech via Azure Speech Service REST API
 * 2. Supporting Personal Voice (speakerProfileId) or default Neural voices
 * 3. Playing the resulting audio via expo-av
 * 4. Providing pause / stop controls
 *
 * TTS Endpoint : https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 * Auth         : Ocp-Apim-Subscription-Key header
 * Format       : SSML (zh-CN locale)
 * Output       : audio-16khz-128kbitrate-mono-mp3
 *
 * NOTE: Cannot be tested in Expo Go — use EAS Build dev client.
 */

import { Audio, AVPlaybackStatus } from "expo-av";
import * as FileSystem from "expo-file-system";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AZURE_SPEECH_KEY =
  process.env.EXPO_PUBLIC_AZURE_SPEECH_KEY?.trim() || "";
const AZURE_SPEECH_REGION =
  process.env.EXPO_PUBLIC_AZURE_SPEECH_REGION?.trim() || "eastasia";

const AZURE_TTS_URL = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

/** Default Chinese Neural voice (Xiaoxiao – warm & friendly). */
const DEFAULT_VOICE_ID = "zh-CN-XiaoxiaoNeural";
const SAMPLE_RATE = 16000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TTSOptions {
  text: string;
  voiceId?: string;
  speed?: number; // 0.5 – 2.0, default 1.0
}

// ---------------------------------------------------------------------------
// Internal state for playback management
// ---------------------------------------------------------------------------

let currentSound: Audio.Sound | null = null;

// ---------------------------------------------------------------------------
// SSML helpers
// ---------------------------------------------------------------------------

/** Escape XML special characters in user text. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build SSML for Azure TTS.
 *
 * If `voiceId` looks like a standard Azure Neural voice name
 * (contains "Neural" or starts with a locale tag like "zh-"),
 * it is used directly as the `<voice name>`.
 *
 * Otherwise voiceId is treated as a **Personal Voice speakerProfileId**
 * and injected via `<mstts:ttsembedding>` with `DragonLatestNeural`.
 */
function buildSSML(text: string, voiceId: string, speed: number): string {
  const escaped = escapeXml(text);

  // Wrap in <prosody> when speed ≠ 1.0
  const content =
    speed !== 1.0
      ? `<prosody rate="${speed.toFixed(1)}">${escaped}</prosody>`
      : escaped;

  // Heuristic: standard voice names contain "Neural"
  const isStandardVoice =
    voiceId.includes("Neural") || /^[a-z]{2}-[A-Z]{2}-/.test(voiceId);

  if (isStandardVoice) {
    return [
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>`,
      `  <voice name='${voiceId}'>${content}</voice>`,
      `</speak>`,
    ].join("\n");
  }

  // Personal Voice mode – use DragonLatestNeural with speakerProfileId
  return [
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'`,
    `       xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>`,
    `  <voice name='DragonLatestNeural'>`,
    `    <mstts:ttsembedding speakerProfileId='${voiceId}'/>`,
    `    ${content}`,
    `  </voice>`,
    `</speak>`,
  ].join("\n");
}

/**
 * Convert an ArrayBuffer to a base64 string.
 * Works in React Native / Hermes by processing in chunks.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 KB per chunk to avoid call‑stack overflow
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Core TTS Functions
// ---------------------------------------------------------------------------

/**
 * Synthesise speech from text and return a local file URI (mp3).
 *
 * @param options TTSOptions with text and optional voiceId / speed
 * @returns Local file URI of the synthesised mp3 audio
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<string> {
  const { text, voiceId, speed = 1.0 } = options;

  if (!text.trim()) {
    throw new Error("Cannot synthesize empty text.");
  }

  if (!AZURE_SPEECH_KEY) {
    throw new Error(
      "Azure Speech key is not configured. Please add EXPO_PUBLIC_AZURE_SPEECH_KEY to your environment.",
    );
  }

  const resolvedVoice = voiceId || DEFAULT_VOICE_ID;
  const ssml = buildSSML(text, resolvedVoice, speed);

  const response = await fetch(AZURE_TTS_URL, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    },
    body: ssml,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Azure TTS error:", errText);
    throw new Error("Voice playback failed. Please try again.");
  }

  // Azure returns binary audio directly (not base64-wrapped JSON)
  const audioBuffer = await response.arrayBuffer();
  const audioBase64 = arrayBufferToBase64(audioBuffer);

  // Write to a temporary mp3 file
  const fileUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return fileUri;
}

/**
 * Synthesise and immediately play text.
 * Returns controls to pause / stop the playback.
 */
export async function speakText(
  options: TTSOptions,
): Promise<{ pause: () => Promise<void>; stop: () => Promise<void> }> {
  // Stop any currently playing audio
  await stopCurrentPlayback();

  const fileUri = await synthesizeSpeech(options);

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: fileUri },
    { shouldPlay: true, volume: 1.0 },
  );

  currentSound = sound;

  // Auto-cleanup when finished
  sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) {
        currentSound = null;
      }
    }
  });

  return {
    pause: async () => {
      if (currentSound) {
        const status = await currentSound.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await currentSound.pauseAsync();
          } else {
            await currentSound.playAsync();
          }
        }
      }
    },
    stop: async () => {
      await stopCurrentPlayback();
    },
  };
}

/**
 * Play a local audio file (e.g., a recorded sample for preview).
 */
export async function playLocalAudio(
  uri: string,
): Promise<{ pause: () => Promise<void>; stop: () => Promise<void> }> {
  await stopCurrentPlayback();

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, volume: 1.0 },
  );

  currentSound = sound;

  sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) {
        currentSound = null;
      }
    }
  });

  return {
    pause: async () => {
      if (currentSound) {
        const status = await currentSound.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await currentSound.pauseAsync();
          } else {
            await currentSound.playAsync();
          }
        }
      }
    },
    stop: async () => {
      await stopCurrentPlayback();
    },
  };
}

/**
 * Stop and unload any currently playing audio.
 */
export async function stopCurrentPlayback(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {
      // Audio may already be unloaded
    }
    currentSound = null;
  }
}

/**
 * Check whether audio is currently playing.
 */
export async function isPlaying(): Promise<boolean> {
  if (!currentSound) return false;
  try {
    const status = await currentSound.getStatusAsync();
    return status.isLoaded && status.isPlaying;
  } catch {
    return false;
  }
}
