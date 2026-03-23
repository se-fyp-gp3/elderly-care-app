# Personal Voice — Technical Documentation

## Overview

The Personal Voice feature allows caregivers to clone their own voice and use it for AI text-to-speech (TTS) replies in the elderly chat interface. The system uses **Alibaba DashScope CosyVoice v2** for multilingual TTS synthesis and voice cloning, with an **Appwrite Cloud Function** as middleware.

---

## Architecture

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────────────┐
│  React Native    │ ──►  │  Appwrite Function        │ ──►  │  DashScope API       │
│  (Expo)          │      │  voice-clone-convert       │      │  CosyVoice v2        │
│                  │ ◄──  │  (Node 18 + ffmpeg)        │ ◄──  │  WebSocket TTS       │
└─────────────────┘      └──────────────────────────┘      └─────────────────────┘
         │                         │
         ▼                         ▼
   Appwrite Prefs            Appwrite Storage
   (voice selection)         (reference audio)
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| Client voice lib | `lib/personal-voice.ts` | Voice cloning registration, TTS synthesis calls |
| Custom voice CRUD | `lib/custom-voice.ts` | Appwrite DB records for saved voices |
| Appwrite function | `voice-clone-convert/src/main.js` | Audio conversion (ffmpeg) + WebSocket TTS |
| Elderly chat | `app/(elderly-tabs)/chat.tsx` | AI chat with TTS playback + language selector |
| Elderly settings | `app/(elderly-tabs)/settings.tsx` | Voice toggle, caregiver voice picker, language |
| Caregiver settings | `app/(caregiver-tabs)/settings.tsx` | Voice recording, cloning UI, language selector |

---

## Voice Cloning Pipeline

### Step 1 — Record Audio (Client)

Caregiver records voice samples in the settings page using `expo-audio`. Recorded as `.m4a` files.

### Step 2 — Convert Audio (Appwrite Function)

Request: `mode: "clone"` with `samplesBase64` array.

The Appwrite function:
1. Writes base64 audio to temp files
2. Converts `.m4a` → `.wav` (mono, 16kHz, PCM s16le) via **ffmpeg-static**
3. Generates a deterministic `voiceId` via SHA-256 hash of speaker name + samples
4. Returns `convertedSamplesBase64` (WAV) + `voiceId`

### Step 3 — Upload Reference Audio (Client)

The client uploads the first converted WAV to **Appwrite Storage** bucket `voice-clones` for persistent reference.

### Step 4 — Register Voice with DashScope (Client)

Calls DashScope voice enrollment API:
- **Endpoint:** `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization`
- **Model:** `voice-enrollment`
- **Target model:** `cosyvoice-v2`
- **Input:** Publicly-accessible Appwrite Storage URL for the reference audio
- **Retry:** Up to 3 attempts for transient 500 errors (e.g. "request asr failed")

### Step 5 — Poll Voice Status (Client)

After registration, polls `query_voice` action every 2s (max 60 attempts / 2 min):
- `DEPLOYING` → keep polling
- `OK` → voice is ready, return `voice_id` (e.g. `cosyvoice-v2-aaa-8b2334ad4efe4ed48d47e0153513a968`)
- `UNDEPLOYED` → audio failed quality check, throw error

### Step 6 — Save Voice Record (Client)

On success, saves a `CustomVoice` document to Appwrite database with `voice_id`, `caregiver_id`, `elderly_id`, status `READY`.

---

## TTS Synthesis Pipeline

### Trigger

When `aiVoiceEnabled` is ON in elderly preferences, after each AI response in chat, `speakAiResponse()` is called.

### Flow

1. **Client** (`lib/personal-voice.ts` → `synthesizeDirect`) calls Appwrite function
2. **Appwrite function** (`mode: "synthesize"`) opens WebSocket to DashScope:
   - URL: `wss://dashscope.aliyuncs.com/api-ws/v1/inference`
   - Sends `run-task` → receives `task-started` → sends `continue-task` (text) → sends `finish-task`
   - Collects binary audio chunks → returns base64 MP3
3. **Client** decodes base64, writes to temp file, plays via `expo-audio`

### WebSocket Message Sequence

```
Client → Server:  run-task     (model, voice, format, rate, etc.)
Server → Client:  task-started
Client → Server:  continue-task (text payload)
Client → Server:  finish-task
Server → Client:  [binary audio chunks...]
Server → Client:  task-finished
```

