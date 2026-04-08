import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";
import {
    Avatar,
    Card,
    Chip,
    Divider,
    IconButton,
    List,
    Surface,
    Text,
    useTheme,
} from "react-native-paper";

export interface ElderlyDetailData {
  id: string;
  name: string;
  age?: number;
  birth?: string;
  gender?: string;
  bloodType?: string;
  phone?: string;
  emergencyContact?: string;
  status?: string;
  lastVitals?: {
    bp?: string;
    hr?: string;
    temp?: string;
  };
}

interface ElderlyDetailViewProps {
  data: ElderlyDetailData;
  onCall?: (phone: string) => void;
  onHealthData?: (id: string) => void;
}

export default function ElderlyDetailView({
  data,
  onCall,
  onHealthData,
}: ElderlyDetailViewProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const handleCall = (phone?: string) => {
    if (onCall && phone) {
      onCall(phone);
      return;
    }
    if (!phone) {
      Alert.alert(t('common.noPhoneNumber'));
      return;
    }
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((s) =>
      s ? Linking.openURL(url) : Alert.alert(t('common.cannotCall')),
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header Section */}
      <Surface
        style={[styles.header, { backgroundColor: theme.colors.surface }]}
        elevation={1}
      >
        <View style={styles.headerTop}>
          <Avatar.Text
            size={80}
            label={data.name ? data.name.substring(0, 2) : "??"}
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={styles.headerInfo}>
            <Text variant="headlineSmall" style={{ fontWeight: "bold" }}>
              {data.name || t('common.unknown')}
            </Text>
            <View style={styles.badgeRow}>
              <Chip icon="identifier" style={styles.chip} compact>
                ID: {data.id || "null"}
              </Chip>
              <Chip
                icon="heart-pulse"
                style={[styles.chip, { backgroundColor: "#E8F5E9" }]}
                textStyle={{ color: "#2E7D32" }}
                compact
              >
                {data.status || t('caregiverPanel.normal')}
              </Chip>
            </View>
          </View>
        </View>
      </Surface>

      {/* Quick Actions Grid */}
      <View style={styles.actionGrid}>
        <Card
          style={[styles.actionCard, { flex: 1, marginRight: 8 }]}
          onPress={() => handleCall(data.phone)}
        >
          <Card.Content style={styles.actionContent}>
            <MaterialCommunityIcons
              name="phone"
              size={28}
              color={theme.colors.primary}
            />
            <Text style={styles.actionLabel}>{t('caregiverPanel.call')}</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.actionCard, { flex: 1, marginLeft: 8 }]}
          onPress={() => onHealthData && onHealthData(data.id)}
        >
          <Card.Content style={styles.actionContent}>
            <MaterialCommunityIcons
              name="chart-line"
              size={28}
              color={theme.colors.error}
            />
            <Text style={styles.actionLabel}>{t('caregiverPanel.healthData')}</Text>
          </Card.Content>
        </Card>
      </View>

      {/* Vitals Snapshot */}
      <Card style={styles.sectionCard}>
        <Card.Title
          title={t('healthData.latestVitals')}
          left={(props) => (
            <MaterialCommunityIcons
              {...props}
              name="monitor-dashboard"
              size={24}
            />
          )}
        />
        <Card.Content>
          <View style={styles.vitalsRow}>
            <View style={styles.vitalItem}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.secondary }}
              >
                {t('healthData.bloodPressure')}
              </Text>
              <Text variant="titleLarge">{data.lastVitals?.bp || "N/A"}</Text>
            </View>
            <View style={styles.vitalDivider} />
            <View style={styles.vitalItem}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.secondary }}
              >
                {t('healthData.heartRate')}
              </Text>
              <Text variant="titleLarge">{data.lastVitals?.hr || "N/A"}</Text>
            </View>
            <View style={styles.vitalDivider} />
            <View style={styles.vitalItem}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.secondary }}
              >
                {t('healthData.temp')}
              </Text>
              <Text variant="titleLarge">
                {data.lastVitals?.temp || "N/A"}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Basic Information */}
      <Card style={[styles.sectionCard, { marginBottom: 30 }]}>
        <Card.Title
          title={t('healthData.basicInfo')}
          left={(props) => (
            <MaterialCommunityIcons
              {...props}
              name="account-details"
              size={24}
            />
          )}
        />
        <Card.Content style={{ padding: 0 }}>
          <List.Item
            title={t('healthData.ageGender')}
            description={`${
              data.age !== undefined
                ? t('healthData.yearsOld', { age: data.age })
                : data.birth
                  ? new Date(data.birth).toLocaleDateString()
                  : t('common.unknown')
            } / ${data.gender || t('common.unknown')}`}
            left={(props) => <List.Icon {...props} icon="calendar-account" />}
          />
          <Divider />
          {data.birth && (
            <>
              <List.Item
                title={t('healthData.dateOfBirth')}
                description={new Date(data.birth).toLocaleDateString("en-GB", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                left={(props) => <List.Icon {...props} icon="cake-variant" />}
              />
              <Divider />
            </>
          )}
          <Divider />
          <List.Item
            title={t('healthData.bloodType')}
            description={data.bloodType || t('common.unknown')}
            left={(props) => <List.Icon {...props} icon="water" />}
          />
          <Divider />
          <List.Item
            title={t('healthData.phone')}
            description={data.phone || t('common.notSet')}
            left={(props) => <List.Icon {...props} icon="phone" />}
            right={(props) =>
              data.phone ? (
                <IconButton
                  {...props}
                  icon="phone-outline"
                  onPress={() => handleCall(data.phone)}
                />
              ) : null
            }
          />
          <Divider />
          <List.Item
            title={t('home.emergencyContact')}
            description={data.emergencyContact || t('common.notSet')}
            descriptionNumberOfLines={2}
            left={(props) => (
              <List.Icon {...props} icon="alert-circle-outline" />
            )}
          />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 20,
    paddingTop: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerInfo: {
    marginLeft: 16,
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 4,
    height: 28,
  },
  actionGrid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionCard: {
    borderRadius: 12,
  },
  actionContent: {
    alignItems: "center",
    paddingVertical: 12,
  },
  actionLabel: {
    marginTop: 8,
    fontWeight: "600",
  },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  vitalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  vitalItem: {
    alignItems: "center",
    flex: 1,
  },
  vitalDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "#E0E0E0",
  },
});
