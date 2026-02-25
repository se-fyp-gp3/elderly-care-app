/**
 * Azure Custom Neural Voice (Personal Voice) – Voice Cloning API
 *
 * This module handles:
 * 1. Creating speaker consent via Azure Speech Service
 * 2. Creating personal voice profiles from audio samples
 * 3. Querying voice profile status
 * 4. Storing voice_id associations in Appwrite (caregiverId → elderlyId)
 *
 * Azure API:
 *   - Custom Neural Voice REST API v3.1‑preview1
 *   - Personal Voice with speakerProfileId for TTS (DragonLatestNeural)
 *   - Base: https://{region}.customvoice.api.speech.microsoft.com/api/texttospeech/3.1-preview1
 *
 * Audio: 16 kHz, mono, mp3, 3–30 s per sample
 *
 * NOTE: Cannot be tested in Expo Go — use EAS Build dev client.
 */

import * as FileSystem from "expo-file-system";
import { ID, Models, Query } from "react-native-appwrite";
import { DATABASE_ID, tablesDB } from "./appwrite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AZURE_SPEECH_KEY =
  process.env.EXPO_PUBLIC_AZURE_SPEECH_KEY?.trim() || "";
const AZURE_SPEECH_REGION =
  process.env.EXPO_PUBLIC_AZURE_SPEECH_REGION?.trim() || "eastasia";

/** Azure Custom Neural Voice REST API base URL. */
const CNV_API_BASE = `https://${AZURE_SPEECH_REGION}.customvoice.api.speech.microsoft.com/api/texttospeech/3.1-preview1`;

export const CUSTOM_VOICE_TABLE_ID =
  process.env.EXPO_PUBLIC_CUSTOM_VOICE_TABLE_ID || "custom_voice";

export const MAX_SAMPLES = 5;
export const MIN_SAMPLES = 1;
export const MIN_DURATION_SEC = 3;
export const MAX_DURATION_SEC = 30;
export const SAMPLE_RATE = 16000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceSample {
  id: string;
  uri: string;
  durationMs: number;
  fileName: string;
}

export type CustomVoiceRecord = Models.Row & {
  caregiver_id: string;
  caregiver_name: string;
  elderly_id: string;
  voice_id: string;
  status: "pending" | "training" | "ready" | "failed";
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Standard auth header for Azure Speech API. */
const authHeader = () => ({
  "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
});

/** Cached project ID – created/discovered once per session. */
let _projectId: string | null = null;

/**
 * Ensure an Azure Custom Neural Voice project exists.
 * Creates a "PersonalVoice" project on first call if none is found.
 */
async function ensureProject(): Promise<string> {
  if (_projectId) return _projectId;

  // 1. Try to find an existing project
  const listRes = await fetch(`${CNV_API_BASE}/projects`, {
    headers: authHeader(),
  });

  if (listRes.ok) {
    const body = await listRes.json();
    const projects: any[] = body?.value ?? body ?? [];
    const existing = projects.find(
      (p: any) =>
        (p.displayName || p.projectName) === "elderly-care-voice",
    );
    if (existing) {
      _projectId = existing.id;
      return _projectId!;
    }
  }

  // 2. Create a new project
  const createRes = await fetch(`${CNV_API_BASE}/projects`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "PersonalVoice",
      displayName: "elderly-care-voice",
      description: "Elderly Care App – Caregiver Personal Voice Profiles",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error("Azure project creation error:", err);
    throw new Error(
      "Failed to initialise the voice service. Please try again.",
    );
  }

  const proj = await createRes.json();
  _projectId = proj.id ?? proj.projectId;
  return _projectId!;
}

/**
 * Write base64 audio data to a temporary cache file and return its URI.
 */
async function base64ToTempFile(
  base64: string,
  prefix: string,
): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}${prefix}_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

// ---------------------------------------------------------------------------
// Azure CNV – Personal Voice API calls
// ---------------------------------------------------------------------------

/**
 * Upload audio samples and create a personal voice via Azure CNV.
 *
 * Flow:
 *   1. Ensure a project exists
 *   2. Create speaker consent (first audio sample)
 *   3. Create personal voice profile (all audio samples)
 *   4. Return the personal‑voice profile ID (speakerProfileId)
 *
 * @param samplesBase64 Array of base64‑encoded mp3 audio data
 * @param speakerName   Human‑readable label for the voice
 * @returns The personal‑voice profile ID string
 */
