import QRPairingView from "@/components/QRPairingView";
import { useAuth } from "@/lib/auth-context";
import { useQRPairing } from "@/lib/hooks/useQRPairing";
import { createConnectionRequest } from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function ConnectCaregiverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <Text style={{ textAlign: "center", marginTop: 24 }}>
        Loading...
      </Text>
    );
  }

  const { status, qrPayload, errorMsg, refresh, cleanupAndLeave } =
    useQRPairing({
      createRequest: (t) => createConnectionRequest(t, user.$id),
      onCompleted: async (request, { setStatus, cleanup }) => {
        cleanup(request.$id);
        setStatus("done");
      },
      qrType: "elderly-connect",
    });

  const handleGoBack = () => {
    cleanupAndLeave();
    router.navigate("/(elderly-tabs)/settings");
  };

  const renderExtra = useCallback(() => {
    if (status === "done") {
      return (
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
      );
    }
    return null;
  }, [status, router]);

  const renderFooter = useCallback(
    () => (
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
      >
        Your caregiver needs to open their app and scan this QR code from the
        Care Panel.
      </Text>
    ),
    [theme.colors.onSurfaceVariant],
  );

  return (
    <QRPairingView
      status={status}
      qrPayload={qrPayload}
      errorMsg={errorMsg}
      onRefresh={refresh}
      onGoBack={handleGoBack}
      icon="account-plus"
      title="Connect Caregiver"
      subtitle={`Ask your caregiver to scan this QR code\nto connect with you`}
      scannedHint="Scan successful! Caregiver is confirming the connection..."
      waitingHint="Waiting for caregiver to scan..."
      cancelledTitle="Connection Cancelled"
      cancelledSubtitle="The caregiver cancelled the connection. Tap refresh to try again."
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
});
