import { useAuth } from "@/lib/auth-context";
import {
  createRegistrationRequest,
  deleteRegistrationRequest,
  getRegistrationRequest,
} from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function ElderlyQRRegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "signing-in" | "done" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    };
  }, []);

  // Poll for completion
  useEffect(() => {
    if (status !== "waiting" || !token) return;

    pollingRef.current = setInterval(async () => {
      try {
        const request = await getRegistrationRequest(token);
        if (
          request &&
          request.status === "completed" &&
          request.elderly_email &&
          request.elderly_password
        ) {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          setStatus("signing-in");

          // Auto-sign in with the credentials
          await signIn(request.elderly_email, request.elderly_password);

          // Clean up the registration request (remove temporary credentials)
          await deleteRegistrationRequest(request.$id);

          setStatus("done");
          // Navigation will be handled by RouteGuard in _layout.tsx
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status, token, signIn]);

  const handleManualRegister = () => {
    // Clean up the pending request in background
    if (requestId) {
      deleteRegistrationRequest(requestId).catch(() => {});
    }
    router.push("/signup?role=elderly");
  };

  const handleGoBack = () => {
    if (requestId) {
      deleteRegistrationRequest(requestId).catch(() => {});
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

        {status === "waiting" && token && (
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
              <QRCode value={qrPayload} size={220} backgroundColor="#FFFFFF" />
            </View>

            <Text
              variant="bodySmall"
              style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
            >
              Waiting for caregiver to complete registration...
            </Text>
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
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

      {status === "waiting" && (
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
      )}
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
});
