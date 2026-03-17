import QRPairingView from "@/components/QRPairingView";
import { useAuth } from "@/lib/auth-context";
import { useQRPairing } from "@/lib/hooks/useQRPairing";
import { createRegistrationRequest } from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";

export default function ElderlyQRRegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signInWithToken } = useAuth();

  const { status, qrPayload, errorMsg, refresh, cleanupAndLeave } =
    useQRPairing({
      createRequest: (t) => createRegistrationRequest(t),
      onCompleted: async (request, { setStatus, cleanup }) => {
        if (!request.elderly_user_id || !request.elderly_token_secret) return;

        setStatus("signing-in");

        await signInWithToken(
          request.elderly_user_id,
          request.elderly_token_secret,
        );

        await SecureStore.setItemAsync(
          "elderly_user_id",
          request.elderly_user_id,
        );

        cleanup(request.$id);
        setStatus("done");
      },
      qrType: "elderly-register",
    });

  const handleGoBack = () => {
    cleanupAndLeave();
    router.back();
  };

  const handleManualRegister = () => {
    cleanupAndLeave();
    router.push("/signup?role=elderly");
  };

  const renderExtra = useCallback(() => {
    if (status === "signing-in") {
      return (
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
      );
    }
    if (status === "done") {
      return (
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
      );
    }
    return null;
  }, [status]);

  const renderFooter = useCallback(
    () => (
      <>
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
      </>
    ),
    [theme.colors.outlineVariant, theme.colors.onSurfaceVariant],
  );

  return (
    <QRPairingView
      status={status}
      qrPayload={qrPayload}
      errorMsg={errorMsg}
      onRefresh={refresh}
      onGoBack={handleGoBack}
      icon="human-cane"
      title="Register as Elderly"
      subtitle={`Ask your caregiver to scan this QR code\nto set up your account`}
      scannedHint="Scan successful! Caregiver is setting up your account..."
      waitingHint="Waiting for caregiver to complete registration..."
      cancelledTitle="Registration Cancelled"
      cancelledSubtitle="The caregiver cancelled the registration. Tap refresh to try again."
      renderExtra={renderExtra}
      renderFooter={renderFooter}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  statusText: {
    textAlign: "center",
    marginTop: 12,
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
