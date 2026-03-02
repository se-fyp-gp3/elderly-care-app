# Voice Clone Deployment Checklist

Use this checklist to deploy and verify the server-side voice conversion pipeline.

## 1) Appwrite Function Setup

- [ ] Create function (or confirm existing) in Appwrite Console
- [ ] Runtime: **Node.js 20+**
- [ ] Entrypoint: `src/main.js`
- [ ] Source directory: `functions/voice-clone-convert`
- [ ] Timeout: **>= 60 seconds**
- [ ] Memory: **>= 512 MB**

## 2) Function Environment Variables

Set these in Appwrite Function settings:

- [ ] `AZURE_SPEECH_KEY`
- [ ] `AZURE_SPEECH_REGION` (example: `southeastasia`)
- [ ] `AZURE_CNV_PROJECT_ID` (optional; defaults to `elderly-care-voice`)
- [ ] `AZURE_CNV_LOCALE` (optional; defaults to `zh-HK`)
- [ ] `AZURE_CNV_API_VERSION` (optional; defaults to `2024-02-01-preview`)

## 3) Function Permissions

- [ ] Function execute permission allows your app users (authenticated users)

## 4) Deploy Function

- [ ] Trigger function deployment
- [ ] Wait for status to become **Ready**

## 5) App Environment (`.env.local`)

- [ ] `EXPO_PUBLIC_VOICE_CLONE_FUNCTION_ID=<your_appwrite_function_id>`
- [ ] `EXPO_PUBLIC_APPWRITE_ENDPOINT=<your_endpoint>`
- [ ] `EXPO_PUBLIC_APPWRITE_PROJECT_ID=<your_project_id>`
- [ ] `EXPO_PUBLIC_APPWRITE_PLATFORM=<your_android_package_or_platform>`

## 6) Install + Rebuild App

- [ ] `npm install`
- [ ] `npx expo run:android`

## 7) Run Local Validation Script

- [ ] `npm run validate:voice-clone`
- [ ] Confirm all required checks pass

## 8) In-App Verification Flow

- [ ] Open caregiver voice page
- [ ] Record new samples
- [ ] Tap upload/create custom voice
- [ ] Confirm success message
- [ ] Confirm record saved in `custom_voice` table

## 9) If Failure Happens

- [ ] Open Appwrite function execution logs
- [ ] Capture error message + stack + response status
- [ ] Share those logs for debugging

## 10) Security Cleanup

- [ ] Rotate exposed keys after successful testing
- [ ] Remove any temporary test credentials
