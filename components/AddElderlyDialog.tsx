import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, linkCaregiverToElderly } from "@/lib/caregiver";
import { getElderlyByPhone } from "@/lib/elderly";
import { Elderly } from "@/types/appwrite";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet, View } from "react-native";
import {
    ActivityIndicator,
    Avatar,
    Button,
    Dialog,
    Divider,
    HelperText,
    Portal,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";

interface AddElderlyDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
}

export default function AddElderlyDialog({
  visible,
  onDismiss,
  onSuccess,
}: AddElderlyDialogProps) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundElderly, setFoundElderly] = useState<Elderly | null>(null);
  const [linking, setLinking] = useState(false);

  const handleSearch = async () => {
    if (!phone.trim()) {
      setError(t('linkElderly.enterPhoneNumber'));
      return;
    }

    setLoading(true);
    setError(null);
    setFoundElderly(null);
    Keyboard.dismiss();

    try {
      const elderly = await getElderlyByPhone(phone.trim());
      if (elderly) {
        setFoundElderly(elderly);
      } else {
        setError(t('linkElderly.noElderlyFound'));
      }
    } catch (err: any) {
      console.error(err);
      setError(t('linkElderly.errorSearching'));
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!foundElderly || !user) return;

    setLinking(true);
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        setError(t('linkElderly.caregiverNotFound'));
        return;
      }

      // Check if already linked happens implicitly or we can rely on DB unique constraints if set
      // For now, just try to link
      await linkCaregiverToElderly(caregiver.$id, foundElderly.$id);

      onSuccess();
      handleDismiss();
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('linkElderly.failedToLink'));
    } finally {
      setLinking(false);
    }
  };

  const handleDismiss = () => {
    setPhone("");
    setError(null);
    setFoundElderly(null);
    onDismiss();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        style={{ backgroundColor: theme.colors.background }}
      >
        <Dialog.Title style={{ textAlign: "center" }}>
          {t('linkElderly.title')}
        </Dialog.Title>
        <Dialog.Content>
          {!foundElderly ? (
            <>
              <Button
                mode="contained-tonal"
                icon="qrcode-scan"
                onPress={() => {
                  handleDismiss();
                  router.push("/(caregiver-tabs)/scan-qr" as any);
                }}
                style={{ marginBottom: 16 }}
              >
                {t('linkElderly.scanQRCode')}
              </Button>

              <Divider style={{ marginBottom: 12 }} />

              <Text
                variant="bodyMedium"
                style={{
                  marginBottom: 16,
                  textAlign: "center",
                  color: theme.colors.secondary,
                }}
              >
                {t('linkElderly.orEnterPhone')}
              </Text>

              <TextInput
                label={t('linkElderly.phoneNumber')}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setError(null);
                }}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
                left={<TextInput.Icon icon="phone" />}
                right={
                  <TextInput.Icon
                    icon="magnify"
                    onPress={handleSearch}
                    disabled={loading || !phone.trim()}
                  />
                }
                onSubmitEditing={handleSearch}
              />

              {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
            </>
          ) : (
            <View style={styles.resultContainer}>
              <Avatar.Text
                size={64}
                label={
                  foundElderly.name
                    ? foundElderly.name.substring(0, 2).toUpperCase()
                    : "??"
                }
                style={{
                  backgroundColor: theme.colors.primaryContainer,
                  marginBottom: 8,
                }}
              />
              <Text variant="titleMedium">{foundElderly.name}</Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.outline }}
              >
                {foundElderly.phone}
              </Text>

              <View style={styles.statusChip}>
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('linkElderly.accountFound')}
                </Text>
              </View>
            </View>
          )}

          {error && (
            <HelperText
              type="error"
              visible={!!error}
              style={{ textAlign: "center" }}
            >
              {error}
            </HelperText>
          )}
        </Dialog.Content>
        <Dialog.Actions style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
          <Button onPress={handleDismiss} style={{ marginRight: 8 }}>
            {t('common.cancel')}
          </Button>
          {foundElderly ? (
            <Button
              mode="contained"
              onPress={handleLink}
              loading={linking}
              disabled={linking}
            >
              {t('linkElderly.confirmLink')}
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={handleSearch}
              loading={loading}
              disabled={loading || !phone.trim()}
            >
              {t('common.search')}
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  input: {
    marginBottom: 12,
    backgroundColor: "transparent",
  },
  resultContainer: {
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 8,
  },
  statusChip: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
});
