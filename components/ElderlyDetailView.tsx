import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
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

  const handleCall = (phone?: string) => {
    if (onCall && phone) {
      onCall(phone);
      return;
    }
    if (!phone) {
      Alert.alert("No phone number");
      return;
    }
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((s) =>
      s ? Linking.openURL(url) : Alert.alert("Cannot call"),
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
              {data.name || "Unknown"}
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
                {data.status || "Normal"}
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
            <Text style={styles.actionLabel}>Call</Text>
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
            <Text style={styles.actionLabel}>Health Data</Text>
          </Card.Content>
        </Card>
      </View>

      {/* Vitals Snapshot */}
      <Card style={styles.sectionCard}>
        <Card.Title
          title="Latest Vitals"
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
                Blood Pressure
              </Text>
              <Text variant="titleLarge">{data.lastVitals?.bp || "N/A"}</Text>
            </View>
            <View style={styles.vitalDivider} />
            <View style={styles.vitalItem}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.secondary }}
              >
                Heart Rate
              </Text>
              <Text variant="titleLarge">{data.lastVitals?.hr || "N/A"}</Text>
            </View>
            <View style={styles.vitalDivider} />
            <View style={styles.vitalItem}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.secondary }}
              >
                Temp
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
          title="Basic Information"
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
            title="Age / Gender"
            description={`${
              data.age !== undefined
                ? `${data.age} years old`
                : data.birth
                  ? new Date(data.birth).toLocaleDateString()
                  : "Unknown"
            } / ${data.gender || "Unknown"}`}
            left={(props) => <List.Icon {...props} icon="calendar-account" />}
          />
          <Divider />
          {data.birth && (
            <>
              <List.Item
                title="Date of Birth"
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
            title="Blood Type"
            description={data.bloodType || "Unknown"}
            left={(props) => <List.Icon {...props} icon="water" />}
          />
          <Divider />
          <List.Item
            title="Phone"
            description={data.phone || "Not set"}
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
            title="Emergency Contact"
            description={data.emergencyContact || "Not set"}
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
