import ConversationScreen from "@/components/ConversationScreen";
import {
    CAREGIVER_TABLE_ID,
    DATABASE_ID,
    ELDERLY_TABLE_ID,
    tablesDB,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import { getElderlyByUserId } from "@/lib/elderly";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Query } from "react-native-appwrite";
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
  const [myAvatarFileId, setMyAvatarFileId] = useState<string | undefined>();
  const [contactAvatarFileId, setContactAvatarFileId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const role = preferences.role as "caregiver" | "elderly";
  const contactRole = params.contactRole as "caregiver" | "elderly";

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        // Load own profile
        if (role === "caregiver") {
          const caregiver = await getCaregiverByUserId(user.$id);
          if (caregiver) {
            setProfileId(caregiver.$id);
            setProfileName(caregiver.name || user.name || "Me");
            setMyAvatarFileId(caregiver.avatar_file_id ?? undefined);
          }
        } else {
          const elderly = await getElderlyByUserId(user.$id);
          if (elderly) {
            setProfileId(elderly.$id);
            setProfileName(elderly.name || user.name || "Me");
            setMyAvatarFileId(elderly.avatar_file_id ?? undefined);
          }
        }

        // Load contact's profile to get their avatar
        const contactTableId =
          contactRole === "caregiver" ? CAREGIVER_TABLE_ID : ELDERLY_TABLE_ID;
        const contactResult = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: contactTableId,
          queries: [Query.equal("$id", params.contactId), Query.limit(1)],
        });
        if (contactResult.total > 0) {
          const contactDoc = contactResult.rows[0] as any;
          setContactAvatarFileId(contactDoc.avatar_file_id ?? undefined);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user, role, contactRole, params.contactId]);

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
      key={params.contactId}
      myProfileId={profileId}
      myName={profileName}
      myRole={role}
      contactId={params.contactId}
      contactName={params.contactName}
      contactRole={contactRole}
      myAvatarFileId={myAvatarFileId}
      contactAvatarFileId={contactAvatarFileId}
    />
  );
}
