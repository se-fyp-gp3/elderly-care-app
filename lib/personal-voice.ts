import * as FileSystem from "expo-file-system/legacy";
import { Buffer } from "buffer";
import { ExecutionMethod } from "react-native-appwrite";
import { functions, storage, VOICE_CLONE_FUNCTION_ID, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./appwrite";

// ── DashScope config ──
const DASHSCOPE_API_KEY =
  process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim() || "";

// TTS model for synthesis (known-working)
const TTS_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_TTS_MODEL?.trim() || "cosyvoice-v2";

// Voice-clone model for enrollment/training
const VC_MODEL =
  process.env.EXPO_PUBLIC_DASHSCOPE_VC_MODEL?.trim() || "cosyvoice-clone-v1";

// Default preset voice (fallback when no custom voice)
const DEFAULT_VOICE =
  process.env.EXPO_PUBLIC_DASHSCOPE_TTS_VOICE?.trim() || "longxiaochun_v2";

// Storage bucket for reference audio
const VOICE_CLONE_BUCKET =
  process.env.EXPO_PUBLIC_VOICE_CLONE_BUCKET_ID?.trim() || "voice-clones";

// ── Endpoints ──
const VOICE_CLONE_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization";

// ── Polling config ──
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 min max

function assertDashScopeConfigured() {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("EXPO_PUBLIC_DASHSCOPE_API_KEY is not configured.");
  }
}

// ─────────────────────────────────────────────────────────────
// Voice Cloning: Create a personal voice from audio samples
//
// Flow:
//   1. Call Appwrite function to convert audio to MP3
//   2. Upload converted MP3 to Appwrite Storage (for reference)
//   3. Attempt DashScope voice clone registration
//   4. If clone registration succeeds → return DashScope voice_id
//   5. If clone fails → fall back to storing reference audio for
//      zero-shot cloning at synthesis time
// ─────────────────────────────────────────────────────────────

export async function createPersonalVoice(
  samplesBase64: string[],
  speakerName: string,
): Promise<{
  voiceId: string;
  convertedSamplesBase64: string[];
  mode: "registered" | "reference";
}> {
  if (!samplesBase64.length) {
    throw new Error("At least one voice sample is required.");
  }
  assertDashScopeConfigured();

  // ── Step 1: Convert audio to MP3 via Appwrite function ──
  console.log("[voice] Calling Appwrite function to convert audio...");
  const fnResult = await functions.createExecution({
    functionId: VOICE_CLONE_FUNCTION_ID,
    body: JSON.stringify({
      mode: "clone",
      samplesBase64,
      speakerName,
    }),
    method: ExecutionMethod.POST,
  });

  let clonePayload: any;
  try {
    clonePayload = JSON.parse(fnResult.responseBody);
  } catch {
    throw new Error(`Voice clone function returned invalid JSON: ${fnResult.responseBody}`);
  }

  if (!clonePayload?.success) {
    throw new Error(clonePayload?.error || "Voice clone function failed");
  }

  const convertedSamples: string[] = clonePayload.convertedSamplesBase64 || [];
  const fallbackId: string = clonePayload.voiceId || `pv_${Date.now()}`;

  if (convertedSamples.length === 0) {
    throw new Error("Voice clone function returned no converted samples.");
  }

  // ── Step 2: Upload reference WAV to Appwrite Storage ──
  console.log("[voice] Uploading reference audio to Appwrite Storage...");
  const mimeType = clonePayload.mimeType || "audio/wav";
  const ext = mimeType === "audio/wav" ? "wav" : "mp3";
  let storageFileId: string | null = null;
  try {
    const audioBase64 = convertedSamples[0];
    const tempPath = `${FileSystem.cacheDirectory}voice_ref_${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(tempPath, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileInfo = await FileSystem.getInfoAsync(tempPath);
    if (!fileInfo.exists) throw new Error("Temp file not created");

    // Upload using the Appwrite Storage SDK
    const uploadResult = await storage.createFile(
      VOICE_CLONE_BUCKET,
      `ref_${speakerName.replace(/\W/g, "_")}_${Date.now()}`,
      {
        name: `${speakerName}_reference.${ext}`,
        type: mimeType,
        size: (fileInfo as any).size || 0,
        uri: tempPath,
      } as any,
    );
    storageFileId = uploadResult.$id;
    console.log(`[voice] Reference audio uploaded: ${storageFileId}`);

    // Clean up temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch (uploadErr) {
    console.warn("[voice] Storage upload failed, continuing without:", uploadErr);
  }

  // ── Step 3: Register voice clone using Appwrite Storage public URL ──
  if (storageFileId) {
    try {
      // Construct a publicly-accessible download URL for the uploaded file
      const publicAudioUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files/${storageFileId}/view?project=${APPWRITE_PROJECT_ID}`;
      console.log(`[voice] Public audio URL for DashScope: ${publicAudioUrl}`);

      console.log(`[voice] Attempting DashScope voice clone (${VC_MODEL})...`);
      const dashScopeVoiceId = await registerVoiceWithDashScope(
        publicAudioUrl,
        speakerName,
      );

      console.log(`[voice] DashScope voice registered: ${dashScopeVoiceId}`);
      return {
        voiceId: dashScopeVoiceId,
        convertedSamplesBase64: convertedSamples,
        mode: "registered",
      };
    } catch (regErr) {
      console.warn("[voice] DashScope voice registration failed:", regErr);
    }
  }

  // ── Step 4: Fallback — use reference audio for zero-shot cloning ──
  const refVoiceId = storageFileId ? `ref:${storageFileId}` : fallbackId;
  console.log(`[voice] Using reference-based voice: ${refVoiceId}`);

  return {
    voiceId: refVoiceId,
    convertedSamplesBase64: convertedSamples,
    mode: "reference",
  };
}

