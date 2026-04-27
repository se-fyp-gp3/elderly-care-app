import * as FileSystem from "expo-file-system/legacy";
import { ExecutionMethod, ID } from "react-native-appwrite";
import {
    APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID,
    functions,
    storage,
    VOICE_CLONE_FUNCTION_ID,
} from "./appwrite";

// ── DashScope config ──
const DASHSCOPE_API_KEY =
  process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim() || "";

const DEFAULT_STANDARD_TTS_MODEL = "qwen3-tts-flash";
const DEFAULT_PERSONAL_TTS_MODEL = "qwen3-tts-vc-realtime-2026-01-15";
const DEFAULT_PRESET_VOICE = "Kiki";

const LEGACY_TTS_MODELS = new Set(["cosyvoice-v2", "qwen3.5-tts"]);
const LEGACY_VC_MODELS = new Set(["cosyvoice-clone-v1"]);
const LEGACY_PRESET_VOICES = new Set(["longxiaochun_v2"]);

function cleanConfigValue(value?: string | null): string {
  return value?.trim() || "";
}

function normalizeStandardModel(model?: string | null): string {
  const value = cleanConfigValue(model);
  if (!value || LEGACY_TTS_MODELS.has(value)) {
    return DEFAULT_STANDARD_TTS_MODEL;
  }
  return value;
}

function normalizeVcModel(model?: string | null): string {
  const value = cleanConfigValue(model);
  if (!value || LEGACY_VC_MODELS.has(value)) {
    return DEFAULT_PERSONAL_TTS_MODEL;
  }
  return value;
}

function normalizePresetVoice(voice?: string | null): string {
  const value = cleanConfigValue(voice);
  if (!value || LEGACY_PRESET_VOICES.has(value)) {
    return DEFAULT_PRESET_VOICE;
  }
  return value;
}

function isReferenceVoice(voice: string): boolean {
  return voice.startsWith("ref:");
}

function isQwenPersonalVoice(voice: string): boolean {
  return /^qwen-tts-vc-/i.test(voice);
}

function isLegacyCosyVoice(voice: string): boolean {
  return /^cosyvoice/i.test(cleanConfigValue(voice));
}

function isRealtimeModel(model?: string | null): boolean {
  return /-realtime(?:-|$)/i.test(cleanConfigValue(model));
}

function resolveRequestedModel(voice: string, requestedModel?: string): string {
  if (isQwenPersonalVoice(voice)) {
    return isRealtimeModel(requestedModel)
      ? cleanConfigValue(requestedModel)
      : VC_MODEL;
  }
  // Legacy CosyVoice clones are no longer supported — synthesis falls back
  // to the default Qwen preset voice/model further down the pipeline.
  return normalizeStandardModel(requestedModel);
}

// TTS model for synthesis (known-working)
const TTS_MODEL = normalizeStandardModel(
  process.env.EXPO_PUBLIC_DASHSCOPE_TTS_MODEL,
);

// Voice-clone model for enrollment/training
const VC_MODEL = normalizeVcModel(process.env.EXPO_PUBLIC_DASHSCOPE_VC_MODEL);

// Default preset voice (fallback when no custom voice)
const DEFAULT_VOICE = normalizePresetVoice(
  process.env.EXPO_PUBLIC_DASHSCOPE_TTS_VOICE,
);

// Storage bucket for reference audio
const VOICE_CLONE_BUCKET =
  process.env.EXPO_PUBLIC_VOICE_CLONE_BUCKET_ID?.trim() ||
  "69ba654e003c3aa1b2c8";

// ── Endpoints ──
const VOICE_CLONE_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization";

function assertDashScopeConfigured() {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("EXPO_PUBLIC_DASHSCOPE_API_KEY is not configured.");
  }
}

