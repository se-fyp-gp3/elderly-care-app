/**
 * FallCountdownOverlay
 *
 * Full-screen modal that appears when a fall is detected.
 * Shows a 15-second countdown. If the user doesn't press "I'm OK",
 * it grabs the GPS location and sends an SOS to all linked caregivers.
 */

import {
  CAREGIVER_ELDERLY_TABLE_ID,
  CAREGIVER_TABLE_ID,
  DATABASE_ID,
  ELDERLY_TABLE_ID,
  tablesDB,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { createEmergencyAlert } from "@/lib/emergency";
import { sendImmediateNotification } from "@/lib/notifications";
import type { Caregiver, CaregiverElderly, Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  StyleSheet,
  Vibration,
  View,
} from "react-native";
import { Query } from "react-native-appwrite";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const COUNTDOWN_SECONDS = 15;
const LOCATION_PERMISSION_TIMEOUT_MS = 5000;
const LOCATION_LOOKUP_TIMEOUT_MS = 6000;
const LOCATION_GEOCODE_TIMEOUT_MS = 4000;
const LOCATION_SERVICES_TIMEOUT_MS = 2000;

type EmergencyLocation = {
  latitude?: number;
  longitude?: number;
  locationName?: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

async function resolveEmergencyLocation(): Promise<EmergencyLocation> {
  const existingPermission = await withTimeout(
    Location.getForegroundPermissionsAsync(),
    LOCATION_PERMISSION_TIMEOUT_MS,
  );
  console.log("[FallSOS] Existing location permission:", existingPermission?.status ?? "unknown");

  let permissionStatus = existingPermission?.status;
  if (permissionStatus !== "granted") {
    const requestedPermission = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      LOCATION_PERMISSION_TIMEOUT_MS,
    );
    permissionStatus = requestedPermission?.status;
    console.log("[FallSOS] Requested location permission:", permissionStatus ?? "timeout");
  }

  const servicesEnabled = await withTimeout(
    Location.hasServicesEnabledAsync(),
    LOCATION_SERVICES_TIMEOUT_MS,
  );
  console.log("[FallSOS] Location services enabled:", servicesEnabled ?? "unknown");

  if (permissionStatus !== "granted") {
    console.warn("[FallSOS] Location permission not granted");
    return {};
  }

  let location = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    }),
    LOCATION_LOOKUP_TIMEOUT_MS,
  );

  if (location) {
    console.log("[FallSOS] Current position acquired", {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    });
  } else {
    console.warn("[FallSOS] Current position unavailable, trying last known position");
  }

  if (!location) {
    location = await withTimeout(
      Location.getLastKnownPositionAsync({
        maxAge: 24 * 60 * 60 * 1000,
      }),
      LOCATION_LOOKUP_TIMEOUT_MS,
    );

    if (location) {
      console.log("[FallSOS] Using last known position", {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
    } else {
      console.warn("[FallSOS] Last known position unavailable, trying coarse fallback");
    }
  }

  if (!location && servicesEnabled !== false) {
    location = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
        mayShowUserSettingsDialog: true,
      }),
      LOCATION_LOOKUP_TIMEOUT_MS,
    );

    if (location) {
      console.log("[FallSOS] Coarse current position acquired", {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
    }
  }

  if (!location) {
    console.warn("[FallSOS] Unable to resolve any location source");
    return {};
  }

  const latitude = location.coords.latitude;
  const longitude = location.coords.longitude;
  let locationName: string | undefined;

  const addresses = await withTimeout(
    Location.reverseGeocodeAsync({ latitude, longitude }),
    LOCATION_GEOCODE_TIMEOUT_MS,
  );
  const address = addresses?.[0];
  if (address) {
    locationName = [address.street, address.district, address.city]
      .filter(Boolean)
      .join(", ");
    console.log("[FallSOS] Reverse geocode resolved", locationName);
  } else {
    console.warn("[FallSOS] Reverse geocode unavailable, falling back to coordinates");
  }

  if (!locationName) {
    locationName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  return { latitude, longitude, locationName };
}

interface FallCountdownOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function FallCountdownOverlay({
  visible,
  onDismiss,
}: FallCountdownOverlayProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progress = useSharedValue(1);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    clearTimer();
    Vibration.cancel();
    setSeconds(COUNTDOWN_SECONDS);
    progress.value = 1;
    onDismiss();
  }, [clearTimer, onDismiss, progress]);

  const sendSOS = useCallback(async () => {
    if (!user) {
      onDismiss();
      return;
    }

    setSending(true);
    Vibration.cancel();

    try {
      const { latitude, longitude, locationName } =
        await resolveEmergencyLocation();

      // Get elderly profile
      const elderlyRows = await tablesDB.listRows<Elderly>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_TABLE_ID,
        queries: [Query.equal("user_id", user.$id), Query.limit(1)],
      });
      const elderlyDoc = elderlyRows.rows[0];
      const elderlyName = elderlyDoc?.name ?? user.name ?? "Unknown";
      const elderlyId = elderlyDoc?.$id ?? user.$id;

      // Find all linked caregivers and resolve their auth user_id
      const ceRows = await tablesDB.listRows<CaregiverElderly>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_ELDERLY_TABLE_ID,
        queries: [Query.equal("elderly", elderlyId), Query.equal("isConnection", true), Query.limit(100)],
      });

      const caregiverUserIds = new Set<string>();
      for (const row of ceRows.rows) {
        const cg = row.caregiver;
        if (typeof cg === "string") {
          // cg is the caregiver profile $id – need to look up user_id
          try {
            const cgRows = await tablesDB.listRows<Caregiver>({
              databaseId: DATABASE_ID,
              tableId: CAREGIVER_TABLE_ID,
              queries: [Query.equal("$id", cg), Query.limit(1)],
            });
            if (cgRows.rows.length > 0 && cgRows.rows[0].user_id) {
              caregiverUserIds.add(cgRows.rows[0].user_id);
            }
          } catch {
            // skip unresolvable caregiver
          }
        } else if (cg && typeof cg === "object" && "user_id" in cg) {
          caregiverUserIds.add((cg as any).user_id);
        }
      }

      // Create emergency alert for each caregiver
      const caregiverUserIdList = Array.from(caregiverUserIds);
      console.log("[FallSOS] Sending emergency alerts", {
        elderlyId,
        caregiverCount: caregiverUserIdList.length,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        locationName: locationName ?? null,
      });
      await Promise.all(
        caregiverUserIdList.map((cgUserId) =>
          createEmergencyAlert({
          type: "fall",
          elderly_id: elderlyId,
          elderly_name: elderlyName,
          caregiver_user_id: cgUserId,
          latitude,
          longitude,
          location_name: locationName,
          description: "Fall detected by device sensors. No response from elderly within 15 seconds.",
          }),
        ),
      );

      // Local notification
      await sendImmediateNotification(
        "🚨 SOS Sent",
        `Fall detected – alert sent to ${caregiverUserIdList.length} caregiver(s).`,
        { type: "fall_sos_sent" },
      );
    } catch (err) {
      console.error("Failed to send SOS:", err);
      await sendImmediateNotification(
        "SOS Error",
        "Fall detected but failed to send alert. Please contact your caregiver manually.",
        { type: "fall_sos_error" },
      );
    } finally {
      setSending(false);
      onDismiss();
    }
  }, [user, onDismiss]);

  // Start countdown when visible
  useEffect(() => {
    if (!visible) {
      clearTimer();
      setSeconds(COUNTDOWN_SECONDS);
      progress.value = 1;
      setSending(false);
      return;
    }

    // Start vibration pattern
    Vibration.vibrate([500, 500], true);

    progress.value = withTiming(0, { duration: COUNTDOWN_SECONDS * 1000 });

    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          void sendSOS();
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [visible, clearTimer, sendSOS, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            { backgroundColor: theme.colors.errorContainer },
          ]}
        >
          <MaterialCommunityIcons
            name="alert-decagram"
            size={80}
            color={theme.colors.error}
          />

          <Text
            variant="headlineLarge"
            style={[styles.title, { color: theme.colors.onErrorContainer }]}
          >
            Fall Detected!
          </Text>

          <Text
            variant="bodyLarge"
            style={[styles.subtitle, { color: theme.colors.onErrorContainer }]}
          >
            {sending
              ? "Sending SOS to your caregivers..."
              : "An SOS will be sent automatically unless you cancel."}
          </Text>

          {/* Countdown */}
          <View style={styles.countdownContainer}>
            {sending ? (
              <ActivityIndicator
                animating
                size="large"
                color={theme.colors.error}
                style={styles.sendingIndicator}
              />
            ) : (
              <>
                <Text
                  style={[styles.countdownNumber, { color: theme.colors.error }]}
                >
                  {seconds}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onErrorContainer }}
                >
                  seconds remaining
                </Text>
              </>
            )}
          </View>

          {/* Progress bar */}
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: theme.colors.error + "30" },
            ]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: theme.colors.error },
                progressStyle,
              ]}
            />
          </View>

          {/* Cancel button */}
          <Button
            mode="contained"
            onPress={handleCancel}
            disabled={sending}
            buttonColor="#fff"
            textColor={theme.colors.error}
            style={styles.cancelButton}
            labelStyle={styles.cancelLabel}
            icon="hand-okay"
          >
            I'm OK — Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
  },
  title: {
    fontWeight: "bold",
    marginTop: 16,
  },
  subtitle: {
    textAlign: "center",
    marginTop: 8,
  },
  countdownContainer: {
    alignItems: "center",
    marginVertical: 24,
  },
  countdownNumber: {
    fontSize: 72,
    fontWeight: "bold",
    lineHeight: 80,
  },
  sendingIndicator: {
    marginVertical: 16,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 24,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  cancelButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 4,
  },
  cancelLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
});
