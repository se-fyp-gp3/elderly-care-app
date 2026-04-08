import QRPairingView from "@/components/QRPairingView";
import { useAuth } from "@/lib/auth-context";
import { useQRPairing } from "@/lib/hooks/useQRPairing";
import { createConnectionRequest } from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function ConnectCaregiverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) {
    return (
      <Text style={{ textAlign: "center", marginTop: 24 }}>
        Loading...
      </Text>
    );
  }

  const { status, qrPayload, errorMsg, refresh, cleanupAndLeave } =
    useQRPairing({
      createRequest: (tkn) => createConnectionRequest(tkn, user.$id),
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
            {t('connectCaregiver.connected')}
          </Text>
          <Text variant="bodyMedium" style={styles.statusText}>
            {t('connectCaregiver.connectedDesc')}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.back()}
            style={{ marginTop: 24 }}
          >
            {t('connectCaregiver.backToSettings')}
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
        {t('connectCaregiver.scanHint')}
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
      title={t('settings.connectCaregiver')}
      subtitle={t('connectCaregiver.askToScan')}
      scannedHint={t('connectCaregiver.scanSuccess')}
      waitingHint={t('connectCaregiver.waitingForScan')}
      cancelledTitle={t('connectCaregiver.connectionCancelled')}
      cancelledSubtitle={t('connectCaregiver.cancelledDesc')}
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
