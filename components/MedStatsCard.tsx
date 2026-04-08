import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";

interface MedStatsCardProps {
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  missedCount: number;
}

export default function MedStatsCard({
  totalCount,
  pendingCount,
  completedCount,
  missedCount,
}: MedStatsCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <Card.Content>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text variant="headlineSmall" style={styles.statNumber}>
              {totalCount}
            </Text>
            <Text variant="bodyMedium">{t('medication.total')}</Text>
          </View>
          <View style={styles.stat}>
            <Text
              variant="headlineSmall"
              style={[styles.statNumber, styles.pending]}
            >
              {pendingCount}
            </Text>
            <Text variant="bodyMedium">{t('common.pending')}</Text>
          </View>
          <View style={styles.stat}>
            <Text
              variant="headlineSmall"
              style={[styles.statNumber, styles.completed]}
            >
              {completedCount}
            </Text>
            <Text variant="bodyMedium">{t('medication.done')}</Text>
          </View>
          <View style={styles.stat}>
            <Text
              variant="headlineSmall"
              style={[styles.statNumber, styles.overdue]}
            >
              {missedCount}
            </Text>
            <Text variant="bodyMedium">{t('common.missed')}</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontWeight: "bold",
    color: "#2196F3",
  },
  pending: {
    color: "#FF9800",
  },
  completed: {
    color: "#4CAF50",
  },
  overdue: {
    color: "#F44336",
  },
});
