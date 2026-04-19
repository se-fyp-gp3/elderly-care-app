import * as FileSystem from "expo-file-system/legacy";
import { ExecutionMethod, ID } from "react-native-appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, functions, storage, VOICE_CLONE_FUNCTION_ID } from "./appwrite";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Estimate total base64 payload size (in bytes)
  const totalBase64Bytes = samplesBase64.reduce((sum, s) => sum + s.length, 0);
  const SIZE_THRESHOLD = 500 * 1024; // 500 KB — Appwrite function body limit safe zone

  let clonePayload: any;

  if (totalBase64Bytes < SIZE_THRESHOLD) {
    // ── Small file: send base64 directly in function body ──
    console.log(`[voice] Small payload (${(totalBase64Bytes / 1024).toFixed(0)} KB), sending base64 directly...`);
    const fnResult = await functions.createExecution({
      functionId: VOICE_CLONE_FUNCTION_ID,
      body: JSON.stringify({
        mode: "clone",
        samplesBase64,
        speakerName,
      }),
      method: ExecutionMethod.POST,
    });

    try {
      clonePayload = JSON.parse(fnResult.responseBody);
    } catch {
      throw new Error(`Voice clone function returned invalid JSON: ${fnResult.responseBody}`);
    }
  } else {
    // ── Large file: upload to Storage first, pass URLs to function ──
    console.log(`[voice] Large payload (${(totalBase64Bytes / 1024).toFixed(0)} KB), uploading to Storage first...`);

    const uploadedFileIds: string[] = [];
    const sampleUrls: string[] = [];

    try {
      for (let i = 0; i < samplesBase64.length; i++) {
        const b64 = samplesBase64[i];
        const tmpPath = `${FileSystem.cacheDirectory}voice_tmp_${Date.now()}_${i}.m4a`;
        await FileSystem.writeAsStringAsync(tmpPath, b64, {
          encoding: "base64" as any,
        });

        const fileInfo = await FileSystem.getInfoAsync(tmpPath);
        if (!fileInfo.exists) throw new Error("Failed to write temp audio file");

        const fileId = ID.unique();
        await storage.createFile(
          VOICE_CLONE_BUCKET,
          fileId,
          {
            name: `tmp_sample_${i}_${Date.now()}.m4a`,
            type: "audio/mp4",
            size: (fileInfo as any).size || 0,
            uri: tmpPath,
          } as any,
        );
        uploadedFileIds.push(fileId);

        const url = `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
        sampleUrls.push(url);
        console.log(`[voice] Uploaded sample ${i + 1}/${samplesBase64.length}: ${fileId}`);

        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      }

      // Call function with URLs instead of base64
      const fnResult = await functions.createExecution({
        functionId: VOICE_CLONE_FUNCTION_ID,
        body: JSON.stringify({
          mode: "clone_url",
          sampleUrls,
          speakerName,
        }),
        method: ExecutionMethod.POST,
      });

      try {
        clonePayload = JSON.parse(fnResult.responseBody);
      } catch {
        throw new Error(`Voice clone function returned invalid JSON: ${fnResult.responseBody}`);
      }
    } finally {
      // Clean up temp Storage files (best-effort)
      for (const fid of uploadedFileIds) {
        try {
          await storage.deleteFile(VOICE_CLONE_BUCKET, fid);
        } catch {
          // Ignore cleanup failures
        }
      }
    }
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
      encoding: "base64" as any,
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
  language?: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  assertDashScopeConfigured();

  const resolvedVoice = voice || DEFAULT_VOICE;

  // ── Reference-based (zero-shot) cloning via Appwrite function ──
  if (resolvedVoice.startsWith("ref:")) {
    const storageFileId = resolvedVoice.slice(4);
    return synthesizeWithReference(text, storageFileId, model, language);
  }

  // ── Direct synthesis with preset or registered voice ──
  return synthesizeDirect(text, resolvedVoice, model, language);
}

// ── Direct TTS (preset or DashScope-registered voice) via Appwrite function ──
async function synthesizeDirect(
  text: string,
  voice: string,
  model: string,
  language?: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  // Route through Appwrite function which uses WebSocket to call CosyVoice
  const requestBody: Record<string, any> = {
    mode: "synthesize",
    text,
    model: model || TTS_MODEL,
    voice: voice || DEFAULT_VOICE,
    format: "mp3",
    sampleRate: 22050,
    rate: 0.9, // slightly slower for elderly users
  };
  if (language) requestBody.language = language;

  // Use sync execution with retry (async queue is unreliable on self-hosted Appwrite).
  // First call after cold start may exceed the 30s sync limit, so retry up to 3 times.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const execution = await functions.createExecution({
        functionId: VOICE_CLONE_FUNCTION_ID,
        body: JSON.stringify(requestBody),
        method: ExecutionMethod.POST,
        async: false,
      });

      if (execution.status !== "completed" || execution.responseStatusCode !== 200) {
        throw new Error(
          `TTS execution failed (status=${execution.status}, code=${execution.responseStatusCode}): ${execution.errors || "unknown"}`
        );
      }

      let payload: any;
      try {
        payload = JSON.parse(execution.responseBody);
      } catch {
        throw new Error(`Appwrite TTS function returned invalid JSON: ${execution.responseBody}`);
      }

      if (!payload?.success) {
        throw new Error(payload?.error || "Appwrite TTS function failed");
      }

      if (payload.audioBase64) {
        return { audioBase64: payload.audioBase64 };
      }

      throw new Error("Appwrite TTS function returned no audio");
    } catch (err: any) {
      const isTimeout = /timed?\s*out|408|timeout/i.test(err?.message || "");
      if (isTimeout && attempt < maxAttempts) {
        console.warn(`[voice] TTS attempt ${attempt}/${maxAttempts} timed out, retrying...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error("TTS failed after all retry attempts");
}

// ── Zero-shot cloning fallback ──
// CosyVoice WebSocket API doesn't support inline reference audio.
// Fall back to default voice for ref: voices.
async function synthesizeWithReference(
  text: string,
  storageFileId: string,
  model: string,
  language?: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  console.warn("[voice] Reference-based TTS not supported via WebSocket, using default voice");
  return synthesizeDirect(text, DEFAULT_VOICE, model, language);
}

// ── Utility ──
export async function readAudioFileAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as any,
  });
}

export { DEFAULT_VOICE, TTS_MODEL, VC_MODEL, VOICE_CLONE_BUCKET };

