import { Contact } from "@/lib/contacts";
import { createGroup } from "@/lib/groups";
import UserAvatar from "./UserAvatar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  Button,
  Checkbox,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

interface CreateGroupModalProps {
  visible: boolean;
  onDismiss: () => void;
  contacts: Contact[];
  myProfileId: string;
  myName: string;
  myRole: "elderly" | "caregiver";
  onGroupCreated: () => void;
}

export default function CreateGroupModal({
  visible,
  onDismiss,
  contacts,
  myProfileId,
  myName,
  myRole,
  onGroupCreated,
}: CreateGroupModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const toggleMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size < 2) {
      Alert.alert(t("chat.createGroup"), t("chat.minMembers"));
      return;
    }

    setCreating(true);
    try {
      const members = contacts
        .filter((c) => selected.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, role: c.role }));

      const name =
        groupName.trim() ||
        [myName, ...members.map((m) => m.name)].join(", ");

      await createGroup({
        name,
        creatorId: myProfileId,
        creatorName: myName,
        creatorRole: myRole,
        members,
      });

      Alert.alert(t("common.success"), t("chat.groupCreated"));
      setSelected(new Set());
      setGroupName("");
      onDismiss();
      onGroupCreated();
    } catch (error) {
      console.error("Error creating group:", error);
      Alert.alert(t("common.error"), String(error));
    } finally {
      setCreating(false);
    }
  };

  const handleDismiss = () => {
    setSelected(new Set());
    setGroupName("");
    onDismiss();
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        style={[
          styles.contactRow,
          isSelected && { backgroundColor: theme.colors.primaryContainer + "30" },
        ]}
        onPress={() => toggleMember(item.id)}
        activeOpacity={0.7}
      >
        <Checkbox
          status={isSelected ? "checked" : "unchecked"}
          onPress={() => toggleMember(item.id)}
          color={theme.colors.primary}
        />
        <UserAvatar
          avatarFileId={item.avatarFileId}
          name={item.name}
          size={40}
          role={item.role}
        />
        <View style={styles.contactInfo}>
          <Text variant="bodyLarge" style={{ fontWeight: "500" }}>
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.role === "elderly" ? t("common.elderly") : t("common.caregiver")}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.content, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={styles.header}>
                <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                  {t("chat.createGroup")}
                </Text>
                <TouchableOpacity onPress={handleDismiss}>
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color={theme.colors.onSurface}
                  />
                </TouchableOpacity>
              </View>

              {/* Group name input */}
              <TextInput
                mode="outlined"
                label={t("chat.groupName")}
                value={groupName}
                onChangeText={setGroupName}
                style={styles.nameInput}
                dense
                placeholder={t("chat.groupNamePlaceholder")}
              />

              {/* Member selection */}
              <Text
                variant="titleSmall"
                style={{ marginTop: 12, marginBottom: 8, color: theme.colors.onSurfaceVariant }}
              >
                {t("chat.selectMembers")} ({selected.size}/{contacts.length})
              </Text>

              <FlatList
                data={contacts}
                renderItem={renderContact}
                keyExtractor={(item) => item.id}
                style={styles.list}
                ItemSeparatorComponent={() => (
                  <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant }} />
                )}
              />

              {/* Create button */}
              <Button
                mode="contained"
                onPress={handleCreate}
                loading={creating}
                disabled={creating || selected.size < 2}
                style={styles.createBtn}
                icon="account-group"
              >
                {t("chat.createGroupChat")} ({selected.size})
              </Button>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  content: {
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nameInput: {
    marginBottom: 4,
  },
  list: {
    maxHeight: 300,
    flexGrow: 0,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  contactInfo: {
    flex: 1,
  },
  createBtn: {
    marginTop: 16,
    borderRadius: 12,
  },
});
