import ConversationScreen from "@/components/ConversationScreen";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";

export default function CaregiverConversation() {
  const theme = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    contactId: string;
    contactName: string;
    contactRole: string;
  }>();

  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.contactName) {
      navigation.setOptions({ title: params.contactName });
    }
  }, [params.contactName, navigation]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const caregiver = await getCaregiverByUserId(user.$id);
        if (caregiver) {
          setMyProfileId(caregiver.$id);
          setMyName(caregiver.name || user.name || "Me");
        }
      } catch (error) {
        console.error("Error loading caregiver profile:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading || !myProfileId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
          Loading conversation...
        </Text>
      </View>
    );
  }

  return (
    <ConversationScreen
      myProfileId={myProfileId}
      myName={myName}
      myRole="caregiver"
      contactId={params.contactId}
      contactName={params.contactName || "Contact"}
      contactRole={(params.contactRole as "caregiver" | "elderly") || "elderly"}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
