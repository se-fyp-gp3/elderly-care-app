import { useAuth } from "@/lib/auth-context";
import { UIVersion } from "@/types/user";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

interface MiniSettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const VERSION_OPTIONS: {
  key: UIVersion;
  labelKey: string;
  descKey: string;
  icon: string;
}[] = [
  {
    key: UIVersion.Default,
    labelKey: "miniSettings.default",
    descKey: "miniSettings.defaultDesc",
    icon: "view-dashboard",
  },
  {
    key: UIVersion.Accessible,
    labelKey: "miniSettings.accessible",
    descKey: "miniSettings.accessibleDesc",
    icon: "text-box-outline",
  },
  {
    key: UIVersion.Simplified,
    labelKey: "miniSettings.superSimplified",
    descKey: "miniSettings.superSimplifiedDesc",
    icon: "cellphone",
  },
];

export default function MiniSettingsModal({
  visible,
  onDismiss,
}: MiniSettingsModalProps) {
  const theme = useTheme();
  const router = useRouter();
  const { preferences, setPreference, signOut } = useAuth();
  const { t } = useTranslation();
  const currentVersion =
    (preferences.uiVersion as UIVersion) || UIVersion.Default;

  const handleVersionChange = async (version: UIVersion) => {
    await setPreference("uiVersion", version);
    onDismiss();
    router.replace("/(elderly-tabs)/" as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.content,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={styles.header}>
                <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                  {t('miniSettings.title')}
                </Text>
                <TouchableOpacity onPress={onDismiss}>
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color={theme.colors.onSurface}
                  />
                </TouchableOpacity>
              </View>

              <Text
                variant="titleSmall"
                style={{
                  fontWeight: "600",
                  marginBottom: 10,
                  color: theme.colors.onSurface,
                }}
              >
                {t('miniSettings.interfaceStyle')}
              </Text>

              {VERSION_OPTIONS.map((opt) => {
                const selected = currentVersion === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => handleVersionChange(opt.key)}
                    style={[
                      styles.optionRow,
                      {
                        backgroundColor: selected
                          ? theme.colors.primaryContainer
                          : theme.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={opt.icon as any}
                      size={24}
                      color={
                        selected
                          ? theme.colors.primary
                          : theme.colors.onSurfaceVariant
                      }
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        variant="bodyLarge"
                        style={{ fontWeight: selected ? "700" : "400" }}
                      >
                        {t(opt.labelKey)}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {t(opt.descKey)}
                      </Text>
                    </View>
                    {selected && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={22}
                        color={theme.colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}

              <Button
                mode="contained"
                onPress={signOut}
                style={styles.signOutBtn}
                buttonColor={theme.colors.error}
                textColor={theme.colors.onError}
                icon="logout"
              >
                {t('common.signOut')}
              </Button>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  signOutBtn: {
    marginTop: 20,
    borderRadius: 14,
  },
});
