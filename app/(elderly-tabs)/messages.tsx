import CreateGroupModal from "@/components/CreateGroupModal";
import UserAvatar from "@/components/UserAvatar";
import {
    CAREGIVER_TABLE_ID,
    clientReactNative,
    DATABASE_ID,
    DIRECT_MESSAGES_TABLE_ID,
    GROUP_MEMBERS_TABLE_ID,
    GROUP_MESSAGES_TABLE_ID,
    safeSubscribe,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
    addElderlyConnection,
    Contact,
    formatRelativeTime,
    getContactsForElderly,
    searchUserByPhone,
} from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import {
    getGroupUnreadCount,
    getLastGroupMessage,
} from "@/lib/group-messaging";
import {
    acceptGroupInvitation,
    getGroupsForUser,
    getPendingGroupInvitations,
    rejectGroupInvitation,
} from "@/lib/groups";
import {
    buildConversationId,
    getLastMessage,
    getUnreadCountPerConversation,
} from "@/lib/messaging";
import { isUserOnline } from "@/lib/presence";
import { Caregiver, Elderly } from "@/types/appwrite";
import {
    DirectMessage,
    Group,
    GroupMember,
    GroupMessage,
} from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    FlatList,
    Keyboard,
    Linking,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    RefreshControl,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Avatar,
    Badge,
    Button,
    Menu,
    Searchbar,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";

import MomentsView from "@/components/MomentsView";

type ChatListItem =
  | {
      type: "direct";
      contact: Contact;
      lastMsg: DirectMessage | null;
      unread: number;
    }
  | {
      type: "group";
      group: Group;
      lastMsg: GroupMessage | null;
      unread: number;
    };

function chatListItemId(item: ChatListItem): string {
  return item.type === "direct" ? item.contact.id : `group_${item.group.$id}`;
}

function chatListItemTime(item: ChatListItem): string {
  if (item.type === "direct") {
    return item.lastMsg?.created_at ?? item.contact.lastActive ?? "";
  }
  return item.lastMsg?.created_at ?? item.group.created_at ?? "";
}

