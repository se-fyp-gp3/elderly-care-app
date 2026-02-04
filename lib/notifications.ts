import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

export async function sendImmediateNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: { type: "medication_missed" },
    },
    trigger: null, // Immediate
  });
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
