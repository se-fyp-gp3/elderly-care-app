import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let hasLoggedPushSetupNotice = false;

function logPushSetupNotice(message: string) {
  if (hasLoggedPushSetupNotice) return;
  hasLoggedPushSetupNotice = true;
  console.log(`[Notifications] ${message}`);
}

function hasAndroidFirebasePushConfig(): boolean {
  const androidConfig = Constants.expoConfig?.android as
    | { googleServicesFile?: string }
    | undefined;
  return typeof androidConfig?.googleServicesFile === "string"
    ? androidConfig.googleServicesFile.trim().length > 0
    : false;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Configure foreground notifications
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return false;
  }
  return true;
}

export function getExpoProjectId(): string | null {
  const expoProjectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null;

  return typeof expoProjectId === "string" && expoProjectId.trim().length > 0
    ? expoProjectId.trim()
    : null;
}

export async function getExpoPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    if (Constants.executionEnvironment === "storeClient") {
      logPushSetupNotice(
        "Skipping Expo push token in Expo Go. Use a development build or release build for Android push notifications.",
      );
      return null;
    }

    if (!hasAndroidFirebasePushConfig()) {
      logPushSetupNotice(
        "Skipping Android Expo push token because app.json has no android.googleServicesFile. Add your Firebase google-services.json and rebuild the app.",
      );
      return null;
    }
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn("[Notifications] Missing Expo project ID for push token");
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return tokenResponse.data || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      Platform.OS === "android" &&
      /FirebaseApp is not initialized|fcm-credentials/i.test(message)
    ) {
      logPushSetupNotice(
        "Android Expo push token is unavailable because Firebase/FCM is not configured yet. Add google-services.json, set android.googleServicesFile in app.json, then rebuild with expo run:android or EAS Build.",
      );
      return null;
    }

    console.warn("[Notifications] Failed to get Expo push token", error);
    return null;
  }
}

export async function scheduleMedicationNotification(
  title: string,
  body: string,
  triggerDate: Date,
) {
  // Only schedule if future
  if (triggerDate.getTime() <= Date.now()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: { type: "medication_reminder" },
    },
    trigger: {
      type: "date",
      date: triggerDate,
    } as any,
  });
}

export async function sendImmediateNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: data || { type: "medication_missed" },
    },
    trigger: null, // Immediate
  });
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Handle incoming background notifications
 */
export async function handleBackgroundNotification(
  notification: Notifications.Notification,
) {
  // Process the notification if needed
  // e.g., update badge count, sync data
  return Promise.resolve();
}
