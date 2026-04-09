import { useAuth } from "@/lib/auth-context";
import {
  addGroupMember,
  disbandGroup,
  getGroupMembers,
  getGroupsForUser,
  isGroupMuted,
  leaveGroup,
  removeGroupMember,
  toggleGroupMute,
  updateGroupAvatar,
  updateGroupName,
} from "@/lib/groups";
import { uploadAvatar } from "@/lib/user";
import UserAvatar from "./UserAvatar";
import { Group, GroupMember } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Divider,
  IconButton,
  List,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

interface GroupSettingsViewProps {
  groupId: string;
  groupName: string;
  myProfileId: string;
  myRole: "elderly" | "caregiver";
}

export default function GroupSettingsView({
  groupId,
  groupName: initialGroupName,
  myProfileId,
  myRole,
}: GroupSettingsViewProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupNameInput, setGroupNameInput] = useState(initialGroupName);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const mems = await getGroupMembers(groupId);
      setMembers(mems);

      const me = mems.find((m) => m.user_profile_id === myProfileId);
      setIsAdmin(me?.member_role === "admin");

      // Check muted state - we need to load the group doc
      const groups = await getGroupsForUser(myProfileId);
      const group = groups.find((g) => g.$id === groupId);
      if (group) {
        setMuted(isGroupMuted(group, myProfileId));
      }
    } catch (error) {
      console.error("Error loading group settings:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, myProfileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveName = async () => {
    const name = groupNameInput.trim();
    if (!name || name === initialGroupName) return;
    setSavingName(true);
    try {
      await updateGroupName(groupId, name);
      Alert.alert(t("common.success"), t("chat.groupNameUpdated"));
    } catch (error) {
      Alert.alert(t("common.error"), String(error));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileId = await uploadAvatar(result.assets[0]);
      await updateGroupAvatar(groupId, fileId);
      Alert.alert(t("common.success"), t("settings.avatarUpdated"));
    } catch (error) {
      Alert.alert(t("common.error"), t("settings.avatarUploadFailed"));
    }
  };

  const handleToggleMute = async () => {
    try {
      const newState = await toggleGroupMute(groupId, myProfileId);
      setMuted(newState);
    } catch (error) {
      console.error("Error toggling mute:", error);
    }
  };

  const handleRemoveMember = async (member: GroupMember) => {
    Alert.alert(
      t("chat.removeMember"),
      `${t("chat.removeMemberConfirm")} ${member.user_name}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await removeGroupMember(groupId, member.user_profile_id);
              setMembers((prev) => prev.filter((m) => m.$id !== member.$id));
            } catch (error) {
              Alert.alert(t("common.error"), String(error));
            }
          },
        },
      ],
    );
  };

  const handleLeave = () => {
    Alert.alert(t("chat.leaveGroup"), t("chat.leaveGroupConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        style: "destructive",
        onPress: async () => {
          try {
            await leaveGroup(groupId, myProfileId);
            router.back();
          } catch (error) {
            Alert.alert(t("common.error"), String(error));
          }
        },
      },
    ]);
  };

  const handleDisband = () => {
    Alert.alert(t("chat.disbandGroup"), t("chat.disbandConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        style: "destructive",
        onPress: async () => {
          try {
            const success = await disbandGroup(groupId, myProfileId);
            if (success) {
              router.back();
            } else {
              Alert.alert(t("common.error"), t("chat.notAdmin"));
            }
          } catch (error) {
            Alert.alert(t("common.error"), String(error));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: "700", flex: 1, marginLeft: 12 }}>
          {t("chat.groupSettings")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Group Avatar */}
        {isAdmin && (
          <TouchableOpacity style={styles.avatarSection} onPress={handleChangeAvatar}>
            <View style={[styles.avatarCircle, { backgroundColor: theme.colors.primaryContainer }]}>
              <MaterialCommunityIcons
                name="account-group"
                size={48}
                color={theme.colors.primary}
              />
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 8 }}>
              {t("settings.changeAvatar")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Group Name */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
            {t("chat.groupName")}
          </Text>
          <View style={styles.nameRow}>
            <TextInput
              mode="outlined"
              value={groupNameInput}
              onChangeText={setGroupNameInput}
              disabled={!isAdmin}
              style={{ flex: 1 }}
              dense
            />
            {isAdmin && (
              <Button
                mode="contained"
                compact
                onPress={handleSaveName}
                loading={savingName}
                disabled={savingName || groupNameInput.trim() === initialGroupName}
                style={{ marginLeft: 8 }}
              >
                {t("common.save")}
              </Button>
            )}
          </View>
        </View>

        <Divider />

        {/* Mute */}
        <List.Item
          title={t("chat.muteNotifications")}
          left={(props) => <List.Icon {...props} icon="bell-off-outline" />}
          right={() => <Switch value={muted} onValueChange={handleToggleMute} />}
        />

        <Divider />

        {/* Members */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
            {t("chat.groupMembers")} ({members.length})
          </Text>
          {members.map((member) => (
            <View key={member.$id} style={styles.memberRow}>
              <UserAvatar name={member.user_name} size={40} role={member.user_role} />
              <View style={styles.memberInfo}>
                <Text variant="bodyLarge" style={{ fontWeight: "500" }}>
                  {member.user_name}
                  {member.user_profile_id === myProfileId ? ` (${t("common.you")?.replace(": ", "")})` : ""}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {member.member_role === "admin" ? t("chat.admin") : t("chat.member")}
                </Text>
              </View>
              {isAdmin && member.user_profile_id !== myProfileId && (
                <IconButton
                  icon="close-circle-outline"
                  size={20}
                  iconColor={theme.colors.error}
                  onPress={() => handleRemoveMember(member)}
                />
              )}
            </View>
          ))}
        </View>

        <Divider style={{ marginTop: 16 }} />

        {/* Leave / Disband */}
        <View style={styles.dangerSection}>
          {!isAdmin && (
            <Button
              mode="outlined"
              textColor={theme.colors.error}
              onPress={handleLeave}
              icon="exit-run"
              style={styles.dangerBtn}
            >
              {t("chat.leaveGroup")}
            </Button>
          )}
          {isAdmin && (
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor={theme.colors.onError}
              onPress={handleDisband}
              icon="delete-forever"
              style={styles.dangerBtn}
            >
              {t("chat.disbandGroup")}
            </Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
    elevation: 2,
  },
  backBtn: { padding: 8 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 40 },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: "600",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  dangerSection: {
    padding: 16,
    gap: 12,
  },
  dangerBtn: {
    borderRadius: 12,
  },
});
