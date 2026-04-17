import GroupConversationScreen from "@/components/GroupConversationScreen";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "react-native-paper";

export default function GroupConversation() {
  const theme = useTheme();
  const { user, preferences } = useAuth();
  const params = useLocalSearchParams<{
    groupId: string;
    groupName: string;
  }>();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const caregiver = await getCaregiverByUserId(user.$id);
        if (caregiver) {
          setProfileId(caregiver.$id);
          setProfileName(caregiver.name || user.name || "Me");
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user]);

  if (loading || !profileId) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <GroupConversationScreen
      key={params.groupId}
      myProfileId={profileId}
      myName={profileName}
      myRole="caregiver"
      groupId={params.groupId}
      groupName={params.groupName}
    />
  );
}
