import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, IconButton, Text } from "react-native-paper";

// Define the interface for the medication item
export interface MedicationItem {
  id: string;
  elderly: string;
  name: string;
  dosage: string;
  frequency: string;
  time: string;
  status: string; // 'pending' | 'completed' | 'overdue'
  lastTaken: string;
  takenAtIso?: string;
  notes?: string;
  isPrescriptionId?: boolean;
  realId?: string;
  reminderId?: string;
  logId?: string;
}

interface MedicationCardProps {
  med: MedicationItem;
  onConfirmPress: (med: MedicationItem) => void;
  onRemind: (id: string) => void;
  onMarkProcessed: (id: string) => void;
}

/**
 * MedicationCard Component
 * Displays detailed information about a single medication task and provides actions.
 */
export default function MedicationCard({
  med,
  onConfirmPress,
  onRemind,
  onMarkProcessed,
}: MedicationCardProps) {
  const { t } = useTranslation();

  return (
    <Card style={styles.medicationCard}>
      <Card.Content>
        <View style={styles.medHeader}>
          <View>
            <Text variant="titleMedium">{med.name}</Text>
            <Text variant="bodyMedium" style={styles.elderlyName}>
              {med.elderly}
            </Text>
          </View>
          <Chip
            mode="outlined"
            style={[
              styles.statusChip,
              med.status === "completed" && styles.completedChip,
              med.status === "overdue" && styles.overdueChip,
            ]}
            textStyle={
              med.status === "completed"
                ? styles.completedText
                : med.status === "overdue"
                  ? styles.overdueText
                  : undefined
            }
          >
            {med.status === "completed"
              ? t('common.completed')
              : med.status === "pending"
                ? t('common.pending')
                : t('common.missed')}
          </Chip>
        </View>

        <View style={styles.medDetails}>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="pill" size={16} />
            <Text variant="bodySmall"> {t('medication.dose', { dosage: med.dosage })}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="repeat" size={16} />
            <Text variant="bodySmall"> {t('medication.frequencyLabel', { frequency: med.frequency })}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} />
            <Text variant="bodySmall"> {t('medication.timeLabel', { time: med.time })}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="history" size={16} />
            <Text variant="bodySmall"> {t('medication.lastTaken', { time: med.lastTaken })}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {med.status === "pending" && (
            <>
              <Button
                mode="contained"
                compact
                onPress={() => onConfirmPress(med)}
              >
                {t('medication.confirmTaking')}
              </Button>
              <Button mode="outlined" compact onPress={() => onRemind(med.id)}>
                {t('medication.remindLater')}
              </Button>
            </>
          )}
          {med.status === "completed" && (
            <Button mode="outlined" compact disabled>
              {t('common.completed')}
            </Button>
          )}
          {med.status === "overdue" && (
            <Button
              mode="contained"
              compact
              style={styles.overdueButton}
              onPress={() => onMarkProcessed(med.id)}
            >
              {t('medication.markProcessed')}
            </Button>
          )}
          <IconButton
            icon="information-outline"
            size={20}
            onPress={() => console.log("check the details")}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  medicationCard: {
    marginBottom: 12,
  },
  medHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  elderlyName: {
    opacity: 0.7,
  },
  statusChip: {
    marginLeft: 8,
  },
  completedChip: {
    backgroundColor: "#E8F5E8",
  },
  overdueChip: {
    backgroundColor: "#FFEBEE",
  },
  completedText: {
    color: "#4CAF50",
  },
  overdueText: {
    color: "#F44336",
  },
  medDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overdueButton: {
    backgroundColor: "#F44336",
  },
});
