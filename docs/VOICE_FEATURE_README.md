# Voice AI — Summary & Quick README

A concise summary and quick usage guide for the project's voice-related AI functions (voice cloning and TTS).

## Overview
This project provides two primary client-side voice AI helpers implemented in [lib/personal-voice.ts](lib/personal-voice.ts):

- `createPersonalVoice(samplesBase64, speakerName)` — create a personal voice from recorded samples.
- `synthesizePersonalVoice(text, voice)` — synthesize speech for a given `text` using a registered/preset voice.
- `readAudioFileAsBase64(uri)` — small helper to read a local file as base64 for upload.

The full, in-depth technical design and troubleshooting notes are in [docs/PERSONAL_VOICE.md](docs/PERSONAL_VOICE.md).

## Quick behavior summary

- createPersonalVoice:
  1. Calls an Appwrite function (server-side conversion) to normalize/convert samples.
  2. Uploads a converted reference file to Appwrite Storage (bucket `voice-clones`).
  3. Attempts to register the uploaded file with DashScope (voice-enrollment API).
  4. Returns either a DashScope `voiceId` (mode: `registered`) or a fallback `ref:<fileId>` (mode: `reference`).

- synthesizePersonalVoice:
  - If `voice` is a DashScope-registered voice → uses it directly for TTS.
  - If `voice` is `ref:<fileId>` → fallback strategy (current implementation routes to default voice).
  - Otherwise uses a preset default voice.

## APIs (reference)

- `createPersonalVoice(samplesBase64: string[], speakerName: string)`
  - Returns: `{ voiceId: string, convertedSamplesBase64: string[], mode: "registered" | "reference" }`
  - Throws on missing samples, conversion/function failures, or DashScope errors.

- `synthesizePersonalVoice(text: string, voice: string, model?: string, language?: string)`
  - Returns: `{ audioBase64?: string; audioUrl?: string }` (usually `audioBase64` for immediate playback).

- `readAudioFileAsBase64(uri: string): Promise<string>` — returns base64 string for a local URI.

## Minimal usage examples

Example — create a personal voice from a single recorded file:

```ts
import * as FileSystem from 'expo-file-system';
import { readAudioFileAsBase64, createPersonalVoice, synthesizePersonalVoice } from '@/lib/personal-voice';

async function exampleCreateVoice(recordedUri: string) {
  // Convert local file to base64 for upload
  const base64 = await readAudioFileAsBase64(recordedUri);

  // Create personal voice (may return a registered voiceId or a ref: fallback)
  const { voiceId, convertedSamplesBase64, mode } = await createPersonalVoice([base64], 'Alice');
  console.log('voiceId:', voiceId, 'mode:', mode);

  // Synthesize a test line using the returned voiceId
  const tts = await synthesizePersonalVoice('Hello, this is a test.', voiceId);
  if (tts.audioBase64) {
    const outPath = `${FileSystem.cacheDirectory}tts_test_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(outPath, tts.audioBase64, { encoding: FileSystem.EncodingType.Base64 });
    // Play outPath with your preferred audio player (expo-av / expo-audio)
  }
}
```

Example — synthesize with a preset voice:

```ts
const response = await synthesizePersonalVoice('Good morning!', 'longxiaochun_v2');
// write response.audioBase64 to file and play
```

## Required environment variables

Set these in your environment (`.env.local` for Expo) before running:

- `EXPO_PUBLIC_DASHSCOPE_API_KEY` — DashScope API key (required)
- `EXPO_PUBLIC_DASHSCOPE_TTS_MODEL` — defaults to `cosyvoice-v2`
- `EXPO_PUBLIC_DASHSCOPE_VC_MODEL` — voice-enrollment model (defaults in repo)
- `EXPO_PUBLIC_DASHSCOPE_TTS_VOICE` — fallback preset voice name
- `EXPO_PUBLIC_VOICE_CLONE_BUCKET_ID` — Appwrite bucket name for uploaded refs (`voice-clones`)
- `EXPO_PUBLIC_VOICE_CLONE_FUNCTION_ID` — Appwrite function ID used for conversion/TTS
- Appwrite connection envs used elsewhere: `EXPO_PUBLIC_APPWRITE_ENDPOINT`, `EXPO_PUBLIC_APPWRITE_PROJECT_ID`, and any Appwrite dev keys used in local dev

## Appwrite function notes

- The client uses an Appwrite function (folder: `voice-clone-convert`) to perform:
  - audio conversion (ffmpeg), and
  - WebSocket-based TTS (DashScope) when requested.
- Ensure the Appwrite function includes `ws` and `ffmpeg`/`ffmpeg-static` in dependencies and has a suitable timeout for TTS (longer than 15s for longer texts).

## Testing & quick steps

1. Configure env vars in `.env.local` and restart Metro.
2. Deploy the Appwrite function `voice-clone-convert` (Node 18 runtime). Ensure dependencies are installed.
3. Run the app locally: `npx expo run:android` and exercise the caregiver settings flow (record → clone).
4. For production EAS builds: `npx eas build --platform android --profile development` then test on device.

## Troubleshooting (short)

- Appwrite `File extension not allowed`: ensure uploaded file names include an extension (the app sets one automatically), and verify bucket allowed extensions in Appwrite console.
- DashScope 403: check `EXPO_PUBLIC_DASHSCOPE_API_KEY` and model availability.
- Clone failed or `UNDEPLOYED`: ensure converted audio is clean (mono, 16kHz) and long enough; the Appwrite conversion uses ffmpeg.

---

For a deep technical walkthrough, error logs, and WebSocket protocol details, see: [docs/PERSONAL_VOICE.md](docs/PERSONAL_VOICE.md).

