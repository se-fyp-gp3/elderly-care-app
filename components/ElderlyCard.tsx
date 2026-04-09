import { ElderlyStatusInfo } from "@/lib/elderly-status";
import { Elderly, ElderlyStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, Text, useTheme } from "react-native-paper";

// Define the interface for the elderly item
export interface ElderlyItem extends Elderly {
  lastCheck?: string;
  medication?: string;
  nextAppointment?: string;
  // age is removed as we will calculate it from birth if needed, or define it as optional if passed
  age?: number;
  statusInfo?: ElderlyStatusInfo;
}

interface ElderlyCardProps {
  elderly: ElderlyItem;
  onCall: (phone?: string) => void;
  onViewInfo: (elderly: ElderlyItem) => void;
  onViewHealth: (id: string) => void;
}

const calculateAge = (birthDateString?: string | null): number | string => {
  if (!birthDateString) return "??";
  const birthDate = new Date(birthDateString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * ElderlyCard Component
 * Displays a summary card for an elderly person with quick action buttons.
 */
export default function ElderlyCard({
  elderly,
  onCall,
  onViewInfo,
  onViewHealth,
}: ElderlyCardProps) {
  const displayAge = elderly.age ?? calculateAge(elderly.birth);
  const theme = useTheme();
  const { t } = useTranslation();

  const isWarning = elderly.status === ElderlyStatus.WARNING;
  const isDanger = elderly.status === ElderlyStatus.DANGER;
  const hasIssue = isWarning || isDanger;
  const reasons = elderly.statusInfo?.reasons ?? [];

  const chipLabel = isDanger
    ? t('caregiverPanel.danger')
    : isWarning
      ? t('medication.needAttention')
      : t('caregiverPanel.normal');

  const chipStyle = isDanger
    ? styles.dangerChip
    : isWarning
      ? styles.warningChip
      : undefined;

  const avatarStyle = isDanger
    ? styles.dangerAvatar
    : isWarning
      ? styles.warningAvatar
      : styles.avatar;

  return (
    <Card style={styles.elderlyCard}>
      <Card.Content>
        <View style={styles.elderlyHeader}>
          <View style={styles.elderlyInfo}>
            <Avatar.Text
              size={50}
              label={elderly.name ? elderly.name.substring(0, 2) : "??"}
              style={avatarStyle}
            />
            <View style={styles.elderlyDetails}>
              <Text variant="titleMedium">{elderly.name}</Text>
              <Text variant="bodyMedium">{displayAge} {t('healthData.yearsOld', { age: '' }).replace(/^\d*\s*/, '')}</Text>
            </View>
          </View>
          <Chip mode="outlined" style={[styles.statusChip, chipStyle]}>
            {chipLabel}
          </Chip>
        </View>

        {/* Status reason badges */}
        {hasIssue && reasons.length > 0 && (
          <View style={styles.reasonsRow}>
            {reasons.map((reason, idx) => (
              <View key={idx} style={styles.reasonBadge}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={13}
                  color={isDanger ? "#D32F2F" : "#E65100"}
                />
                <Text
                  variant="labelSmall"
                  style={{
                    color: isDanger ? "#D32F2F" : "#E65100",
                    marginLeft: 3,
                  }}
                >
                  {reason}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.elderlyStats}>
          <View style={styles.statRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} />
            <Text variant="bodySmall"> {t('caregiverPanel.lastCheck')} {elderly.lastCheck}</Text>
          </View>
          <View style={styles.statRow}>
            <MaterialCommunityIcons
              name="pill"
              size={16}
              color={
                elderly.medication?.includes('missed')
                  ? '#E65100'
                  : undefined
              }
            />
            <Text
              variant="bodySmall"
              style={
                elderly.medication?.includes('missed')
                  ? { color: '#E65100', fontWeight: 'bold' }
                  : undefined
              }
            >
              {' '}{t('home.todaysMedications').split(' ').pop()}: {elderly.medication}
            </Text>
          </View>
          <View style={styles.statRow}>
            <MaterialCommunityIcons name="calendar" size={16} />
            <Text variant="bodySmall">
              {" "}
              {t('caregiverPanel.nextAppointment')} {elderly.nextAppointment}
            </Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <Button
            mode="outlined"
            compact
            icon="phone"
            style={styles.smallButton}
            onPress={() => onCall(elderly.phone || undefined)}
          >
            {t('caregiverPanel.call')}
          </Button>
          <Button
            mode="outlined"
            compact
            icon="chat"
            style={styles.smallButton}
            onPress={() => onViewInfo(elderly)}
          >
            {t('caregiverPanel.info')}
          </Button>
          <Button
            mode="contained"
            compact
            icon="chart-line"
            style={styles.smallButton}
            onPress={() => onViewHealth(elderly.$id)} // Ensure we use the correct ID field
          >
            {t('caregiverPanel.health')}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  elderlyCard: {
    marginBottom: 12,
  },
  elderlyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  elderlyInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  elderlyDetails: {
    marginLeft: 12,
  },
  avatar: {
    backgroundColor: "#2196F3",
  },
  warningAvatar: {
    backgroundColor: "#FF9800",
  },
  dangerAvatar: {
    backgroundColor: "#D32F2F",
  },
  statusChip: {
    marginLeft: 8,
  },
  warningChip: {
    backgroundColor: "#FFF3E0",
  },
  dangerChip: {
    backgroundColor: "#FFEBEE",
  },
  reasonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  reasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  elderlyStats: {
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  smallButton: {
    flex: 1,
    marginHorizontal: 4,
  },
});
