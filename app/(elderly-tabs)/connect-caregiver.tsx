import { useAuth } from "@/lib/auth-context";
import {
  createConnectionRequest,
  deleteRegistrationRequest,
  getRegistrationRequest,
} from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

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

export default function ConnectCaregiverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | "loading"
    | "waiting"
    | "scanned"
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

  // Create the connection request on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!user) {
        setErrorMsg("You must be signed in.");
        setStatus("error");
        return;
      }
      try {
        const t = generateToken();
        const request = await createConnectionRequest(t, user.$id);
        if (cancelled) return;
        setToken(t);
        setRequestId(request.$id);
        setStatus("waiting");

        expiryRef.current = setTimeout(() => {
          stopPolling();
          setStatus("expired");
          cleanupRequest(request.$id);
          setRequestId(null);
        }, EXPIRY_TIMEOUT);
      } catch (err: any) {
        console.error("Failed to create connection request:", err);
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

  // Cleanup on unmount
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
          stopPolling();
          stopExpiry();
          setStatus("expired");
          return;
        }

        if (request.status === "scanned" && status !== "scanned") {
          setStatus("scanned");
          stopExpiry();
        }

        if (request.status === "cancelled") {
          stopPolling();
          stopExpiry();
          setStatus("cancelled");
          cleanupRequest(request.$id);
          setRequestId(null);
          return;
        }

        if (request.status === "completed") {
          stopPolling();
          stopExpiry();
          setStatus("done");
          cleanupRequest(request.$id);
          setRequestId(null);
        }
      } catch (err) {
        console.error("Polling error:", err);
        stopPolling();
        stopExpiry();
        setErrorMsg("Failed to complete connection. Please try again.");
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
  }, [status, token, requestId]);

  const handleRefresh = async () => {
    if (!user) return;
    setStatus("loading");
    setErrorMsg(null);
    setToken(null);
    setRequestId(null);
    try {
      const t = generateToken();
      const request = await createConnectionRequest(t, user.$id);
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
      console.error("Failed to create connection request:", err);
      setErrorMsg("Failed to initialize. Please try again.");
      setStatus("error");
    }
  };

  const handleGoBack = () => {
    if (requestId) {
      deleteRegistrationRequest(requestId).catch(() => {});
      setRequestId(null);
    }
    router.navigate("/(elderly-tabs)/settings");
  };

  const qrPayload = token
    ? JSON.stringify({ type: "elderly-connect", token })
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
              name="account-plus"
              size={48}
              color="#2196F3"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Connect Caregiver
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Ask your caregiver to scan this QR code{"\n"}to connect with you
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
                Scan successful! Caregiver is confirming the connection...
              </Text>
            )}
            {status === "waiting" && (
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              >
                Waiting for caregiver to scan...
              </Text>
            )}
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
          </>
        )}

        {(status === "expired" || status === "cancelled") && (
          <>
            <MaterialCommunityIcons
              name="account-plus"
              size={48}
              color="#FF9800"
            />
            <Text variant="headlineSmall" style={styles.title}>
              {status === "expired"
                ? "Session Expired"
                : "Connection Cancelled"}
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
                : "The caregiver cancelled the connection. Tap refresh to try again."}
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

        {status === "done" && (
          <>
            <MaterialCommunityIcons
              name="check-circle"
              size={64}
              color="#4CAF50"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Connected!
            </Text>
            <Text variant="bodyMedium" style={styles.statusText}>
              Your caregiver has been linked to your account.
            </Text>
            <Button
              mode="contained"
              onPress={() => router.back()}
              style={{ marginTop: 24 }}
            >
              Back to Settings
            </Button>
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
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
        >
          Your caregiver needs to open their app and scan this QR code from the
          Care Panel.
        </Text>
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
