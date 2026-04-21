import {
    CustomVoice,
    CustomVoiceSlot,
    CustomVoiceStatus,
} from "@/types/appwrite";
import type { UserPreferences } from "@/types/user";
import { ID, Query } from "react-native-appwrite";
import { CUSTOM_VOICE_TABLE_ID, DATABASE_ID, tablesDB } from "./appwrite";

const CUSTOM_VOICE_SLOT_MARKER = "|slot=";

function encodeStoredVoiceId(
  voiceId: string,
  slot: CustomVoiceSlot,
): string {
  const resolvedVoiceId = getResolvedCustomVoiceId(voiceId);

  if (!resolvedVoiceId || slot === CustomVoiceSlot.DEFAULT) {
    return resolvedVoiceId;
  }

  return `${resolvedVoiceId}${CUSTOM_VOICE_SLOT_MARKER}${slot}`;
}

function getSlotFromStoredVoiceId(voiceId?: string | null): CustomVoiceSlot {
  const resolvedVoiceId = typeof voiceId === "string" ? voiceId : "";
  const markerIndex = resolvedVoiceId.lastIndexOf(CUSTOM_VOICE_SLOT_MARKER);

  if (markerIndex === -1) {
    return CustomVoiceSlot.DEFAULT;
  }

  const slot = resolvedVoiceId.slice(
    markerIndex + CUSTOM_VOICE_SLOT_MARKER.length,
  );

  return slot === CustomVoiceSlot.CANTONESE
    ? CustomVoiceSlot.CANTONESE
    : CustomVoiceSlot.DEFAULT;
}

function shouldRetryWithoutVoiceSlot(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return /voice_slot|unknown attribute|invalid document structure/i.test(message);
}

export function getResolvedCustomVoiceId(
  voice: Pick<CustomVoice, "voice_id"> | string | null | undefined,
): string {
  const storedVoiceId =
    typeof voice === "string" ? voice : voice?.voice_id ?? "";
  const markerIndex = storedVoiceId.lastIndexOf(CUSTOM_VOICE_SLOT_MARKER);

  if (markerIndex === -1) {
    return storedVoiceId;
  }

  return storedVoiceId.slice(0, markerIndex);
}

export function normalizeCustomVoiceSlot(
  slot?: string | null | Pick<CustomVoice, "voice_id" | "voice_slot">,
): CustomVoiceSlot {
  if (typeof slot === "object" && slot !== null) {
    return slot.voice_slot === CustomVoiceSlot.CANTONESE
      ? CustomVoiceSlot.CANTONESE
      : getSlotFromStoredVoiceId(slot.voice_id);
  }

  return slot === CustomVoiceSlot.CANTONESE
    ? CustomVoiceSlot.CANTONESE
    : CustomVoiceSlot.DEFAULT;
}

export function resolveCustomVoiceSlotFromLanguage(
  language?: string | null,
): CustomVoiceSlot {
  const normalized = language?.trim().toLowerCase();

  if (
    normalized === "cantonese" ||
    normalized === "yue" ||
    normalized === "zh-hk" ||
    normalized === "zh-yue"
  ) {
    return CustomVoiceSlot.CANTONESE;
  }

  return CustomVoiceSlot.DEFAULT;
}

