/**
 * FallCountdownOverlay
 *
 * Full-screen modal that appears when a fall is detected.
 * Shows a 15-second countdown. If the user doesn't press "I'm OK",
 * it grabs the GPS location and sends an SOS to all linked caregivers.
 */

import { useAuth } from "@/lib/auth-context";
import { createEmergencyAlert } from "@/lib/emergency";
import { sendImmediateNotification } from "@/lib/notifications";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  StyleSheet,
  Vibration,
  View,
} from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { getContactsForElderly } from "@/lib/contacts";
import {
  CAREGIVER_ELDERLY_TABLE_ID,
  DATABASE_ID,
  ELDERLY_TABLE_ID,
  tablesDB,
} from "@/lib/appwrite";
import { Query } from "react-native-appwrite";
import type { CaregiverElderly, Elderly } from "@/types/appwrite";

const COUNTDOWN_SECONDS = 15;

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
    if (!user) return;
    setSending(true);
    Vibration.cancel();

    try {
      // Get GPS location
      let latitude: number | undefined;
      let longitude: number | undefined;
      let locationName: string | undefined;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = loc.coords.latitude;
          longitude = loc.coords.longitude;

          // Try reverse geocoding
          try {
            const [addr] = await Location.reverseGeocodeAsync({
              latitude,
              longitude,
            });
            if (addr) {
              locationName = [addr.street, addr.district, addr.city]
                .filter(Boolean)
                .join(", ");
            }
          } catch {
            // ignore geocoding errors
          }
        } catch {
          // location unavailable
        }
      }

      // Get elderly profile
      const elderlyRows = await tablesDB.listRows<Elderly>({
        databaseId: DATABASE_ID,
        tableId: ELDERLY_TABLE_ID,
        queries: [Query.equal("user_id", user.$id), Query.limit(1)],
      });
      const elderlyDoc = elderlyRows.rows[0];
      const elderlyName = elderlyDoc?.name ?? user.name ?? "Unknown";
      const elderlyId = elderlyDoc?.$id ?? user.$id;

      // Find all linked caregivers
      const ceRows = await tablesDB.listRows<CaregiverElderly>({
        databaseId: DATABASE_ID,
        tableId: CAREGIVER_ELDERLY_TABLE_ID,
        queries: [Query.equal("elderly", elderlyId), Query.limit(100)],
      });

      const caregiverIds: string[] = [];
      for (const row of ceRows.rows) {
        const cg = row.caregiver;
        if (typeof cg === "string") {
          caregiverIds.push(cg);
        } else if (cg && "$id" in cg) {
          caregiverIds.push((cg as any).user_id ?? (cg as any).$id);
        }
      }

      // Create emergency alert for each caregiver
      for (const cgId of caregiverIds) {
        await createEmergencyAlert({
          type: "fall",
          elderly_id: elderlyId,
          elderly_name: elderlyName,
          caregiver_user_id: cgId,
          latitude,
          longitude,
          location_name: locationName,
          description: "Fall detected by device sensors. No response from elderly within 15 seconds.",
        });
      }

      // Local notification
      await sendImmediateNotification(
        "🚨 SOS Sent",
        `Fall detected – alert sent to ${caregiverIds.length} caregiver(s).`,
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
          sendSOS();
          return 0;
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
