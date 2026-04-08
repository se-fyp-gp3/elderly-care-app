import type { QRPairingStatus } from "@/lib/hooks/useQRPairing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface QRPairingViewProps {
  /** Current pairing status from useQRPairing hook */
  status: QRPairingStatus;
  /** QR code payload string */
  qrPayload: string;
  /** Error message, if any */
  errorMsg: string | null;
  /** Called when user taps Refresh */
  onRefresh: () => void;
  /** Called when user taps Back or Go Back on error */
  onGoBack: () => void;

  /** Icon shown in waiting/scanned/expired/cancelled states */
  icon: IconName;
  /** Title shown in waiting/scanned state */
  title: string;
  /** Subtitle shown in waiting/scanned state */
  subtitle: string;
  /** Hint text when a caregiver has scanned */
  scannedHint: string;
  /** Hint text while waiting for scan */
  waitingHint: string;
  /** Title when caregiver cancels */
  cancelledTitle: string;
  /** Subtitle when caregiver cancels */
  cancelledSubtitle: string;

  /** Custom content rendered for extra statuses (e.g. signing-in, done) */
  renderExtra?: () => React.ReactNode;
  /** Footer content */
  renderFooter?: () => React.ReactNode;
}

export default function QRPairingView({
  status,
  qrPayload,
  errorMsg,
  onRefresh,
  onGoBack,
  icon,
  title,
  subtitle,
  scannedHint,
  waitingHint,
  cancelledTitle,
  cancelledSubtitle,
  renderExtra,
  renderFooter,
}: QRPairingViewProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  // Let the parent handle non-standard statuses (signing-in, done)
  const extraContent = renderExtra?.();
  const isStandardStatus =
    status === "loading" ||
    status === "waiting" ||
    status === "scanned" ||
    status === "expired" ||
    status === "cancelled" ||
    status === "error";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Button icon="arrow-left" onPress={onGoBack} style={styles.backButton}>
          {t('common.back')}
        </Button>
      </View>

      <View style={styles.content}>
        {status === "loading" && (
          <>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={styles.statusText}>
              {t('qrPairing.settingUp')}
            </Text>
          </>
        )}

        {(status === "waiting" || status === "scanned") && (
          <>
            <MaterialCommunityIcons name={icon} size={48} color="#2196F3" />
            <Text variant="headlineSmall" style={styles.title}>
              {title}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {subtitle}
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
                {scannedHint}
              </Text>
            )}
            {status === "waiting" && (
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              >
                {waitingHint}
              </Text>
            )}
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
          </>
        )}

        {(status === "expired" || status === "cancelled") && (
          <>
            <MaterialCommunityIcons name={icon} size={48} color="#FF9800" />
            <Text variant="headlineSmall" style={styles.title}>
              {status === "expired" ? t('qrPairing.sessionExpired') : cancelledTitle}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {status === "expired"
                ? t('qrPairing.qrExpired')
                : cancelledSubtitle}
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
              onPress={onRefresh}
              icon="refresh"
              style={{ marginTop: 16 }}
            >
              {t('qrPairing.refresh')}
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
              onPress={onGoBack}
              style={{ marginTop: 16 }}
            >
              {t('qrPairing.goBack')}
            </Button>
          </>
        )}

        {!isStandardStatus && extraContent}
      </View>

      {renderFooter && <View style={styles.footer}>{renderFooter()}</View>}
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
