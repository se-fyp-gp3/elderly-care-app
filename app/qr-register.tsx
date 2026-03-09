import { useAuth } from "@/lib/auth-context";
import {
  createRegistrationRequest,
  deleteRegistrationRequest,
  getRegistrationRequest,
} from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Generates a random UUID-like token for pairing.
 */
function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const length = 32;
  const randomBytes = Crypto.getRandomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % chars.length;
    result += chars.charAt(index);
  }
  return result;
}

const EXPIRY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export default function ElderlyQRRegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signInWithToken } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | "loading"
    | "waiting"
    | "scanned"
    | "signing-in"
    | "done"
    | "expired"
    | "cancelled"
    | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const stopExpiry = () => {
    if (expiryRef.current) {
      clearTimeout(expiryRef.current);
      expiryRef.current = null;
    }
  };

  const cleanupRequest = (id: string) => {
    deleteRegistrationRequest(id).catch(() => {});
  };

  // Create the registration request on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const t = generateToken();
        const request = await createRegistrationRequest(t);
        if (cancelled) return;
        setToken(t);
        setRequestId(request.$id);
        setStatus("waiting");

        // Set expiry timer
        expiryRef.current = setTimeout(() => {
          stopPolling();
          setStatus("expired");
          cleanupRequest(request.$id);
          setRequestId(null);
        }, EXPIRY_TIMEOUT);
      } catch (err: any) {
        console.error("Failed to create registration request:", err);
        if (cancelled) return;
        setErrorMsg("Failed to initialize. Please try again.");
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      stopExpiry();
      stopPolling();
    };
  }, []);

  // Cleanup registration request on unmount (force restart, navigation away)
  useEffect(() => {
    return () => {
      if (requestId) {
        cleanupRequest(requestId);
      }
    };
  }, [requestId]);

  // Poll for status changes
  useEffect(() => {
    if ((status !== "waiting" && status !== "scanned") || !token) return;

    pollingRef.current = setInterval(async () => {
      try {
        const request = await getRegistrationRequest(token);
        if (!request) {
          // Request was deleted (expired or cleaned up)
          stopPolling();
          stopExpiry();
          setStatus("expired");
          return;
        }

        // Caregiver scanned the QR
        if (request.status === "scanned" && status !== "scanned") {
          setStatus("scanned");
          stopExpiry(); // Don't expire while caregiver is filling the form
        }

        // Caregiver cancelled the registration
        if (request.status === "cancelled") {
          stopPolling();
          stopExpiry();
          setStatus("cancelled");
          cleanupRequest(request.$id);
          setRequestId(null);
          return;
        }

        // Registration completed
        if (
          request.status === "completed" &&
          request.elderly_user_id &&
          request.elderly_token_secret
        ) {
          stopPolling();
          stopExpiry();
          setStatus("signing-in");

          // Auto-sign in with the custom token
          await signInWithToken(
            request.elderly_user_id,
            request.elderly_token_secret,
          );

          // Store user ID for future biometric re-auth
          await SecureStore.setItemAsync(
            "elderly_user_id",
            request.elderly_user_id,
          );

          // Clean up the registration request
          cleanupRequest(request.$id);
          setRequestId(null);

          setStatus("done");
          // Navigation will be handled by RouteGuard in _layout.tsx
        }
      } catch (err) {
        console.error("Polling error:", err);
        stopPolling();
        stopExpiry();
        setErrorMsg("Failed to complete registration. Please try again.");
        setStatus("error");
        if (requestId) {
          cleanupRequest(requestId);
          setRequestId(null);
        }
      }
    }, 1000);

    return () => {
      stopPolling();
    };
  }, [status, token, requestId, signInWithToken]);

  const handleRefresh = async () => {
    setStatus("loading");
    setErrorMsg(null);
    setToken(null);
    setRequestId(null);
    try {
      const t = generateToken();
      const request = await createRegistrationRequest(t);
      setToken(t);
      setRequestId(request.$id);
      setStatus("waiting");

      expiryRef.current = setTimeout(() => {
        stopPolling();
        setStatus("expired");
        cleanupRequest(request.$id);
        setRequestId(null);
      }, EXPIRY_TIMEOUT);
    } catch (err) {
      console.error("Failed to create registration request:", err);
      setErrorMsg("Failed to initialize. Please try again.");
      setStatus("error");
    }
  };

  const handleManualRegister = () => {
    // Clean up the pending request in background
    if (requestId) {
      deleteRegistrationRequest(requestId).catch(() => {});
      setRequestId(null);
    }
    router.push("/signup?role=elderly");
  };

  const handleGoBack = () => {
    if (requestId) {
      deleteRegistrationRequest(requestId).catch(() => {});
      setRequestId(null);
    }
    router.back();
  };

  const qrPayload = token
    ? JSON.stringify({ type: "elderly-register", token })
    : "";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Button
          icon="arrow-left"
          onPress={handleGoBack}
          style={styles.backButton}
        >
          Back
        </Button>
      </View>

      <View style={styles.content}>
        {status === "loading" && (
          <>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.statusText}>
              Setting up...
            </Text>
          </>
        )}

        {(status === "waiting" || status === "scanned") && token && (
          <>
            <MaterialCommunityIcons
              name="human-cane"
              size={48}
              color="#2196F3"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Register as Elderly
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Ask your caregiver to scan this QR code{"\n"}to set up your
              account
            </Text>

            <View
              style={[
                styles.qrContainer,
                {
                  backgroundColor: "#FFFFFF",
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.qrOverlayWrapper}>
                {status === "scanned" && (
                  <View style={styles.qrDimmed}>
                    <QRCode
                      value={qrPayload}
                      size={220}
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                )}
                {status === "waiting" && (
                  <QRCode
                    value={qrPayload}
                    size={220}
                    backgroundColor="#FFFFFF"
                  />
                )}
                {status === "scanned" && (
                  <View style={styles.overlayIcon}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={80}
                      color="#4CAF50"
                    />
                  </View>
                )}
              </View>
            </View>

            {status === "scanned" && (
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: "#4CAF50" }]}
              >
                Scan successful! Caregiver is setting up your account...
              </Text>
            )}
            {status === "waiting" && (
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              >
                Waiting for caregiver to complete registration...
              </Text>
            )}
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
          </>
        )}

        {(status === "expired" || status === "cancelled") && (
          <>
            <MaterialCommunityIcons
              name="human-cane"
              size={48}
              color="#FF9800"
            />
            <Text variant="headlineSmall" style={styles.title}>
              {status === "expired"
                ? "Session Expired"
                : "Registration Cancelled"}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {status === "expired"
                ? "The QR code has expired. Tap refresh to try again."
                : "The caregiver cancelled the registration. Tap refresh to try again."}
            </Text>

            <View
              style={[
                styles.qrContainer,
                {
                  backgroundColor: "#FFFFFF",
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.qrOverlayWrapper}>
                <View style={styles.qrDimmed}>
                  <QRCode
                    value={qrPayload || "expired"}
                    size={220}
                    backgroundColor="#FFFFFF"
                  />
                </View>
                <View style={styles.overlayIcon}>
                  <MaterialCommunityIcons
                    name="refresh-circle"
                    size={80}
                    color="#FF9800"
                  />
                </View>
              </View>
            </View>

            <Button
              mode="contained"
              onPress={handleRefresh}
              icon="refresh"
              style={{ marginTop: 16 }}
            >
              Refresh
            </Button>
          </>
        )}

        {status === "signing-in" && (
          <>
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={64}
              color="#4CAF50"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Account Created!
            </Text>
            <Text variant="bodyMedium" style={styles.statusText}>
              Signing you in...
            </Text>
            <ActivityIndicator size="large" style={{ marginTop: 16 }} />
          </>
        )}

        {status === "done" && (
          <>
            <MaterialCommunityIcons
              name="check-circle"
              size={64}
              color="#4CAF50"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Welcome!
            </Text>
            <Text variant="bodyMedium" style={styles.statusText}>
              Redirecting...
            </Text>
          </>
        )}

        {status === "error" && (
          <>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={64}
              color={theme.colors.error}
            />
            <Text
              variant="bodyLarge"
              style={[styles.statusText, { color: theme.colors.error }]}
            >
              {errorMsg}
            </Text>
            <Button
              mode="contained"
              onPress={handleGoBack}
              style={{ marginTop: 16 }}
            >
              Go Back
            </Button>
          </>
        )}
      </View>
      <View style={styles.footer}>
        <View style={styles.dividerRow}>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onSurfaceVariant,
              marginHorizontal: 12,
            }}
          >
            OR
          </Text>
          <View
            style={[
              styles.dividerLine,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
        </View>
        <Button
          mode="outlined"
          onPress={handleManualRegister}
          icon="account-plus"
          style={styles.manualButton}
        >
          Register Manually
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 8,
    paddingTop: 4,
    alignItems: "flex-start",
  },
  backButton: {
    alignSelf: "flex-start",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  qrContainer: {
    padding: 20,
    borderRadius: 16,
    marginTop: 24,
    marginBottom: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  hint: {
    textAlign: "center",
    marginTop: 8,
  },
  statusText: {
    textAlign: "center",
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  manualButton: {
    width: "100%",
  },
  qrOverlayWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  qrDimmed: {
    opacity: 0.3,
  },
  overlayIcon: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