### TTS Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Model | `cosyvoice-v2` | Multilingual (Cantonese/Mandarin/English) |
| Format | `mp3` | Output audio format |
| Sample rate | 22050 Hz | |
| Rate | 0.9 | Slightly slower for elderly users |
| Volume | 50 | Default level |
| Timeout | 90s | WebSocket connection timeout |
| Default voice | `longxiaochun_v2` | Fallback when no custom voice set |

---

## Language Selection

### Supported Languages

| Key | Label | System Prompt Instruction |
|-----|-------|--------------------------|
| `cantonese` | 粵語 | "You MUST reply in 香港粵語 (Hong Kong Cantonese written Chinese). Use informal Cantonese written style." |
| `mandarin` | 普通話 | "You MUST reply in 普通話 (Mandarin Chinese, simplified or traditional)." |
| `english` | English | "You MUST reply in English." |

### How It Works

- Stored in Appwrite user preferences as `voiceReplyLang` (default: `"cantonese"`)
- The AI system prompt in `buildConversationMessages()` includes a language instruction
- CosyVoice v2 is natively multilingual — it detects the language from the input text, so **no backend language parameter is needed**
- The language selector appears in:
  - Elderly chat top bar (Menu + Chip dropdown, visible only when voice is ON)
  - Elderly settings (Chip row after Caregiver Voice, visible only when voice is ON)
  - Caregiver settings (dedicated Card section)

---

## Configuration & Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EXPO_PUBLIC_DASHSCOPE_API_KEY` | — | DashScope API key (required) |
| `EXPO_PUBLIC_DASHSCOPE_TTS_MODEL` | `cosyvoice-v2` | TTS synthesis model |
| `EXPO_PUBLIC_DASHSCOPE_VC_MODEL` | `cosyvoice-clone-v1` | Voice enrollment model |
| `EXPO_PUBLIC_DASHSCOPE_TTS_VOICE` | `longxiaochun_v2` | Default preset voice |
| `EXPO_PUBLIC_VOICE_CLONE_BUCKET_ID` | `voice-clones` | Appwrite Storage bucket |
| `DASHSCOPE_API_KEY` | — | Same key, used in Appwrite function env |
| `DASHSCOPE_TTS_MODEL` | `cosyvoice-v2` | TTS model in Appwrite function |

### Appwrite Function Config

| Setting | Value |
|---------|-------|
| Function ID | `69a525190013dd81fb58` |
| Runtime | Node 18 |
| Entrypoint | `src/main.js` |
| Build command | `npm install` |
| Timeout | 15s (clone) / 90s (WebSocket TTS internal) |
| Permissions | `any` |

---

## Errors Encountered & Resolutions

### 1. DashScope REST TTS 403 — "Access denied" for `cosyvoice-v2`

**Error:**
```
DashScope TTS failed (403): model cosyvoice-v2 is not accessible
```

**Cause:** The OpenAI-compatible REST endpoint (`/compatible-mode/v1/audio/speech`) does not support `cosyvoice-v2`. Only older models like `qwen3.5-tts` work with that endpoint.

**Resolution:** Switched from REST API to **DashScope WebSocket API** (`wss://dashscope.aliyuncs.com/api-ws/v1/inference`) which fully supports `cosyvoice-v2` and cloned voices.

---

### 2. WebSocket TTS — "task-failed" / Empty Audio

**Error:**
```
CosyVoice TTS failed: Unknown TTS error
```

**Cause:** Initial WebSocket implementation used incorrect message framing. The `streaming: "duplex"` mode requires a specific 3-message sequence (`run-task` → `continue-task` → `finish-task`), not a single message with text.

**Resolution:** Implemented the correct duplex streaming protocol:
1. `run-task` (model config, no text)
2. Wait for `task-started` event
3. `continue-task` (with text payload)
4. `finish-task` (signal end of input)
5. Collect binary chunks until `task-finished`

---

### 3. Voice Clone 500 — "request asr failed"

**Error:**
```
DashScope voice clone failed (500): request asr failed
```

**Cause:** Transient server-side ASR (automatic speech recognition) failure when processing the reference audio. Intermittent issue on DashScope's side.

**Resolution:** Added retry logic (up to 3 attempts with 3s delay) in `registerVoiceWithDashScope()`. Only retries on 5xx errors; non-retryable errors (4xx) fail immediately.

---

