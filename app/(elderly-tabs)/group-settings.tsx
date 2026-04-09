import GroupSettingsView from "@/components/GroupSettingsView";
import { useAuth } from "@/lib/auth-context";
import { getElderlyByUserId } from "@/lib/elderly";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "react-native-paper";

export default function GroupSettings() {
  const theme = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    groupId: string;
    groupName: string;
  }>();

  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const elderly = await getElderlyByUserId(user.$id);
        if (elderly) setProfileId(elderly.$id);
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
    <GroupSettingsView
      groupId={params.groupId}
      groupName={params.groupName}
      myProfileId={profileId}
      myRole="elderly"
    />
  );
}
