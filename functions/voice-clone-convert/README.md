# Voice Clone Convert Function

Appwrite Node function that:

1. Receives base64 audio samples from the mobile app
2. Converts each sample to 16kHz mono PCM WAV using `ffmpeg-static`
3. Calls Azure Personal Voice APIs (project, consent, personal voice)
4. Returns `voiceId` (speakerProfileId) back to the app

## Runtime

- Node.js 20+
- Entry point: `src/main.js`

## Required function environment variables

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION` (e.g. `southeastasia`)
- `AZURE_CNV_PROJECT_ID` (optional, defaults to `elderly-care-voice`)
- `AZURE_CNV_LOCALE` (optional, defaults to `zh-HK`)
- `AZURE_CNV_API_VERSION` (optional, defaults to `2024-02-01-preview`)

## Client env variable

Set in app `.env.local`:

- `EXPO_PUBLIC_VOICE_CLONE_FUNCTION_ID=<your-appwrite-function-id>`

## Appwrite function settings

- Execute permission: authenticated users in your app
- Timeout: at least 60 seconds
- Memory: 512 MB+ recommended

## Request payload

```json
{
  "samplesBase64": ["...", "..."],
  "speakerName": "caregiver_name_voice"
}
```

## Response payload

```json
{
  "success": true,
  "projectId": "elderly-care-voice",
  "consentId": "consent-...",
  "voiceId": "<speakerProfileId>",
  "personalVoiceId": "pv-..."
}
```
