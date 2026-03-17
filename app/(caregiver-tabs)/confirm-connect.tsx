import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import {
  cancelRegistrationRequest,
  connectCaregiverToElderly,
  getRegistrationRequest,
} from "@/lib/registration";
import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ConfirmConnectScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [elderly, setElderly] = useState<Elderly | null>(null);
  const [requestDocId, setRequestDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadElderly() {
      if (!token) return;
      try {
        const request = await getRegistrationRequest(token);
        if (!request || !request.elderly_user_id) {
          setError("Connection request not found or expired.");
          setLoading(false);
          return;
        }
        setRequestDocId(request.$id);

        const profile = await getElderlyByUserId(request.elderly_user_id);
        if (!profile) {
          setError("Elderly profile not found.");
          setLoading(false);
          return;
        }
        setElderly(profile);
      } catch (err) {
        console.error("Error loading elderly info:", err);
        setError("Failed to load elderly information.");
      } finally {
        setLoading(false);
      }
    }
    loadElderly();
  }, [token]);

  const handleConfirm = async () => {
    if (!user || !token) return;
    setConnecting(true);
    setError(null);
    try {
      await connectCaregiverToElderly({
        token,
        caregiverUserId: user.$id,
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace("/(caregiver-tabs)/caregiver");
      }, 2000);
    } catch (err: any) {
      console.error("Connect error:", err);
      setError(err?.message || "Failed to connect. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const handleCancel = async () => {
    if (requestDocId) {
      cancelRegistrationRequest(requestDocId).catch(() => {});
    }
    router.back();
  };

  if (!token) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.error}
          />
          <Text variant="bodyLarge" style={{ marginTop: 16 }}>
            No connection token found.
          </Text>
          <Button
            mode="contained"
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="check-circle"
            size={80}
            color="#4CAF50"
          />
          <Text variant="headlineSmall" style={styles.successTitle}>
            Connected!
          </Text>
          <Text
            variant="bodyMedium"
            style={[
              styles.successText,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            You are now linked to {elderly?.name ?? "this elderly"}.{"\n"}
            Redirecting to your dashboard...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.headerBar}>
        <Button icon="arrow-left" onPress={handleCancel}>
          Cancel
        </Button>
      </View>

      <View style={styles.centered}>
        {loading ? (
          <>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={{ marginTop: 16 }}>
              Loading elderly information...
            </Text>
          </>
        ) : error ? (
          <>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={64}
              color={theme.colors.error}
            />
            <Text
              variant="bodyLarge"
              style={{
                marginTop: 16,
                color: theme.colors.error,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
            <Button
              mode="contained"
              onPress={() => router.back()}
              style={{ marginTop: 16 }}
            >
              Go Back
            </Button>
          </>
        ) : elderly ? (
          <>
            <MaterialCommunityIcons
              name="account-plus"
              size={48}
              color="#2196F3"
            />
            <Text variant="headlineSmall" style={styles.title}>
              Connect to Elderly
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Do you want to link with this elderly?
            </Text>

            <Card
              style={[
                styles.elderlyCard,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Card.Content style={styles.elderlyCardContent}>
                <Avatar.Text
                  size={56}
                  label={(elderly.name ?? "??").substring(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  labelStyle={{
                    color: theme.colors.onPrimaryContainer,
                    fontWeight: "600",
                  }}
                />
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                    {elderly.name ?? "Unknown"}
                  </Text>
                  {elderly.phone && (
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 4,
                      }}
                    >
                      {elderly.phone}
                    </Text>
                  )}
                </View>
              </Card.Content>
            </Card>

            <View style={styles.buttonRow}>
              <Button
                mode="contained"
                onPress={handleConfirm}
                loading={connecting}
                disabled={connecting}
                icon="check"
                style={styles.confirmButton}
              >
                Confirm
              </Button>
              <Button
                mode="outlined"
                onPress={handleCancel}
                disabled={connecting}
                icon="close"
                style={styles.cancelButton}
              >
                Cancel
              </Button>
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: 8,
    paddingTop: 4,
    alignItems: "flex-start",
  },
  centered: {
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
  elderlyCard: {
    marginTop: 24,
    borderRadius: 16,
    width: "100%",
  },
  elderlyCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  buttonRow: {
    marginTop: 32,
    width: "100%",
    gap: 12,
  },
  confirmButton: {
    borderRadius: 12,
  },
  cancelButton: {
    borderRadius: 12,
  },
  successTitle: {
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  successText: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
});