type VoiceEnrollmentOptions = {
  transcript?: string;
  language?: string;
};

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
  options: VoiceEnrollmentOptions = {},
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
    console.log(
      `[voice] Small payload (${(totalBase64Bytes / 1024).toFixed(0)} KB), sending base64 directly...`,
    );
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
      throw new Error(
        `Voice clone function returned invalid JSON: ${fnResult.responseBody}`,
      );
    }
  } else {
    // ── Large file: upload to Storage → function converts internally → result in Storage ──
    console.log(
      `[voice] Large payload (${(totalBase64Bytes / 1024).toFixed(0)} KB), using clone_storage mode...`,
    );

    const uploadedFileIds: string[] = [];

    try {
      for (let i = 0; i < samplesBase64.length; i++) {
        const b64 = samplesBase64[i];
        const tmpPath = `${FileSystem.cacheDirectory}voice_tmp_${Date.now()}_${i}.m4a`;
        await FileSystem.writeAsStringAsync(tmpPath, b64, {
          encoding: "base64" as any,
        });

        const fileInfo = await FileSystem.getInfoAsync(tmpPath);
        if (!fileInfo.exists)
          throw new Error("Failed to write temp audio file");

        const fileId = ID.unique();

        // Upload via REST API to avoid react-native-appwrite SDK
        // chunked-upload bug with expo-file-system v19
        const formData = new FormData();
        formData.append("fileId", fileId);
        formData.append("file", {
          uri: tmpPath,
          name: `tmp_sample_${i}_${Date.now()}.m4a`,
          type: "audio/mp4",
        } as any);

        const uploadRes = await fetch(
          `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files`,
          {
            method: "POST",
            headers: {
              "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            },
            body: formData,
          },
        );
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(
            `Storage upload failed (${uploadRes.status}): ${errText}`,
          );
        }
        uploadedFileIds.push(fileId);
        console.log(
          `[voice] Uploaded sample ${i + 1}/${samplesBase64.length}: ${fileId}`,
        );

        await FileSystem.deleteAsync(tmpPath, { idempotent: true });
      }

      // Call function with clone_storage mode — function downloads internally,
      // converts with ffmpeg, uploads result WAV back to storage, returns file IDs only
      const execRes = await fetch(
        `${APPWRITE_ENDPOINT}/functions/${VOICE_CLONE_FUNCTION_ID}/executions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
          },
          body: JSON.stringify({
            body: JSON.stringify({
              mode: "clone_storage",
              fileIds: uploadedFileIds,
              bucketId: VOICE_CLONE_BUCKET,
              speakerName,
            }),
            method: "POST",
          }),
        },
      );
      if (!execRes.ok) {
        const errText = await execRes.text();
        throw new Error(
          `Function execution failed (${execRes.status}): ${errText}`,
        );
      }
      const fnResult = await execRes.json();
      console.log(
        `[voice] Function execution ${fnResult.$id}: status=${fnResult.status}`,
      );

      let storagePayload: any;
      try {
        storagePayload = JSON.parse(fnResult.responseBody);
      } catch {
        throw new Error(
          `Voice clone function returned invalid JSON: ${fnResult.responseBody}`,
        );
      }
      if (!storagePayload?.success) {
        throw new Error(storagePayload?.error || "Voice clone function failed");
      }

      const resultFileIds: string[] = storagePayload.resultFileIds || [];
      const fallbackId: string = storagePayload.voiceId || `pv_${Date.now()}`;

      if (resultFileIds.length === 0) {
        throw new Error("Voice clone function returned no result files.");
      }

      // The function already uploaded the normalized reference audio to storage.
      // Use resultFileIds[0] as the reference audio for DashScope registration.
      const referenceStorageFileId = resultFileIds[0];
      console.log(
        `[voice] Converted reference audio in storage: ${referenceStorageFileId}`,
      );

      // Register voice clone using the reference file's public download URL.
      const publicAudioUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files/${referenceStorageFileId}/download?project=${APPWRITE_PROJECT_ID}`;
      console.log(`[voice] Public audio URL for DashScope: ${publicAudioUrl}`);

      try {
        console.log(
          `[voice] Attempting DashScope voice clone (${VC_MODEL})...`,
        );
        const dashScopeVoiceId = await registerVoiceWithDashScope(
          publicAudioUrl,
          speakerName,
        );
        console.log(`[voice] DashScope voice registered: ${dashScopeVoiceId}`);
        return {
          voiceId: dashScopeVoiceId,
          convertedSamplesBase64: [],
          mode: "registered",
        };
      } catch (regErr) {
        console.warn("[voice] DashScope voice registration failed:", regErr);
      }

      // Fallback — use reference audio for zero-shot cloning
      const refVoiceId = `ref:${referenceStorageFileId}`;
      console.log(`[voice] Using reference-based voice: ${refVoiceId}`);
      return {
        voiceId: refVoiceId,
        convertedSamplesBase64: [],
        mode: "reference",
      };
    } finally {
      // Clean up temp input files from Storage (best-effort)
      for (const fid of uploadedFileIds) {
        try {
          await storage.deleteFile(VOICE_CLONE_BUCKET, fid);
        } catch {
          // Ignore cleanup failures
        }
      }
    }
  }

  // ── Below: shared path for small-file flow only ──

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

    // Upload via REST API to avoid SDK chunked-upload bug with expo-file-system v19
    const refFileId = `ref_${speakerName.replace(/\W/g, "_")}_${Date.now()}`;
    const refFormData = new FormData();
    refFormData.append("fileId", refFileId);
    refFormData.append("file", {
      uri: tempPath,
      name: `${speakerName}_reference.${ext}`,
      type: mimeType,
    } as any);

    const refUploadRes = await fetch(
      `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files`,
      {
        method: "POST",
        headers: {
          "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        },
        body: refFormData,
      },
    );
    if (!refUploadRes.ok) {
      throw new Error(`Reference upload failed (${refUploadRes.status})`);
    }
    storageFileId = refFileId;
    console.log(`[voice] Reference audio uploaded: ${storageFileId}`);

    // Clean up temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch (uploadErr) {
    console.warn(
      "[voice] Storage upload failed, continuing without:",
      uploadErr,
    );
  }

  // ── Step 3: Register voice clone using Appwrite Storage public URL ──
  if (storageFileId) {
    try {
      // Construct a publicly-accessible download URL for the uploaded file
      const publicAudioUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files/${storageFileId}/download?project=${APPWRITE_PROJECT_ID}`;
      console.log(`[voice] Public audio URL for DashScope: ${publicAudioUrl}`);

      console.log(`[voice] Attempting DashScope voice clone (${VC_MODEL})...`);
      const dashScopeVoiceId = await registerVoiceWithDashScope(
        publicAudioUrl,
        speakerName,
        options,
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
// DashScope Voice Clone registration (Qwen voice enrollment)
// ─────────────────────────────────────────────────────────────
async function registerVoiceWithDashScope(
  audioUrl: string,
  speakerName: string,
  options: VoiceEnrollmentOptions = {},
): Promise<string> {
  const prefix =
    speakerName
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 10) || "voice";
  const transcript = options.transcript?.trim();
  const sampleLanguage = options.language?.trim() || "zh";

  const payload = {
    model: "qwen-voice-enrollment",
    input: {
      action: "create",
      target_model: VC_MODEL,
      preferred_name: prefix,
      audio: {
        data: audioUrl,
      },
      language: sampleLanguage,
      ...(transcript ? { text: transcript } : {}),
    },
  };

  console.log(
    `[voice] Voice clone request: model=qwen-voice-enrollment, target_model=${VC_MODEL}, preferred_name=${prefix}`,
  );
  console.log(`[voice] Audio URL: ${audioUrl}`);
  console.log(
    `[voice] Transcript attached: ${transcript ? "yes" : "no"}, sample language: ${sampleLanguage}`,
  );

  // Retry up to 3 times for transient 5xx failures.
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
    console.log(
      `[voice] Voice clone response attempt ${attempt} (${response.status}): ${rawText.slice(0, 500)}`,
    );

    if (response.ok || response.status < 500) break; // success or non-retryable error
    if (attempt < MAX_RETRIES) {
      console.log(
        `[voice] Retrying voice clone in 3s (attempt ${attempt}/${MAX_RETRIES})...`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      `DashScope voice clone failed (${response?.status}): ${rawText}`,
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("DashScope voice clone returned non-JSON response");
  }

  const voiceId = data?.output?.voice || data?.output?.voice_id;
  if (!voiceId) {
    throw new Error(
      `DashScope voice clone returned no voice identifier: ${rawText}`,
    );
  }

  console.log(`[voice] Voice created: ${voiceId}`);
  return voiceId;
}

// ─────────────────────────────────────────────────────────────
// TTS Synthesis: synthesize speech using Qwen TTS
//
// If voice is a registered Qwen personal voice → use the VC realtime model.
// If voice starts with "ref:" → fall back to the default preset voice.
// Otherwise → treat as a preset/system voice and use qwen3-tts-flash.
// ─────────────────────────────────────────────────────────────

export async function synthesizePersonalVoice(
  text: string,
  voice: string,
  model: string = TTS_MODEL,
  language?: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  assertDashScopeConfigured();

  let resolvedVoice = cleanConfigValue(voice) || DEFAULT_VOICE;

  // ── Legacy CosyVoice clones are no longer supported \u2014 fall back to default preset ──
  if (isLegacyCosyVoice(resolvedVoice)) {
    console.warn(
      `[voice] Legacy CosyVoice ID "${resolvedVoice}" is unsupported; falling back to ${DEFAULT_VOICE}.`,
    );
    resolvedVoice = DEFAULT_VOICE;
  }

  // ── Reference-based (zero-shot) cloning via Appwrite function ──
  if (isReferenceVoice(resolvedVoice)) {
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
  const resolvedModel = resolveRequestedModel(voice, model);

  // Route through Appwrite function which selects the correct Qwen backend.
  const requestBody: Record<string, any> = {
    mode: "synthesize",
    text,
    model: resolvedModel,
    voice: voice || DEFAULT_VOICE,
    format: "mp3",
    sampleRate: isQwenPersonalVoice(voice) ? 24000 : 22050,
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

      // If the function ran but returned a non-2xx, surface the JSON `error` field
      // from the response body instead of the opaque status code.
      if (
        execution.status === "completed" &&
        execution.responseStatusCode !== 200
      ) {
        let upstreamError = "";
        try {
          const parsed = JSON.parse(execution.responseBody);
          upstreamError = parsed?.error || "";
        } catch {
          upstreamError = (execution.responseBody || "").slice(0, 300);
        }
        throw new Error(
          `TTS upstream error (HTTP ${execution.responseStatusCode}): ${upstreamError || "no details"}`,
        );
      }

      // Appwrite reports status=failed when the function process crashed or
      // hit the sync execution timeout. `execution.errors` is often empty in
      // that case, so we cannot rely on a "timeout" substring — treat any
      // failed execution as transient and retry.
      if (execution.status !== "completed") {
        throw new Error(
          `TTS execution did not complete (status=${execution.status}, code=${execution.responseStatusCode}): ${execution.errors || "no error message (likely sync timeout or cold-start crash)"}`,
        );
      }

      let payload: any;
      try {
        payload = JSON.parse(execution.responseBody);
      } catch {
        throw new Error(
          `Appwrite TTS function returned invalid JSON: ${execution.responseBody}`,
        );
      }

      if (!payload?.success) {
        throw new Error(payload?.error || "Appwrite TTS function failed");
      }

      if (payload.audioBase64) {
        return { audioBase64: payload.audioBase64 };
      }

      throw new Error("Appwrite TTS function returned no audio");
    } catch (err: any) {
      const message = String(err?.message || "");
      const isRetryable =
        /timed?\s*out|408|timeout|did not complete|status=failed/i.test(
          message,
        );
      if (isRetryable && attempt < maxAttempts) {
        const backoffMs = 500 * attempt;
        console.warn(
          `[voice] TTS attempt ${attempt}/${maxAttempts} failed (${message.slice(0, 120)}), retrying in ${backoffMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error("TTS failed after all retry attempts");
}

// ── Zero-shot cloning fallback ──
// The Qwen TTS path doesn't support inline reference audio here.
// Fall back to default voice for ref: voices.
async function synthesizeWithReference(
  text: string,
  storageFileId: string,
  model: string,
  language?: string,
): Promise<{ audioBase64?: string; audioUrl?: string }> {
  console.warn(
    `[voice] Reference-based TTS not supported for ${storageFileId}, using default voice`,
  );
  return synthesizeDirect(text, DEFAULT_VOICE, model, language);
}

// ── Utility ──
export async function readAudioFileAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as any,
  });
}

export { DEFAULT_VOICE, TTS_MODEL, VC_MODEL, VOICE_CLONE_BUCKET };