// ─────────────────────────────────────────────────────────────
// DashScope Voice Clone registration (async with polling)
// ─────────────────────────────────────────────────────────────
async function registerVoiceWithDashScope(
  audioUrl: string,
  speakerName: string,
): Promise<string> {
  // CosyVoice voice clone API:
  //   model = "voice-enrollment" (fixed)
  //   target_model = TTS model (must match synthesis model)
  //   url = publicly accessible audio URL
  const prefix = speakerName
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 10) || "voice";

  const payload = {
    model: "voice-enrollment",
    input: {
      action: "create_voice",
      target_model: TTS_MODEL, // e.g. "cosyvoice-v2"
      prefix,
      url: audioUrl,
    },
  };

  console.log(`[voice] Voice clone request: model=voice-enrollment, target_model=${TTS_MODEL}, prefix=${prefix}`);
  console.log(`[voice] Audio URL: ${audioUrl}`);

  // Retry up to 3 times for transient 500 errors (e.g. "request asr failed")
  const MAX_RETRIES = 3;
  let rawText = "";
  let response: Response | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    response = await fetch(VOICE_CLONE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    rawText = await response.text();
    console.log(`[voice] Voice clone response attempt ${attempt} (${response.status}): ${rawText.slice(0, 500)}`);

    if (response.ok || response.status < 500) break; // success or non-retryable error
    if (attempt < MAX_RETRIES) {
      console.log(`[voice] Retrying voice clone in 3s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!response || !response.ok) {
    throw new Error(`DashScope voice clone failed (${response?.status}): ${rawText}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("DashScope voice clone returned non-JSON response");
  }

  const voiceId = data?.output?.voice_id;
  if (!voiceId) {
    throw new Error(`DashScope voice clone returned no voice_id: ${rawText}`);
  }

  console.log(`[voice] Voice created: ${voiceId}, polling status...`);

  // Poll until voice status is "OK" (DEPLOYING → OK or UNDEPLOYED)
  return pollVoiceStatus(voiceId);
}

async function pollVoiceStatus(voiceId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const payload = {
      model: "voice-enrollment",
      input: {
        action: "query_voice",
        voice_id: voiceId,
      },
    };

    const res = await fetch(VOICE_CLONE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Voice status poll failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const voiceList = data?.output?.voice_list;
    const status = voiceList?.[0]?.status || data?.output?.status;

    console.log(`[voice] Poll ${i + 1}/${MAX_POLL_ATTEMPTS}: voice ${voiceId} status=${status}`);

    if (status === "OK") {
      return voiceId;
    }

    if (status === "UNDEPLOYED") {
      throw new Error(
        "Voice clone failed: audio did not pass quality check (UNDEPLOYED)",
      );
    }

    // DEPLOYING → continue polling
  }

  throw new Error("Voice clone status polling timed out.");
}

// ─────────────────────────────────────────────────────────────
// TTS Synthesis: synthesize speech using cosyvoice-v2
//
// If voice is a registered DashScope voice → use directly.
// If voice starts with "ref:" → zero-shot cloning with reference
//   audio from Appwrite Storage (via Appwrite function).
// Otherwise → treat as preset voice name.
// ─────────────────────────────────────────────────────────────

export async function synthesizePersonalVoice(
  text: string,
  voice: string,
  model: string = TTS_MODEL,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  assertDashScopeConfigured();

  const resolvedVoice = voice || DEFAULT_VOICE;

  // ── Reference-based (zero-shot) cloning via Appwrite function ──
  if (resolvedVoice.startsWith("ref:")) {
    const storageFileId = resolvedVoice.slice(4);
    return synthesizeWithReference(text, storageFileId, model);
  }

  // ── Direct synthesis with preset or registered voice ──
  return synthesizeDirect(text, resolvedVoice, model);
}

// ── Direct TTS (preset or DashScope-registered voice) via Appwrite function ──
async function synthesizeDirect(
  text: string,
  voice: string,
  model: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  // Route through Appwrite function which uses WebSocket to call CosyVoice
  const fnResult = await functions.createExecution({
    functionId: VOICE_CLONE_FUNCTION_ID,
    body: JSON.stringify({
      mode: "synthesize",
      text,
      model: model || TTS_MODEL,
      voice: voice || DEFAULT_VOICE,
      format: "mp3",
      sampleRate: 22050,
      rate: 0.9, // slightly slower for elderly users
    }),
    method: ExecutionMethod.POST,
  });

  let payload: any;
  try {
    payload = JSON.parse(fnResult.responseBody);
  } catch {
    throw new Error(`Appwrite TTS function returned invalid JSON: ${fnResult.responseBody}`);
  }

  if (!payload?.success) {
    throw new Error(payload?.error || "Appwrite TTS function failed");
  }

  if (payload.audioBase64) {
    return { audioBase64: payload.audioBase64 };
  }

  throw new Error("Appwrite TTS function returned no audio");
}

// ── Zero-shot cloning fallback ──
// CosyVoice WebSocket API doesn't support inline reference audio.
// Fall back to default voice for ref: voices.
async function synthesizeWithReference(
  text: string,
  storageFileId: string,
  model: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  console.warn("[voice] Reference-based TTS not supported via WebSocket, using default voice");
  return synthesizeDirect(text, DEFAULT_VOICE, model);
}

// ── Utility ──
export async function readAudioFileAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export { DEFAULT_VOICE, TTS_MODEL, VC_MODEL, VOICE_CLONE_BUCKET };