### 4. Voice Clone — "audio did not pass quality check (UNDEPLOYED)"

**Error:**
```
Voice clone failed: audio did not pass quality check (UNDEPLOYED)
```

**Cause:** The submitted audio was too short, too noisy, or in an unsupported format. DashScope's quality check rejected it.

**Resolution:**
- Ensured audio conversion produces clean **mono 16kHz PCM WAV** via ffmpeg
- Recommended minimum 10 seconds of clear speech for clone registration
- Added fallback path: if clone fails, stores reference audio ID (`ref:<storageFileId>`) and falls back to default preset voice for TTS

---

### 5. Appwrite Function Deployment — `ws` Module Not Found

**Error:**
```
Error: Cannot find module 'ws'
```

**Cause:** The `ws` package (WebSocket client for Node.js) was not in `package.json` dependencies. The Appwrite function build step only installs declared dependencies.

**Resolution:** Added `ws` to `package.json` dependencies and redeployed the function.

---

### 6. Appwrite Function — Execution Timeout (15s)

**Error:**
```
Function execution timed out
```

**Cause:** The default Appwrite function timeout was 15 seconds. WebSocket TTS for longer text could exceed this, especially with network latency to DashScope servers.

**Resolution:** The function internally uses a 90s WebSocket timeout. For Appwrite, the function configuration timeout was verified sufficient for typical TTS requests. Longer texts may need chunking.

---

### 7. React Fragment Error in Elderly Settings

**Error:**
```
Invalid prop `%s` supplied to `React.Fragment`. 
React.Fragment can only have `key` and `children` props.
```

**Stack trace:** `ElderlySettings (app\(elderly-tabs)\settings.tsx)`

**Cause:** After adding the language selector UI, the conditional block `{aiVoiceEnabled && (<>...</>)}` used a React Fragment (`<>...</>`). The newer React Native renderer (Fabric) is stricter about Fragment validation and flagged it.

**Resolution:** Replaced `<>...</>` with `<View>...</View>` to wrap the language selector section.

---

### 8. TTS Model Mismatch — Cloned Voice vs Synthesis Model

**Error:**
```
Voice not found or model mismatch
```

**Cause:** The `target_model` used during voice enrollment must exactly match the `model` used during synthesis. Registering a voice with `cosyvoice-v2` but synthesizing with `qwen3.5-tts` (or vice versa) results in a voice-not-found error.

**Resolution:** Ensured both enrollment (`target_model`) and synthesis use the same model constant `cosyvoice-v2` throughout the pipeline.

---

### 9. Appwrite Storage URL — Not Publicly Accessible

**Error:**
```
DashScope could not fetch audio from the provided URL
```

**Cause:** The Appwrite Storage file URL required authentication. DashScope's voice enrollment API fetches the audio server-side and cannot pass Appwrite auth headers.

**Resolution:** Constructed the URL using the `/view` endpoint with `?project=` query parameter, which serves the file publicly for buckets with appropriate permissions:
```
${APPWRITE_ENDPOINT}/storage/buckets/${VOICE_CLONE_BUCKET}/files/${storageFileId}/view?project=${APPWRITE_PROJECT_ID}
```

---

### 10. Base64 Data URL Prefix in Audio Samples

**Error:**
```
ffmpeg audio conversion failed: Invalid data found when processing input
```

**Cause:** Audio samples from the client included the `data:audio/m4a;base64,` prefix. Writing this directly as binary produced corrupt files.

**Resolution:** Added `stripDataUrlPrefix()` utility that detects and removes the `data:...;base64,` prefix before decoding.

---

## Voice ID Format

| Type | Format | Example |
|------|--------|---------|
| DashScope registered | `cosyvoice-v2-{prefix}-{hash}` | `cosyvoice-v2-aaa-8b2334ad4efe4ed48d47e0153513a968` |
| Reference fallback | `ref:{appwrite_file_id}` | `ref:6a1b2c3d4e5f` |
| Local hash fallback | `pv_{sha256_24}` | `pv_a1b2c3d4e5f6a1b2c3d4e5f6` |
| Preset voice | Plain name | `longxiaochun_v2` |

---

## Registered Voice (Current)

| Field | Value |
|-------|-------|
| Voice ID | `cosyvoice-v2-aaa-8b2334ad4efe4ed48d47e0153513a968` |
| Model | `cosyvoice-v2` |
| Status | `OK` |
| Created via | DashScope voice-enrollment API |