export function selectBestCustomVoiceForSlot(
  voices: CustomVoice[],
  slot: CustomVoiceSlot,
  caregiverId?: string,
): CustomVoice | undefined {
  const scopedVoices = caregiverId
    ? voices.filter((voice) => voice.caregiver_id === caregiverId)
    : voices;

  const exactMatch = scopedVoices.find(
    (voice) => normalizeCustomVoiceSlot(voice) === slot,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const defaultMatch = scopedVoices.find(
    (voice) => normalizeCustomVoiceSlot(voice) === CustomVoiceSlot.DEFAULT,
  );

  return defaultMatch ?? scopedVoices[0];
}

export function getCustomVoiceSelectionsForCaregiver(
  voices: CustomVoice[],
  caregiverId: string,
): {
  defaultVoice?: CustomVoice;
  cantoneseVoice?: CustomVoice;
} {
  const defaultVoice = selectBestCustomVoiceForSlot(
    voices,
    CustomVoiceSlot.DEFAULT,
    caregiverId,
  );
  const cantoneseExact = voices.find(
    (voice) =>
      voice.caregiver_id === caregiverId &&
      normalizeCustomVoiceSlot(voice) === CustomVoiceSlot.CANTONESE,
  );

  return {
    defaultVoice,
    cantoneseVoice: cantoneseExact ?? defaultVoice,
  };
}

export function resolvePreferredAiVoiceId(
  preferences: UserPreferences,
  language?: string | null,
): string {
  const slot = resolveCustomVoiceSlotFromLanguage(language);
  const defaultVoiceId =
    typeof preferences.aiVoiceDefaultId === "string"
      ? getResolvedCustomVoiceId(preferences.aiVoiceDefaultId)
      : "";
  const cantoneseVoiceId =
    typeof preferences.aiVoiceCantoneseId === "string"
      ? getResolvedCustomVoiceId(preferences.aiVoiceCantoneseId)
      : "";
  const legacyVoiceId =
    typeof preferences.aiVoiceId === "string"
      ? getResolvedCustomVoiceId(preferences.aiVoiceId)
      : "";

  if (slot === CustomVoiceSlot.CANTONESE) {
    return cantoneseVoiceId || defaultVoiceId || legacyVoiceId;
  }

  return defaultVoiceId || legacyVoiceId || cantoneseVoiceId;
}

export async function saveCustomVoiceRecord(input: {
  caregiverId: string;
  caregiverName: string;
  elderlyId: string;
  voiceId: string;
  voiceSlot?: CustomVoiceSlot;
  status?: CustomVoiceStatus;
}): Promise<CustomVoice> {
  const now = new Date().toISOString();
  const slot = input.voiceSlot ?? CustomVoiceSlot.DEFAULT;
  const data = {
    caregiver_id: input.caregiverId,
    caregiver_name: input.caregiverName,
    elderly_id: input.elderlyId,
    voice_id: encodeStoredVoiceId(input.voiceId, slot),
    voice_slot: slot,
    status: input.status ?? CustomVoiceStatus.READY,
    created_at: now,
    updated_at: now,
  };

  try {
    const row = await tablesDB.createRow<CustomVoice>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      rowId: ID.unique(),
      data,
    });

    return row as unknown as CustomVoice;
  } catch (error) {
    if (!shouldRetryWithoutVoiceSlot(error)) {
      throw error;
    }

    const { voice_slot: _ignoredSlot, ...fallbackData } = data;

    const row = await tablesDB.createRow<CustomVoice>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      rowId: ID.unique(),
      data: fallbackData,
    });

    return row as unknown as CustomVoice;
  }
}

export async function updateCustomVoiceRecord(
  documentId: string,
  data: Partial<Pick<CustomVoice, "voice_id" | "voice_slot" | "status">>,
): Promise<CustomVoice> {
  const now = new Date().toISOString();
  const nextData: Record<string, unknown> = {
    ...data,
    updated_at: now,
  };

  if (typeof data.voice_id === "string") {
    nextData.voice_id = encodeStoredVoiceId(
      data.voice_id,
      data.voice_slot ?? CustomVoiceSlot.DEFAULT,
    );
  }

  try {
    const row = await tablesDB.updateRow<CustomVoice>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      rowId: documentId,
      data: nextData,
    });

    return row as unknown as CustomVoice;
  } catch (error) {
    if (!shouldRetryWithoutVoiceSlot(error)) {
      throw error;
    }

    const { voice_slot: _ignoredSlot, ...fallbackData } = nextData;

    const row = await tablesDB.updateRow<CustomVoice>({
      databaseId: DATABASE_ID,
      tableId: CUSTOM_VOICE_TABLE_ID,
      rowId: documentId,
      data: fallbackData,
    });

    return row as unknown as CustomVoice;
  }
}

export async function deleteCustomVoiceRecord(
  documentId: string,
): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    rowId: documentId,
  });
}

export async function getCustomVoicesForElderly(
  elderlyId: string,
  options?: {
    slot?: CustomVoiceSlot;
    caregiverId?: string;
  },
): Promise<CustomVoice[]> {
  const response = await tablesDB.listRows<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    queries: [
      Query.equal("elderly_id", elderlyId),
      Query.equal("status", CustomVoiceStatus.READY),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ],
  });

  let rows = response.rows as unknown as CustomVoice[];

  if (options?.caregiverId) {
    rows = rows.filter((voice) => voice.caregiver_id === options.caregiverId);
  }

  if (options?.slot) {
    rows = rows.filter(
      (voice) => normalizeCustomVoiceSlot(voice) === options.slot,
    );
  }

  return rows;
}

export async function getCustomVoicesForCaregiver(
  caregiverId: string,
  options?: {
    slot?: CustomVoiceSlot;
    elderlyId?: string;
  },
): Promise<CustomVoice[]> {
  const response = await tablesDB.listRows<CustomVoice>({
    databaseId: DATABASE_ID,
    tableId: CUSTOM_VOICE_TABLE_ID,
    queries: [
      Query.equal("caregiver_id", caregiverId),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ],
  });

  let rows = response.rows as unknown as CustomVoice[];

  if (options?.elderlyId) {
    rows = rows.filter((voice) => voice.elderly_id === options.elderlyId);
  }

  if (options?.slot) {
    rows = rows.filter(
      (voice) => normalizeCustomVoiceSlot(voice) === options.slot,
    );
  }

  return rows;
}