export default function ElderlyMessages() {
  const theme = useTheme();
  const { user, preferences, updatePreferences } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [elderlyProfileId, setElderlyProfileId] = useState<string | null>(null);
  const [elderlyName, setElderlyName] = useState<string>("");
  const [lastMessages, setLastMessages] = useState<
    Record<string, DirectMessage | null>
  >({});

  // ── Group state ──
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupLastMessages, setGroupLastMessages] = useState<
    Record<string, GroupMessage | null>
  >({});
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [groupUnreadCounts, setGroupUnreadCounts] = useState<
    Record<string, number>
  >({});
  const pinnedConversations: string[] =
    (preferences.pinnedConversations as string[]) ?? [];

  // ── Action sheet / Create Group ──
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [longPressItem, setLongPressItem] = useState<ChatListItem | null>(null);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);

  // ── Pending group invitations ──
  const [pendingGroupInvites, setPendingGroupInvites] = useState<
    { membership: GroupMember; group: Group }[]
  >([]);
  const [acceptingGroupId, setAcceptingGroupId] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = React.useRef<FlatList<number>>(null);

  // ── Add friend dialog state ──
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<
    | { role: "elderly"; data: Elderly }
    | { role: "caregiver"; data: Caregiver }
    | null
  >(null);
  const [addingContact, setAddingContact] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      const elderly = await getElderlyByUserId(user.$id);
      if (!elderly) {
        setContacts([]);
        return;
      }
      setElderlyProfileId(elderly.$id);
      setElderlyName(elderly.name || user.name || "Me");

      const [data, userGroups, dmUnreadMap, groupInvites] = await Promise.all([
        getContactsForElderly(elderly.$id),
        getGroupsForUser(elderly.$id),
        getUnreadCountPerConversation(elderly.$id),
        getPendingGroupInvitations(elderly.$id),
      ]);
      setUnreadCounts(dmUnreadMap);
      setGroups(userGroups);
      setPendingGroupInvites(groupInvites);

      // Fetch last messages for each contact
      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(elderly.$id, contact.id);
          lastMsgs[contact.id] = await getLastMessage(convId);
        }),
      );
      setLastMessages(lastMsgs);

      // Fetch group last messages + group unread counts
      const gLastMsgs: Record<string, GroupMessage | null> = {};
      const gUnreads: Record<string, number> = {};
      await Promise.all(
        userGroups.map(async (g) => {
          const [lastGMsg, count] = await Promise.all([
            getLastGroupMessage(g.$id),
            getGroupUnreadCount(g.$id, elderly.$id),
          ]);
          gLastMsgs[g.$id] = lastGMsg;
          gUnreads[g.$id] = count;
        }),
      );
      setGroupLastMessages(gLastMsgs);
      setGroupUnreadCounts(gUnreads);

      // Sort contacts by latest message time
      data.sort((a, b) => {
        const msgA = lastMsgs[a.id];
        const msgB = lastMsgs[b.id];
        const timeA = msgA?.created_at ?? a.lastActive ?? "";
        const timeB = msgB?.created_at ?? b.lastActive ?? "";
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      setContacts(data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const navigateToConversation = useCallback(
    (contact: Contact) => {
      const convId = buildConversationId(elderlyProfileId!, contact.id);
      setUnreadCounts((prev) => {
        const n = new Map(prev);
        n.delete(convId);
        return n;
      });
      router.push({
        pathname: "/conversation",
        params: {
          contactId: contact.id,
          contactName: contact.name,
          contactRole: contact.role,
        },
      });
    },
    [router, elderlyProfileId],
  );

  const navigateToGroupConversation = useCallback(
    (group: Group) => {
      setGroupUnreadCounts((prev) => ({ ...prev, [group.$id]: 0 }));
      router.push({
        pathname: "/group-conversation",
        params: { groupId: group.$id, groupName: group.name },
      });
    },
    [router],
  );

  // ── Pin / Unpin ──
  const handleTogglePin = useCallback(
    async (itemId: string) => {
      const current = pinnedConversations;
      const newPinned = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      try {
        await updatePreferences({ pinnedConversations: newPinned });
      } catch (e) {
        console.error("Failed to update pinned:", e);
      }
    },
    [pinnedConversations, updatePreferences],
  );

  const handleLongPress = useCallback((item: ChatListItem) => {
    setLongPressItem(item);
    setShowLongPressMenu(true);
  }, []);

  // ── Add friend dialog handlers ──
  const openAddDialog = useCallback(() => {
    setPhoneSearch("");
    setFoundUser(null);
    setSearchDone(false);
    setAddDialogVisible(true);
  }, []);

  const closeAddDialog = useCallback(() => {
    setAddDialogVisible(false);
    setPhoneSearch("");
    setFoundUser(null);
    setSearchDone(false);
  }, []);

  const handlePhoneSearch = useCallback(async () => {
    const trimmed = phoneSearch.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSearching(true);
    setFoundUser(null);
    setSearchDone(false);
    try {
      const result = await searchUserByPhone(trimmed);
      if (
        result &&
        result.role === "elderly" &&
        result.data.$id === elderlyProfileId
      ) {
        setFoundUser(null);
      } else {
        setFoundUser(result);
      }
      setSearchDone(true);
    } catch {
      Alert.alert(t("common.error"), t("emergency.failedToAdd"));
    } finally {
      setSearching(false);
    }
  }, [phoneSearch, elderlyProfileId]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser || !elderlyProfileId) return;
    setAddingContact(true);
    try {
      const alreadyExists = contacts.some((c) => c.id === foundUser.data.$id);
      if (alreadyExists) {
        Alert.alert(
          t("emergency.alreadyAdded"),
          t("emergency.alreadyInContacts", {
            name: foundUser.data.name ?? t("common.unknown"),
          }),
        );
        setAddingContact(false);
        return;
      }

      const success = await addElderlyConnection(
        elderlyProfileId,
        foundUser.data.$id,
      );

      if (success) {
        Alert.alert(
          t("emergency.invitationSent"),
          t("emergency.invitationSentDesc", {
            name: foundUser.data.name ?? t("common.unknown"),
          }),
        );
        closeAddDialog();
        await fetchContacts();
      } else {
        Alert.alert(
          t("emergency.alreadyAdded"),
          t("emergency.alreadyInContactsOrPending", {
            name: foundUser.data.name ?? t("common.unknown"),
          }),
        );
      }
    } catch {
      Alert.alert(t("common.error"), t("emergency.failedToAdd"));
    } finally {
      setAddingContact(false);
    }
  }, [foundUser, elderlyProfileId, contacts, closeAddDialog, fetchContacts]);

  // ── Accept / Reject group invitation handlers ──
  const handleAcceptGroupInvite = useCallback(
    async (invite: { membership: GroupMember; group: Group }) => {
      if (!elderlyProfileId) return;
      setAcceptingGroupId(invite.membership.$id);
      try {
        await acceptGroupInvitation(
          invite.membership.$id,
          invite.group.$id,
          elderlyName,
          "elderly",
          elderlyProfileId,
        );
        Alert.alert(t("chat.acceptedGroupInvite"), invite.group.name);
        await fetchContacts();
      } catch (e) {
        Alert.alert(t("common.error"), t("chat.failedToAcceptInvite"));
      } finally {
        setAcceptingGroupId(null);
      }
    },
    [elderlyProfileId, elderlyName, fetchContacts, t],
  );

  const handleRejectGroupInvite = useCallback(
    (invite: { membership: GroupMember; group: Group }) => {
      Alert.alert(
        t("chat.declineGroupInvite"),
        t("chat.declineGroupConfirm", { name: invite.group.name }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("emergency.decline"),
            style: "destructive",
            onPress: async () => {
              try {
                await rejectGroupInvitation(invite.membership.$id);
                setPendingGroupInvites((prev) =>
                  prev.filter(
                    (i) => i.membership.$id !== invite.membership.$id,
                  ),
                );
              } catch (e) {
                Alert.alert(t("common.error"), t("chat.failedToDeclineInvite"));
              }
            },
          },
        ],
      );
    },
    [t],
  );

  // ── Build unified chat list ──
  const chatList: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = [];
    const query = searchQuery.toLowerCase();

    contacts.forEach((c) => {
      if (
        query &&
        !c.name.toLowerCase().includes(query) &&
        !(c.phone && c.phone.includes(query))
      )
        return;
      const convId = buildConversationId(elderlyProfileId!, c.id);
      items.push({
        type: "direct",
        contact: c,
        lastMsg: lastMessages[c.id] ?? null,
        unread: unreadCounts.get(convId) ?? 0,
      });
    });

    groups.forEach((g) => {
      if (query && !g.name.toLowerCase().includes(query)) return;
      items.push({
        type: "group",
        group: g,
        lastMsg: groupLastMessages[g.$id] ?? null,
        unread: groupUnreadCounts[g.$id] ?? 0,
      });
    });

    items.sort((a, b) => {
      const aId = chatListItemId(a);
      const bId = chatListItemId(b);
      const aPinned = pinnedConversations.includes(aId);
      const bPinned = pinnedConversations.includes(bId);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      const timeA = new Date(chatListItemTime(a)).getTime() || 0;
      const timeB = new Date(chatListItemTime(b)).getTime() || 0;
      return timeB - timeA;
    });

    return items;
  }, [
    contacts,
    groups,
    lastMessages,
    groupLastMessages,
    unreadCounts,
    groupUnreadCounts,
    pinnedConversations,
    searchQuery,
    elderlyProfileId,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchContacts();
    }, [fetchContacts]),
  );

  useEffect(() => {
    if (!elderlyProfileId) return;

    // Subscribe to Direct Messages table for realtime updates
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = safeSubscribe(channel, (response) => {
      if (response.events.some((event) => event.endsWith(".create"))) {
        const payload = response.payload as DirectMessage;

        if (
          payload.sender_id === elderlyProfileId ||
          payload.receiver_id === elderlyProfileId
        ) {
          const otherUserId =
            payload.sender_id === elderlyProfileId
              ? payload.receiver_id
              : payload.sender_id;

          // Update last message
          setLastMessages((prev) => ({
            ...prev,
            [otherUserId]: payload,
          }));

          // Increment unread count if I am receiver
          if (payload.receiver_id === elderlyProfileId) {
            setUnreadCounts((prev) => {
              const n = new Map(prev);
              const convId = payload.conversation_id;
              n.set(convId, (n.get(convId) ?? 0) + 1);
              return n;
            });
          }

          // Only mark the other user as online if THEY sent the message
          if (payload.sender_id !== elderlyProfileId) {
            const now = new Date().toISOString();
            setContacts((prevContacts) => {
              const index = prevContacts.findIndex((c) => c.id === otherUserId);
              if (index === -1) return prevContacts;

              const updatedContact = {
                ...prevContacts[index],
                lastActive: now,
              };
              const newContacts = [...prevContacts];
              newContacts.splice(index, 1);
              newContacts.unshift(updatedContact);
              return newContacts;
            });
          }
        }
      }
    });

    // Subscribe to Group Messages
    const groupChannel = `databases.${DATABASE_ID}.collections.${GROUP_MESSAGES_TABLE_ID}.documents`;
    const unsubGroup = clientReactNative.subscribe(groupChannel, (response) => {
      if (!response.events.some((e) => e.endsWith(".create"))) return;
      const payload = response.payload as GroupMessage;
      setGroupLastMessages((prev) => ({
        ...prev,
        [payload.group_id]: payload,
      }));
      if (payload.sender_id !== elderlyProfileId) {
        setGroupUnreadCounts((prev) => ({
          ...prev,
          [payload.group_id]: (prev[payload.group_id] ?? 0) + 1,
        }));
      }
    });

    // Subscribe to group_members for realtime group discovery
    const groupMembersChannel = `databases.${DATABASE_ID}.collections.${GROUP_MEMBERS_TABLE_ID}.documents`;
    const unsubMembers = clientReactNative.subscribe(
      groupMembersChannel,
      (response) => {
        if (!response.events.some((e) => e.endsWith(".create"))) return;
        const payload = response.payload as { user_profile_id?: string };
        if (payload?.user_profile_id === elderlyProfileId) {
          fetchContacts();
        }
      },
    );

    return () => {
      unsubscribe();
      unsubGroup();
      unsubMembers();
    };
  }, [elderlyProfileId]);

  // ── Realtime presence subscription ─────────────────────────────
  // Subscribe to caregiver profile updates so the green/gray dot
  // switches in realtime when a contact comes online or goes offline.
  const contactIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    contactIdsRef.current = new Set(contacts.map((c) => c.id));
  }, [contacts]);

  useEffect(() => {
    if (!elderlyProfileId) return;

    const channel = `databases.${DATABASE_ID}.collections.${CAREGIVER_TABLE_ID}.documents`;
    const unsubscribe = clientReactNative.subscribe(channel, (response) => {
      if (!response.events.some((e) => e.endsWith(".update"))) return;
      const payload = response.payload as { $id: string; last_active?: string };
      if (!payload?.$id || !contactIdsRef.current.has(payload.$id)) return;

      // Update the contact's lastActive in-place so the dot refreshes
      setContacts((prev) =>
        prev.map((c) =>
          c.id === payload.$id
            ? { ...c, lastActive: payload.last_active ?? c.lastActive }
            : c,
        ),
      );
    });

    return () => {
      unsubscribe();
    };
  }, [elderlyProfileId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  const handleCall = useCallback(
    (phone?: string | null) => {
      if (!phone)
        return Alert.alert(
          t("common.noPhoneNumber"),
          t("emergency.noPhoneOnFile"),
        );
      const url = `tel:${phone}`;
      Linking.canOpenURL(url).then((supported) => {
        if (supported) Linking.openURL(url);
        else Alert.alert(t("common.cannotCall"));
      });
    },
    [t],
  );

  const handleSMS = useCallback(
    (phone?: string | null) => {
      if (!phone)
        return Alert.alert(
          t("common.noPhoneNumber"),
          t("emergency.noPhoneOnFile"),
        );
      const url = `sms:${phone}`;
      Linking.canOpenURL(url).then((supported) => {
        if (supported) Linking.openURL(url);
        else Alert.alert(t("common.cannotSMS"));
      });
    },
    [t],
  );

  const renderChatListItem = ({ item }: { item: ChatListItem }) => {
    const itemId = chatListItemId(item);
    const isPinned = pinnedConversations.includes(itemId);

    if (item.type === "group") {
      const group = item.group;
      const lastMsg = item.lastMsg;
      const time = lastMsg?.created_at ?? group.created_at;
      const preview = lastMsg?.body;
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigateToGroupConversation(group)}
          onLongPress={() => handleLongPress(item)}
          style={[
            styles.contactItem,
            {
              backgroundColor: isPinned
                ? theme.colors.surfaceVariant
                : theme.colors.surface,
            },
          ]}
        >
          <View style={styles.avatarContainer}>
            <Avatar.Icon
              size={56}
              icon="account-group"
              style={{ backgroundColor: theme.colors.tertiaryContainer }}
            />
            {item.unread > 0 && (
              <Badge size={18} style={styles.unreadBadge}>
                {item.unread}
              </Badge>
            )}
          </View>
          <View style={styles.contactInfo}>
            <View style={styles.contactHeader}>
              <View
                style={{
                  flex: 1,
                  marginRight: 8,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {isPinned && (
                  <MaterialCommunityIcons
                    name="pin"
                    size={14}
                    color={theme.colors.primary}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  variant="titleMedium"
                  style={[
                    styles.contactName,
                    { color: theme.colors.onSurface },
                  ]}
                  numberOfLines={1}
                >
                  {group.name}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={[
                  styles.timeText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {formatRelativeTime(time)}
              </Text>
            </View>
            {preview ? (
              <Text
                variant="bodySmall"
                style={[
                  styles.previewText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={1}
              >
                {lastMsg?.sender_id === elderlyProfileId
                  ? t("common.you")
                  : `${lastMsg?.sender_name}: `}
                {lastMsg?.message_type === "voice"
                  ? t("common.voiceMessage")
                  : preview}
              </Text>
            ) : (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("messages.tapToChat")}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    // Direct message item
    const contact = item.contact;
    const lastMsg = item.lastMsg;
    const lastMsgTime = lastMsg?.created_at || contact.lastActive;
    const preview = lastMsg?.body;
    const online = isUserOnline(contact.lastActive);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigateToConversation(contact)}
        onLongPress={() => handleLongPress(item)}
        style={[
          styles.contactItem,
          {
            backgroundColor: isPinned
              ? theme.colors.surfaceVariant
              : theme.colors.surface,
          },
        ]}
      >
        <View style={styles.avatarContainer}>
          <UserAvatar
            avatarFileId={contact.avatarFileId}
            name={contact.name}
            size={56}
            role={contact.role}
          />
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor: online ? "#4CAF50" : "#BDBDBD",
                borderColor: theme.colors.surface,
              },
            ]}
          />
          {item.unread > 0 && (
            <Badge size={18} style={styles.unreadBadge}>
              {item.unread}
            </Badge>
          )}
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.contactHeader}>
            <View
              style={{
                flex: 1,
                marginRight: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              {isPinned && (
                <MaterialCommunityIcons
                  name="pin"
                  size={14}
                  color={theme.colors.primary}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text
                variant="titleMedium"
                style={[styles.contactName, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {contact.name}
              </Text>
            </View>
            <Text
              variant="bodySmall"
              style={[
                styles.timeText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {formatRelativeTime(lastMsgTime)}
            </Text>
          </View>

          {preview ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {lastMsg && (
                <MaterialCommunityIcons
                  name={lastMsg.is_read ? "check-all" : "check"}
                  size={14}
                  color={
                    lastMsg.is_read ? "#4CAF50" : theme.colors.onSurfaceVariant
                  }
                  style={{ marginRight: 3 }}
                />
              )}
              <Text
                variant="bodySmall"
                style={[
                  styles.previewText,
                  { color: theme.colors.onSurfaceVariant, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {lastMsg?.sender_id === elderlyProfileId ? t("common.you") : ""}
                {lastMsg?.message_type === "voice"
                  ? t("common.voiceMessage")
                  : preview}
              </Text>
            </View>
          ) : (
            <View style={styles.contactSubInfo}>
              <View
                style={[
                  styles.roleTag,
                  { backgroundColor: theme.colors.tertiaryContainer },
                ]}
              >
                <MaterialCommunityIcons
                  name="shield-account"
                  size={13}
                  color={theme.colors.tertiary}
                />
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.tertiary, fontWeight: "600" }}
                >
                  {t("common.caregiver")}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("messages.tapToChat")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleCall(contact.phone);
            }}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <MaterialCommunityIcons
              name="phone"
              size={22}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View
        style={[
          styles.emptyIconCircle,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
      >
        <MaterialCommunityIcons
          name="chat-plus-outline"
          size={64}
          color={theme.colors.outlineVariant}
        />
      </View>
      <Text
        variant="headlineSmall"
        style={[styles.emptyTitle, { color: theme.colors.onSurface }]}
      >
        {t("messages.noCaregiversYet")}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        {t("messages.caregiverAppearHere")}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.sectionRow}>
        <MaterialCommunityIcons
          name="account-supervisor-circle"
          size={20}
          color={theme.colors.primary}
        />
        <Text
          variant="titleSmall"
          style={[styles.sectionLabel, { color: theme.colors.primary }]}
        >
          {t("messages.myCaregivers")}
        </Text>
        <View
          style={[
            styles.countBadge,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.primary, fontWeight: "bold" }}
          >
            {chatList.length}
          </Text>
        </View>
      </View>
    </View>
  );

  const onTabPress = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.scrollToIndex({ index, animated: true });
  };

  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(e.nativeEvent.contentOffset.x / width);
    if (slide !== activeTab) {
      setActiveTab(slide);
    }
  };

  const renderChatPage = () => (
    <View style={{ width, flex: 1 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.searchRow}>
          <Searchbar
            placeholder={t("messages.searchCaregivers")}
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={[
              styles.searchBar,
              { backgroundColor: theme.colors.surfaceVariant, flex: 1 },
            ]}
            inputStyle={styles.searchInput}
            elevation={0}
          />
          <Menu
            visible={showAddMenu}
            onDismiss={() => setShowAddMenu(false)}
            anchor={
              <TouchableOpacity
                onPress={() => setShowAddMenu(true)}
                style={[
                  styles.addBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="plus"
                  size={22}
                  color={theme.colors.onPrimary}
                />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              leadingIcon="account-plus"
              title={t("chat.addNewFriend")}
              onPress={() => {
                setShowAddMenu(false);
                openAddDialog();
              }}
            />
            <Menu.Item
              leadingIcon="account-group"
              title={t("chat.createGroupChat")}
              onPress={() => {
                setShowAddMenu(false);
                setShowCreateGroup(true);
              }}
            />
          </Menu>
        </View>
      </View>

      {/* Pending Group Invitations */}
      {pendingGroupInvites.length > 0 && !loading && (
        <View
          style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={20}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{
                marginLeft: 6,
                fontWeight: "700",
                color: theme.colors.primary,
              }}
            >
              {t("chat.groupInvitations", {
                count: pendingGroupInvites.length,
              })}
            </Text>
          </View>
          {pendingGroupInvites.map((invite) => (
            <View
              key={invite.membership.$id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 14,
                padding: 12,
                marginBottom: 8,
                backgroundColor: theme.colors.primaryContainer,
              }}
            >
              <Avatar.Icon
                size={40}
                icon="account-group"
                style={{ backgroundColor: theme.colors.tertiaryContainer }}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="titleSmall" style={{ fontWeight: "600" }}>
                  {invite.group.name}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t("chat.invitedYouToGroup")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleAcceptGroupInvite(invite)}
                disabled={acceptingGroupId === invite.membership.$id}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  justifyContent: "center",
                  alignItems: "center",
                  marginLeft: 8,
                  backgroundColor: "#4CAF50",
                }}
              >
                {acceptingGroupId === invite.membership.$id ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="check" size={18} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRejectGroupInvite(invite)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  justifyContent: "center",
                  alignItems: "center",
                  marginLeft: 6,
                  backgroundColor: "#FFCDD2",
                }}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color="#D32F2F"
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Contact List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            variant="bodyMedium"
            style={[
              styles.loadingText,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {t("messages.loadingCaregivers")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatList}
          renderItem={renderChatListItem}
          keyExtractor={(item) => chatListItemId(item)}
          contentContainerStyle={[
            styles.listContent,
            chatList.length === 0 && styles.emptyList,
          ]}
          ListHeaderComponent={chatList.length > 0 ? renderHeader : null}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                marginLeft: 86,
                backgroundColor: theme.colors.outlineVariant ?? "#E0E0E0",
              }}
            />
          )}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          extraData={[
            lastMessages,
            groupLastMessages,
            unreadCounts,
            groupUnreadCounts,
            pinnedConversations,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  const renderMomentsPage = () => (
    <View style={{ width, flex: 1 }}>
      <MomentsView />
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Top Tab Bar */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: theme.colors.surface,
          elevation: 1,
        }}
      >
        {["Chats", "Moments"].map((tab, index) => {
          const isActive = activeTab === index;
          return (
            <TouchableOpacity
              key={tab}
              style={{
                flex: 1,
                paddingVertical: 14,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: isActive
                  ? theme.colors.primary
                  : "transparent",
              }}
              onPress={() => onTabPress(index)}
              activeOpacity={0.7}
            >
              <Text
                variant="labelLarge"
                style={{
                  color: isActive
                    ? theme.colors.primary
                    : theme.colors.onSurfaceVariant,
                  fontWeight: isActive ? "700" : "500",
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        ref={pagerRef}
        data={[0, 1]}
        renderItem={({ item }) =>
          item === 0 ? renderChatPage() : renderMomentsPage()
        }
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.toString()}
        style={{ flex: 1 }}
        getItemLayout={(data, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />

      {/* ── Add Friend Modal ── */}
      <Modal
        visible={addDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddDialog}
      >
        <TouchableWithoutFeedback onPress={closeAddDialog}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                    {t("emergency.addFriend")}
                  </Text>
                  <TouchableOpacity onPress={closeAddDialog}>
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.onSurface}
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginBottom: 16,
                  }}
                >
                  {t("emergency.searchByPhone")}
                </Text>

                <View style={styles.phoneRow}>
                  <TextInput
                    mode="outlined"
                    label={t("emergency.phoneNumber")}
                    value={phoneSearch}
                    onChangeText={setPhoneSearch}
                    keyboardType="phone-pad"
                    style={{ flex: 1 }}
                    dense
                    left={<TextInput.Icon icon="phone" />}
                    onSubmitEditing={handlePhoneSearch}
                    returnKeyType="search"
                  />
                  <Button
                    mode="contained"
                    onPress={handlePhoneSearch}
                    loading={searching}
                    disabled={!phoneSearch.trim() || searching}
                    style={styles.searchBtn}
                    compact
                  >
                    {t("common.search")}
                  </Button>
                </View>

                {searching && (
                  <View style={styles.resultArea}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                    <Text
                      variant="bodySmall"
                      style={{
                        marginLeft: 8,
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      {t("emergency.searching")}
                    </Text>
                  </View>
                )}

                {searchDone && !searching && foundUser && (
                  <View
                    style={[
                      styles.resultCard,
                      { backgroundColor: theme.colors.secondaryContainer },
                    ]}
                  >
                    <Avatar.Text
                      size={40}
                      label={(foundUser.data.name ?? "?")
                        .substring(0, 2)
                        .toUpperCase()}
                      style={{
                        backgroundColor:
                          foundUser.role === "elderly"
                            ? theme.colors.primaryContainer
                            : theme.colors.tertiaryContainer,
                      }}
                      labelStyle={{
                        color:
                          foundUser.role === "elderly"
                            ? theme.colors.onPrimaryContainer
                            : theme.colors.onTertiaryContainer,
                        fontWeight: "600",
                        fontSize: 16,
                      }}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text variant="titleMedium" style={{ fontWeight: "600" }}>
                        {foundUser.data.name ?? "Unknown"}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 2,
                          gap: 8,
                        }}
                      >
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <MaterialCommunityIcons
                            name="phone"
                            size={13}
                            color={theme.colors.onSecondaryContainer}
                          />
                          <Text
                            variant="bodySmall"
                            style={{
                              marginLeft: 4,
                              color: theme.colors.onSecondaryContainer,
                            }}
                          >
                            {foundUser.data.phone ?? "N/A"}
                          </Text>
                        </View>
                        <View
                          style={{
                            backgroundColor:
                              foundUser.role === "elderly"
                                ? theme.colors.primaryContainer
                                : theme.colors.tertiaryContainer,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            variant="labelSmall"
                            style={{
                              color:
                                foundUser.role === "elderly"
                                  ? theme.colors.primary
                                  : theme.colors.tertiary,
                              fontWeight: "600",
                              textTransform: "capitalize",
                            }}
                          >
                            {foundUser.role}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Button
                      mode="contained"
                      onPress={handleAddFriend}
                      loading={addingContact}
                      disabled={addingContact}
                      compact
                    >
                      {t("common.add")}
                    </Button>
                  </View>
                )}

                {searchDone && !searching && !foundUser && (
                  <View style={styles.resultArea}>
                    <MaterialCommunityIcons
                      name="account-search"
                      size={28}
                      color={theme.colors.outlineVariant}
                    />
                    <Text
                      variant="bodyMedium"
                      style={{
                        marginLeft: 8,
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      {t("emergency.noUserFound")}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Create Group Modal ── */}
      <CreateGroupModal
        visible={showCreateGroup}
        onDismiss={() => setShowCreateGroup(false)}
        contacts={contacts}
        myProfileId={elderlyProfileId!}
        myName={elderlyName}
        myRole="elderly"
        onGroupCreated={() => {
          setShowCreateGroup(false);
          fetchContacts();
        }}
      />

      {/* ── Long-press Pin/Unpin Modal ── */}
      <Modal
        visible={showLongPressMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLongPressMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowLongPressMenu(false)}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.colors.surface, padding: 16 },
              ]}
            >
              {longPressItem &&
                (() => {
                  const itemId = chatListItemId(longPressItem);
                  const isPinned = pinnedConversations.includes(itemId);
                  return (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                      }}
                      onPress={() => {
                        handleTogglePin(itemId);
                        setShowLongPressMenu(false);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={isPinned ? "pin-off" : "pin"}
                        size={22}
                        color={theme.colors.onSurface}
                        style={{ marginRight: 12 }}
                      />
                      <Text
                        variant="bodyLarge"
                        style={{ color: theme.colors.onSurface }}
                      >
                        {isPinned
                          ? t("chat.unpinConversation")
                          : t("chat.pinConversation")}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 0,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontWeight: "bold",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchBar: {
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    fontSize: 15,
    minHeight: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabel: {
    fontWeight: "600",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  contactInfo: {
    flex: 1,
    marginRight: 8,
  },
  contactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  contactName: {
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
    fontSize: 16,
  },
  timeText: {
    fontSize: 12,
  },
  previewText: {
    marginTop: 2,
    fontSize: 14,
  },
  contactSubInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  roleTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBtn: {
    marginTop: 6,
    borderRadius: 8,
  },
  resultArea: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    justifyContent: "center",
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    borderRadius: 14,
    padding: 14,
  },
});
