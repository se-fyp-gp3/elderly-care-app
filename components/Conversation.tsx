import ConversationScreen from "@/components/ConversationScreen";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { getElderlyByUserId } from "@/lib/elderly";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "react-native-paper";

export default function Conversation() {
  const theme = useTheme();
  const { user, preferences } = useAuth();
  const params = useLocalSearchParams<{
    contactId: string;
    contactName: string;
    contactRole: string;
  }>();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const role = preferences.role as "caregiver" | "elderly";

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        if (role === "caregiver") {
          const caregiver = await getCaregiverByUserId(user.$id);
          if (caregiver) {
            setProfileId(caregiver.$id);
            setProfileName(caregiver.name || user.name || "Me");
          }
        } else {
          const elderly = await getElderlyByUserId(user.$id);
          if (elderly) {
            setProfileId(elderly.$id);
            setProfileName(elderly.name || user.name || "Me");
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user, role]);

  if (loading || !profileId) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ConversationScreen
      myProfileId={profileId}
      myName={profileName}
      myRole={role}
      contactId={params.contactId}
      contactName={params.contactName}
      contactRole={params.contactRole as "caregiver" | "elderly"}
    />
  );
}
