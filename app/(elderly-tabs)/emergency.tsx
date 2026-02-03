import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Button, Card, List, Text, useTheme } from "react-native-paper";

interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
}

export default function ElderlyEmergency() {
  const theme = useTheme();

  // Placeholder emergency contacts - in production, fetch from database
  const emergencyContacts: EmergencyContact[] = [
    {
      id: "1",
      name: "Emergency Services",
      relation: "Police/Fire/Ambulance",
      phone: "999",
    },
    {
      id: "2",
      name: "Family Contact",
      relation: "Primary Caregiver",
      phone: "+852 1234 5678",
    },
  ];

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
      "Are you sure you want to call emergency services (91361140)?",
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
          <MaterialCommunityIcons
            name="phone-alert"
            size={64}
            color="#FFFFFF"
          />
          <Text variant="headlineMedium" style={styles.emergencyTitle}>
            Emergency Call
          </Text>
          <Text variant="bodyLarge" style={styles.emergencySubtitle}>
            Press the button below to call emergency services
          </Text>
          <Button
            mode="contained"
            onPress={handleEmergencyCall}
            style={styles.emergencyButton}
            labelStyle={styles.emergencyButtonText}
            contentStyle={styles.emergencyButtonContent}
          >
            Call 999 Now
          </Button>
        </Card.Content>
      </Card>

      {/* Emergency Contacts */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Emergency Contacts
      </Text>
      <Card
        style={[styles.contactsCard, { backgroundColor: theme.colors.surface }]}
      >
        {emergencyContacts.map((contact) => (
          <List.Item
            key={contact.id}
            title={contact.name}
            description={`${contact.relation} • ${contact.phone}`}
            left={() => (
              <Avatar.Icon
                size={48}
                icon="account"
                style={{ backgroundColor: theme.colors.primaryContainer }}
              />
            )}
            right={() => (
              <Button
                mode="contained-tonal"
                icon="phone"
                onPress={() => handleCall(contact.phone, contact.name)}
              >
                Call
              </Button>
            )}
            style={styles.contactItem}
          />
        ))}
      </Card>

      {/* Quick Actions */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Quick Actions
      </Text>
      <View style={styles.quickActionsGrid}>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#FF980020" }]}
          onPress={() => handleCall("999", "Ambulance")}
        >
          <Card.Content style={styles.quickActionContent}>
            <MaterialCommunityIcons
              name="ambulance"
              size={40}
              color="#FF9800"
            />
            <Text variant="labelLarge">Ambulance</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#F4433620" }]}
          onPress={() => handleCall("999", "Police")}
        >
          <Card.Content style={styles.quickActionContent}>
            <MaterialCommunityIcons
              name="shield-account"
              size={40}
              color="#F44336"
            />
            <Text variant="labelLarge">Police</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#FF572220" }]}
          onPress={() => handleCall("999", "Fire")}
        >
          <Card.Content style={styles.quickActionContent}>
            <MaterialCommunityIcons
              name="fire-truck"
              size={40}
              color="#FF5722"
            />
            <Text variant="labelLarge">Fire</Text>
          </Card.Content>
        </Card>
        <Card
          style={[styles.quickActionCard, { backgroundColor: "#2196F320" }]}
          onPress={() => handleCall("999", "Hospital")}
        >
          <Card.Content style={styles.quickActionContent}>
            <MaterialCommunityIcons
              name="hospital-building"
              size={40}
              color="#2196F3"
            />
            <Text variant="labelLarge">Hospital</Text>
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
        <Card.Content>
          <View style={styles.tipsHeader}>
            <MaterialCommunityIcons
              name="lightbulb"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer }}
            >
              Safety Tips
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
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
    padding: 16,
  },
  emergencyCard: {
    marginBottom: 24,
    borderRadius: 20,
  },
  emergencyContent: {
    alignItems: "center",
    padding: 24,
  },
  emergencyTitle: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginTop: 16,
  },
  emergencySubtitle: {
    color: "#FFFFFF",
    opacity: 0.9,
    textAlign: "center",
    marginTop: 8,
  },
  emergencyButton: {
    marginTop: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 32,
  },
  emergencyButtonText: {
    color: "#FF3B30",
    fontSize: 20,
    fontWeight: "bold",
  },
  emergencyButtonContent: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 12,
  },
  contactsCard: {
    marginBottom: 24,
    borderRadius: 12,
  },
  contactItem: {
    paddingVertical: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  quickActionCard: {
    width: "48%",
    marginBottom: 12,
    borderRadius: 12,
  },
  quickActionContent: {
    alignItems: "center",
    paddingVertical: 20,
  },
  tipsCard: {
    borderRadius: 12,
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
});
