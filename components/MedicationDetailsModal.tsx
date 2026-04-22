import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Divider, Modal, Portal, Text, useTheme } from "react-native-paper";

export interface MedicationDetailField {
  label: string;
  value?: string | null;
}

interface MedicationDetailsModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  fields: MedicationDetailField[];
  onDismiss: () => void;
}

export default function MedicationDetailsModal({
  visible,
  title,
  subtitle,
  fields,
  onDismiss,
}: MedicationDetailsModalProps) {
  const theme = useTheme();
  const displayFields = fields.filter((field) => {
    if (field.value == null) return false;
    return String(field.value).trim().length > 0;
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              <MaterialCommunityIcons
                name="pill"
                size={24}
                color={theme.colors.onPrimaryContainer}
              />
            </View>
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={styles.title}>
                {title}
              </Text>
              {subtitle ? (
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          {displayFields.map((field, index) => (
            <View key={`${field.label}-${index}`}>
              {index > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.fieldBlock}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {field.label}
                </Text>
                <Text variant="bodyLarge" style={styles.fieldValue}>
                  {field.value}
                </Text>
              </View>
            </View>
          ))}

          <Button mode="contained" onPress={onDismiss} style={styles.closeButton}>
            Close
          </Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    borderRadius: 20,
    maxHeight: "80%",
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontWeight: "700",
  },
  divider: {
    marginVertical: 8,
  },
  fieldBlock: {
    paddingVertical: 6,
  },
  fieldValue: {
    marginTop: 4,
    lineHeight: 22,
  },
  closeButton: {
    marginTop: 20,
  },
});