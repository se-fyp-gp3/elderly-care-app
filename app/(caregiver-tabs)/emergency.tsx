import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useLayoutEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Linking,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Button,
    Card,
    Chip,
    Dialog,
    Divider,
    Portal,
    Surface,
    Text,
    useTheme
} from "react-native-paper";

type EmergencyLog = {
  id: string;
  type: "fall" | "sos" | "hr_warning" | "geo_fence";
  elderlyName: string;
  location: string;
  time: string;
  date: string;
  status: "active" | "resolved" | "investigating";
  desc: string;
};

const EMERGENCY_LOGS: EmergencyLog[] = [
  {
    id: "1",
    type: "sos",
    elderlyName: "Grandpa Zhang",
    location: "Bedroom 101",
    time: "10:15 AM",
    date: "Today",
    status: "active",
    desc: "SOS button pressed manually.",
  },
  {
    id: "2",
    type: "hr_warning",
    elderlyName: "Grandma Li",
    location: "Living Room",
    time: "09:30 AM",
    date: "Today",
    status: "investigating",
    desc: "Abnormal Heart Rate detected (140 bpm).",
  },
  {
    id: "3",
    type: "fall",
    elderlyName: "Grandpa Wang",
    location: "Bathroom",
    time: "02:00 AM",
    date: "Yesterday",
    status: "resolved",
    desc: "Fall detected. Staff assisted immediately.",
  },
  {
    id: "4",
    type: "geo_fence",
    elderlyName: "Grandma Chen",
    location: "Garden Gate",
    time: "04:45 PM",
    date: "Yesterday",
    status: "resolved",
    desc: "Exited safe zone.",
  },
];

