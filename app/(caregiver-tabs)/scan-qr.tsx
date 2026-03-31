import {
  getRegistrationRequest,
  markRegistrationScanned,
} from "@/lib/registration";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ScanQRScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  // Reset scan state when screen regains focus
  useEffect(() => {
    if (isFocused) {
      setScanned(false);
      setError(null);
      processingRef.current = false;
    }
  }, [isFocused]);

  const handleGoBack = () => {
    router.navigate("/(caregiver-tabs)/caregiver");
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (processingRef.current || scanned) return;
    processingRef.current = true;
    setScanned(true);

    try {
      const payload = JSON.parse(data);
      if (payload.type === "elderly-register" && payload.token) {
        // Mark the registration as scanned so elderly device sees the update
        const request = await getRegistrationRequest(payload.token);
        if (!request) {
          setError(
            "This registration QR code is no longer valid. Please generate a new QR code and try again.",
          );
          processingRef.current = false;
          setScanned(false);
          return;
        }
        await markRegistrationScanned(request.$id);
        router.replace(
          `/(caregiver-tabs)/register-elderly?token=${payload.token}` as any,
        );
      } else if (payload.type === "elderly-connect" && payload.token) {
        // Handle connection QR from an already-registered elderly
        const request = await getRegistrationRequest(payload.token);
        if (!request) {
          setError(
            "This connection QR code is no longer valid. Please ask the elderly to generate a new one.",
          );
          processingRef.current = false;
          setScanned(false);
          return;
        }
        await markRegistrationScanned(request.$id);
        router.replace(
          `/(caregiver-tabs)/confirm-connect?token=${payload.token}` as any,
        );
      } else {
        setError(
          "Invalid QR code. Please scan the elderly registration or connection QR code.",
        );
        processingRef.current = false;
        setScanned(false);
      }
    } catch {
      setError("Invalid QR code format. Please try again.");
      processingRef.current = false;
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.permissionContainer}>
          <MaterialCommunityIcons
            name="camera-off"
            size={64}
            color={theme.colors.onSurfaceVariant}
          />
          <Text variant="headlineSmall" style={styles.permissionTitle}>
            Camera Permission Needed
          </Text>
          <Text
            variant="bodyMedium"
            style={[
              styles.permissionText,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            To scan the elderly&apos;s QR code, please allow camera access.
          </Text>
          <Button
            mode="contained"
            onPress={requestPermission}
            style={{ marginTop: 20 }}
          >
            Grant Permission
          </Button>
          <Button mode="text" onPress={handleGoBack} style={{ marginTop: 8 }}>
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      {/* Overlay */}
      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <Button icon="arrow-left" textColor="#FFFFFF" onPress={handleGoBack}>
            Back
          </Button>
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        <View style={styles.instructions}>
          <Text variant="titleMedium" style={styles.instructionText}>
            Scan Elderly Registration QR Code
          </Text>
          <Text variant="bodySmall" style={styles.instructionSubtext}>
            Point your camera at the QR code shown on the elderly&apos;s device
          </Text>
          {error && (
            <Text
              variant="bodyMedium"
              style={[styles.errorText, { color: "#FF6B6B" }]}
            >
              {error}
            </Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  permissionTitle: {
    fontWeight: "bold",
    marginTop: 16,
    textAlign: "center",
  },
  permissionText: {
    textAlign: "center",
    marginTop: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    paddingHorizontal: 8,
    paddingTop: 4,
    alignItems: "flex-start",
  },
  scanArea: {
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#FFFFFF",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  instructions: {
    alignItems: "center",
    paddingBottom: 48,
    paddingHorizontal: 32,
  },
  instructionText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    textAlign: "center",
  },
  instructionSubtext: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginTop: 4,
  },
  errorText: {
    marginTop: 12,
    textAlign: "center",
    fontWeight: "bold",
  },
});