export async function createCustomVoice(
  samplesBase64: string[],
  speakerName: string,
): Promise<string> {
  if (!AZURE_SPEECH_KEY) {
    throw new Error(
      "Azure Speech key is not configured. Please add EXPO_PUBLIC_AZURE_SPEECH_KEY to your environment.",
    );
  }

  if (samplesBase64.length < MIN_SAMPLES) {
    throw new Error(`Please record at least ${MIN_SAMPLES} audio sample(s).`);
  }

  // ---- Step 1: ensure project ----
  const projectId = await ensureProject();

  // ---- Step 2: create consent (using first sample as consent audio) ----
  const consentId = `consent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const consentUri = await base64ToTempFile(samplesBase64[0], "consent");

  const consentForm = new FormData();
  consentForm.append("projectId", projectId);
  consentForm.append("voiceTalentName", speakerName);
  consentForm.append("companyName", "Elderly Care App");
  consentForm.append("locale", "zh-CN");
  consentForm.append("audiodata", {
    uri: consentUri,
    type: "audio/mpeg",
    name: "consent.mp3",
  } as any);

  const consentRes = await fetch(
    `${CNV_API_BASE}/consents/${consentId}`,
    { method: "PUT", headers: authHeader(), body: consentForm },
  );

  if (!consentRes.ok) {
    const err = await consentRes.text();
    console.error("Azure consent error:", err);
    throw new Error("Voice consent creation failed. Please try again.");
  }

  const consentData = await consentRes.json();
  const resolvedConsentId: string = consentData?.id ?? consentId;

  // ---- Step 3: write all samples to temp files ----
  const sampleUris: string[] = [];
  for (let i = 0; i < samplesBase64.length; i++) {
    sampleUris.push(
      await base64ToTempFile(samplesBase64[i], `sample_${i}`),
    );
  }

  // ---- Step 4: create personal voice profile ----
  const pvForm = new FormData();
  pvForm.append("projectId", projectId);
  pvForm.append("consentId", resolvedConsentId);
  pvForm.append("description", `Personal voice – ${speakerName}`);

  sampleUris.forEach((uri, i) => {
    pvForm.append("audiodata", {
      uri,
      type: "audio/mpeg",
      name: `sample_${i + 1}.mp3`,
    } as any);
  });

  const pvRes = await fetch(`${CNV_API_BASE}/personalvoices`, {
    method: "POST",
    headers: authHeader(),
    body: pvForm,
  });

  if (!pvRes.ok) {
    const err = await pvRes.text();
    console.error("Azure personal voice error:", err);
    throw new Error("Voice creation failed. Please try again later.");
  }

  const pvData = await pvRes.json();
  const voiceId: string | undefined =
    pvData?.speakerProfileId ?? pvData?.id ?? pvData?.personalVoiceId;

  if (!voiceId) {
    throw new Error("Voice creation succeeded but no voice ID was returned.");
  }

  // Cleanup temp files (fire‑and‑forget)
  for (const uri of [consentUri, ...sampleUris]) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }

  return voiceId;
}

/**
 * Query the processing / training status of a personal voice.
 */
export async function queryVoiceStatus(
  voiceId: string,
): Promise<"pending" | "training" | "ready" | "failed"> {
  if (!AZURE_SPEECH_KEY) {
    throw new Error("Azure Speech key is not configured.");
  }

  const response = await fetch(
    `${CNV_API_BASE}/personalvoices/${voiceId}`,
    { headers: authHeader() },
  );

  if (!response.ok) return "failed";

  const data = await response.json();
  const raw = (data?.status ?? "").toLowerCase();

  if (["succeeded", "ready", "completed"].includes(raw)) return "ready";
  if (["running", "training", "processing"].includes(raw)) return "training";
  if (["failed", "error", "disabledfailed"].includes(raw)) return "failed";
  return "pending";
}

// ---------------------------------------------------------------------------
// Appwrite CRUD – custom_voice table
// ---------------------------------------------------------------------------

/**
 * Save a custom voice record to Appwrite.
 */
export async function saveCustomVoiceRecord(
  record: Pick<
    CustomVoiceRecord,
    | "caregiver_id"
    | "caregiver_name"
    | "elderly_id"
    | "voice_id"
    | "status"
    | "created_at"
    | "updated_at"
  >,
): Promise<CustomVoiceRecord> {
  const doc = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: ID.unique(),
    data: {
      caregiver_id: record.caregiver_id,
      caregiver_name: record.caregiver_name,
      elderly_id: record.elderly_id,
      voice_id: record.voice_id,
      status: record.status,
      created_at: record.created_at,
      updated_at: record.updated_at,
    },
  });
  return doc as unknown as CustomVoiceRecord;
}

/**
 * Update an existing voice record (e.g., status change).
 */
export async function updateCustomVoiceRecord(
  documentId: string,
  updates: Partial<CustomVoiceRecord>,
): Promise<void> {
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: documentId,
    data: {
      ...(updates.voice_id !== undefined && { voice_id: updates.voice_id }),
      ...(updates.status !== undefined && { status: updates.status }),
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Fetch all custom voice records linked to a specific elderly user.
 * Used by the elderly settings page to list available caregiver voices.
 */
export async function getCustomVoicesForElderly(
  elderlyId: string,
): Promise<CustomVoiceRecord[]> {
  try {
    const response = await tablesDB.listRows<CustomVoiceRecord>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      queries: [
        Query.equal("elderly_id", elderlyId),
        Query.equal("status", "ready"),
        Query.orderDesc("$createdAt"),
      ],
    });
    return response.rows as unknown as CustomVoiceRecord[];
  } catch (error) {
    console.error("Error fetching custom voices:", error);
    return [];
  }
}

/**
 * Fetch custom voice records created by a specific caregiver.
 * Used by the caregiver more page to show their recordings.
 */
export async function getCustomVoicesForCaregiver(
  caregiverId: string,
): Promise<CustomVoiceRecord[]> {
  try {
    const response = await tablesDB.listRows<CustomVoiceRecord>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      queries: [
        Query.equal("caregiver_id", caregiverId),
        Query.orderDesc("$createdAt"),
      ],
    });
    return response.rows as unknown as CustomVoiceRecord[];
  } catch (error) {
    console.error("Error fetching caregiver voices:", error);
    return [];
  }
}

/**
 * Delete a custom voice record from Appwrite.
 */
export async function deleteCustomVoiceRecord(
  documentId: string,
): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: documentId,
  });
}