export default function EmergencyPage() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const [selectedLog, setSelectedLog] = useState<EmergencyLog | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.navigate("/caregiver")}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            color={theme.colors.onSurface}
          />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ marginRight: 10 }}>
          <Chip
            icon="bell-ring"
            mode="outlined"
            style={{ borderColor: theme.colors.error }}
            textStyle={{ color: theme.colors.error }}
          >
            Live
          </Chip>
        </View>
      ),
    });
  }, [navigation, router, theme]);

  const handleCallEmergency = (number: string) => {
    Linking.openURL(`tel:${number}`);
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case "fall":
        return {
          icon: "alert-decagram",
          color: "#D32F2F",
          label: "Fall Detected",
        };
      case "sos":
        return { icon: "bell-alert", color: "#C62828", label: "SOS Alert" };
      case "hr_warning":
        return {
          icon: "heart-broken",
          color: "#E64A19",
          label: "Health Warning",
        };
      case "geo_fence":
        return {
          icon: "map-marker-alert",
          color: "#F57C00",
          label: "Geo-Fence",
        };
      default:
        return { icon: "alert", color: "#757575", label: "Alert" };
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    let textColor = theme.colors.primary;
    let bgColor = theme.colors.primaryContainer;
    let label = "Resolved";
    let icon = "check-circle";

    if (status === "active") {
      textColor = theme.colors.error;
      bgColor = theme.colors.errorContainer;
      label = "Active";
      icon = "alert-circle";
    } else if (status === "investigating") {
      textColor = "#FB8C00";
      bgColor = "#FFF3E0";
      label = "In Progress";
      icon = "progress-clock";
    }

    return (
      <Chip
        icon={icon}
        style={{ backgroundColor: bgColor }}
        textStyle={{ color: textColor, fontSize: 12 }}
        compact
      >
        {label}
      </Chip>
    );
  };

  const renderLogItem = ({ item }: { item: EmergencyLog }) => {
    const config = getTypeConfig(item.type);
    return (
      <Surface
        style={[styles.logCard, { borderLeftColor: config.color }]}
        elevation={1}
      >
        <TouchableOpacity
          onPress={() => setSelectedLog(item)}
          style={{ flexDirection: "row", alignItems: "center", padding: 12 }}
        >
          <View
            style={[styles.iconBox, { backgroundColor: config.color + "15" }]}
          >
            <MaterialCommunityIcons
              name={config.icon as any}
              size={28}
              color={config.color}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                {config.label}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text variant="bodyMedium" style={{ marginTop: 2 }}>
              {item.elderlyName}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color="#666"
              />
              <Text
                variant="bodySmall"
                style={{ color: "#666", marginLeft: 4, marginRight: 12 }}
              >
                {item.time}
              </Text>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={14}
                color="#666"
              />
              <Text
                variant="bodySmall"
                style={{ color: "#666", marginLeft: 4 }}
              >
                {item.location}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
        </TouchableOpacity>
      </Surface>
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Status Banner */}
        <Surface
          style={[
            styles.banner,
            { backgroundColor: theme.colors.errorContainer },
          ]}
          elevation={2}
        >
          <View style={styles.bannerContent}>
            <MaterialCommunityIcons
              name="shield-alert"
              size={48}
              color={theme.colors.error}
            />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text
                variant="headlineSmall"
                style={{
                  color: theme.colors.onErrorContainer,
                  fontWeight: "bold",
                }}
              >
                Alert System Active
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onErrorContainer }}
              >
                2 unresolved alerts require attention.
              </Text>
            </View>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.error}
            textColor="white"
            style={{ marginTop: 12 }}
            onPress={() => setSelectedLog(EMERGENCY_LOGS[0])}
          >
            View Latest Alert
          </Button>
        </Surface>

        {/* Quick Actions Grid */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Emergency Response
          </Text>
        </View>
        <View style={styles.grid}>
          <Card
            style={[styles.gridCard, { backgroundColor: "#FFEBEE" }]}
            onPress={() => handleCallEmergency("91361140")}
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons
                name="ambulance"
                size={32}
                color="#D32F2F"
              />
              <Text style={[styles.gridLabel, { color: "#D32F2F" }]}>
                Call Emergency
              </Text>
            </Card.Content>
          </Card>
          <Card
            style={[styles.gridCard, { backgroundColor: "#E3F2FD" }]}
            onPress={() => handleCallEmergency("110")}
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons
                name="police-badge"
                size={32}
                color="#1976D2"
              />
              <Text style={[styles.gridLabel, { color: "#1976D2" }]}>
                Police
              </Text>
            </Card.Content>
          </Card>
          <Card
            style={[styles.gridCard, { backgroundColor: "#fff" }]}
            onPress={() =>
              Alert.alert("Broadcast", "Sending alert to all active staff...")
            }
          >
            <Card.Content style={styles.gridContent}>
              <MaterialCommunityIcons
                name="bullhorn-outline"
                size={32}
                color={theme.colors.primary}
              />
              <Text style={styles.gridLabel}>Broadcast</Text>
            </Card.Content>
          </Card>
        </View>

        {/* Log List */}
        <View style={[styles.sectionHeader, { marginTop: 10 }]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Recent Logs
          </Text>
          <Button mode="text" compact>
            Filter
          </Button>
        </View>
        <FlatList
          data={EMERGENCY_LOGS}
          renderItem={renderLogItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />
      </ScrollView>

      <Portal>
        <Dialog
          visible={!!selectedLog}
          onDismiss={() => setSelectedLog(null)}
          style={{ backgroundColor: theme.colors.background }}
        >
          <Dialog.Title
            style={{ color: theme.colors.error, fontWeight: "bold" }}
          >
            <MaterialCommunityIcons name="alert" size={24} /> Incident Details
          </Dialog.Title>
          <Dialog.Content>
            {selectedLog && (
              <View>
                <Surface style={styles.detailBox} elevation={0}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLog.type.toUpperCase().replace("_", " ")}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Elderly:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLog.elderlyName}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Location:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLog.location}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Time:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLog.time}, {selectedLog.date}
                    </Text>
                  </View>
                </Surface>

                <Text
                  variant="titleMedium"
                  style={{ marginTop: 16, marginBottom: 4 }}
                >
                  Description
                </Text>
                <Text variant="bodyMedium" style={{ lineHeight: 20 }}>
                  {selectedLog.desc}
                </Text>

                <Divider style={{ marginVertical: 16 }} />
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                  Suggested Actions
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Chip
                    icon="phone"
                    onPress={() => handleCallEmergency("12345678")}
                  >
                    Call Family
                  </Chip>
                  <Chip icon="video" onPress={() => {}}>
                    View Camera
                  </Chip>
                </View>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedLog(null)}>Close</Button>
            <Button
              mode="contained"
              onPress={() => {
                Alert.alert("Resolved", "Incident marked as resolved.");
                setSelectedLog(null);
              }}
            >
              Mark Resolved
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  gridCard: {
    flex: 1,
    borderRadius: 12,
  },
  gridContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
  gridLabel: {
    marginTop: 8,
    fontWeight: "600",
    fontSize: 12,
  },
  logCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBox: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  detailLabel: {
    width: 80,
    color: "#666",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    color: "#000",
  },
});
