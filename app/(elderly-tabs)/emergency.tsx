import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Text, useTheme } from "react-native-paper";

interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
}

export default function ElderlyEmergency() {
  const theme = useTheme();

  const handleCall = (phone: string, name: string) => {
    Alert.alert(`Call ${name}?`, `Do you want to call ${phone}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Call",
        onPress: () => Linking.openURL(`tel:${phone.replace(/\s/g, "")}`),
      },
    ]);
  };

  const handleEmergencyCall = () => {
    Alert.alert(
      "Emergency Call",
      "Are you sure you want to call your emergency contact (91361140)?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call 91361140",
          style: "destructive",
          onPress: () => Linking.openURL("tel:91361140"),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Main Emergency Button */}
      <Card style={[styles.emergencyCard, { backgroundColor: "#FF3B30" }]}>
        <Card.Content style={styles.emergencyContent}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" }}>
            <MaterialCommunityIcons
              name="phone-alert"
              size={56}
              color="#FFFFFF"
            />
          </View>
          <Text variant="headlineLarge" style={styles.emergencyTitle}>
            Emergency Contact
          </Text>
          <Text variant="bodyLarge" style={styles.emergencySubtitle}>
            Press the button below to call your emergency contact
          </Text>
          <Button
            mode="contained"
            onPress={handleEmergencyCall}
            style={styles.emergencyButton}
            labelStyle={styles.emergencyButtonText}
            contentStyle={styles.emergencyButtonContent}
            icon="phone"
          >
            Call Now
          </Button>
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <Text variant="titleLarge" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.quickActionsGrid}>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#FFF3E0" }]}
          onPress={() => handleCall("999", "Ambulance")}
        >
          <Card.Content style={styles.quickActionContent}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FF980020", justifyContent: "center", alignItems: "center" }}>
              <MaterialCommunityIcons
                name="ambulance"
                size={36}
                color="#E65100"
              />
            </View>
            <Text variant="titleSmall" style={{ marginTop: 10, fontWeight: "bold" }}>Ambulance</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#FFEBEE" }]}
          onPress={() => handleCall("999", "Police")}
        >
          <Card.Content style={styles.quickActionContent}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#F4433620", justifyContent: "center", alignItems: "center" }}>
              <MaterialCommunityIcons
                name="shield-account"
                size={36}
                color="#C62828"
              />
            </View>
            <Text variant="titleSmall" style={{ marginTop: 10, fontWeight: "bold" }}>Police</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#FBE9E7" }]}
          onPress={() => handleCall("999", "Fire")}
        >
          <Card.Content style={styles.quickActionContent}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FF572220", justifyContent: "center", alignItems: "center" }}>
              <MaterialCommunityIcons
                name="fire-truck"
                size={36}
                color="#BF360C"
              />
            </View>
            <Text variant="titleSmall" style={{ marginTop: 10, fontWeight: "bold" }}>Fire</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#E3F2FD" }]}
          onPress={() => handleCall("999", "Hospital")}
        >
          <Card.Content style={styles.quickActionContent}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#2196F320", justifyContent: "center", alignItems: "center" }}>
              <MaterialCommunityIcons
                name="hospital-building"
                size={36}
                color="#0D47A1"
              />
            </View>
            <Text variant="titleSmall" style={{ marginTop: 10, fontWeight: "bold" }}>Hospital</Text>
          </Card.Content>
        </Card>
      </View>

      {/* Safety Tips */}
      <Card
        style={[
          styles.tipsCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content style={{ padding: 20 }}>
          <View style={styles.tipsHeader}>
            <MaterialCommunityIcons
              name="lightbulb"
              size={28}
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={{ marginLeft: 10, color: theme.colors.onPrimaryContainer, fontWeight: "bold" }}
            >
              Safety Tips
            </Text>
          </View>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 12, lineHeight: 28 }}
          >
            • Stay calm and speak clearly when calling for help{"\n"}• Know your
            address and keep it handy{"\n"}• Keep your phone charged and within
            reach{"\n"}• Inform your caregiver about any emergencies
          </Text>
        </Card.Content>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  emergencyCard: {
    marginBottom: 28,
    borderRadius: 28,
    elevation: 6,
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  emergencyContent: {
    alignItems: "center",
    padding: 32,
  },
  emergencyTitle: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginTop: 20,
  },
  emergencySubtitle: {
    color: "#FFFFFF",
    opacity: 0.9,
    textAlign: "center",
    marginTop: 10,
    fontSize: 17,
  },
  emergencyButton: {
    marginTop: 28,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 40,
    borderRadius: 28,
    elevation: 4,
  },
  emergencyButtonText: {
    color: "#FF3B30",
    fontSize: 22,
    fontWeight: "bold",
  },
  emergencyButtonContent: {
    paddingVertical: 12,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 14,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  quickActionCard: {
    width: "48%",
    marginBottom: 14,
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  quickActionContent: {
    alignItems: "center",
    paddingVertical: 24,
  },
  tipsCard: {
    borderRadius: 20,
    elevation: 2,
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 40,
  },
});
