import CreateGroupModal from "@/components/CreateGroupModal";
import UserAvatar from "@/components/UserAvatar";
import {
  CAREGIVER_TABLE_ID,
  clientReactNative,
  DATABASE_ID,
  DIRECT_MESSAGES_TABLE_ID,
  ELDERLY_TABLE_ID,
  GROUP_MEMBERS_TABLE_ID,
  GROUP_MESSAGES_TABLE_ID,
  safeSubscribe,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId } from "@/lib/caregiver";
import {
  acceptCaregiverConnection,
  addCaregiverConnection,
  Contact,
  formatRelativeTime,
  getContactsForCaregiver,
  getPendingCaregiverConnections,
  rejectCaregiverConnection,
  searchUserByPhone,
} from "@/lib/contacts";
import {
  getGroupUnreadCount,
  getLastGroupMessage,
} from "@/lib/group-messaging";
import {
  acceptGroupInvitation,
  buildGroupAvatarUrl,
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
import { useTranslation } from "react-i18next";

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

export default function CaregiverMessages() {
  const theme = useTheme();
  const { user, preferences, updatePreferences } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [caregiverProfileId, setCaregiverProfileId] = useState<string | null>(
    null,
  );
  const [caregiverName, setCaregiverName] = useState<string>("");
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
  const [pendingRequests, setPendingRequests] = useState<
    { connectionId: string; from: Contact }[]
  >([]);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        setContacts([]);
        return;
      }
      setCaregiverProfileId(caregiver.$id);
      setCaregiverName(caregiver.name || user.name || "Me");

      const [data, requests, userGroups, dmUnreadMap, groupInvites] =
        await Promise.all([
          getContactsForCaregiver(caregiver.$id),
          getPendingCaregiverConnections(caregiver.$id),
          getGroupsForUser(caregiver.$id),
          getUnreadCountPerConversation(caregiver.$id),
          getPendingGroupInvitations(caregiver.$id),
        ]);
      setPendingRequests(requests);
      setUnreadCounts(dmUnreadMap);
      setGroups(userGroups);
      setPendingGroupInvites(groupInvites);

      // Fetch last messages for each contact
      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(caregiver.$id, contact.id);
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
            getGroupUnreadCount(g.$id, caregiver.$id),
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
        // descending order
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      setContacts(data);
      setFilteredContacts(data);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleAcceptRequest = async (connectionId: string, name: string) => {
    try {
      await acceptCaregiverConnection(connectionId);
      Alert.alert(
        t("emergency.connected"),
        t("emergency.connectedWith", { name }),
      );
      fetchContacts();
    } catch (error) {
      Alert.alert(t("common.error"), t("emergency.failedToAccept"));
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    try {
      await rejectCaregiverConnection(connectionId);
      Alert.alert(t("emergency.rejected"), t("emergency.requestRejected"));
      fetchContacts();
    } catch (error) {
      Alert.alert(t("common.error"), t("emergency.failedToReject"));
    }
  };

  // ── Accept / Reject group invitation handlers ──
  const handleAcceptGroupInvite = useCallback(
    async (invite: { membership: GroupMember; group: Group }) => {
      if (!caregiverProfileId) return;
      setAcceptingGroupId(invite.membership.$id);
      try {
        await acceptGroupInvitation(
          invite.membership.$id,
          invite.group.$id,
          caregiverName,
          "caregiver",
          caregiverProfileId,
        );
        Alert.alert(t("chat.acceptedGroupInvite"), invite.group.name);
        await fetchContacts();
      } catch (e) {
        Alert.alert(t("common.error"), t("chat.failedToAcceptInvite"));
      } finally {
        setAcceptingGroupId(null);
      }
    },
    [caregiverProfileId, caregiverName, fetchContacts, t],
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

  const navigateToConversation = useCallback(
    (contact: Contact) => {
      // Clear unread for this DM
      const convId = buildConversationId(caregiverProfileId!, contact.id);
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
    [router, caregiverProfileId],
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
      const convId = buildConversationId(caregiverProfileId!, c.id);
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

    // Sort: pinned first, then by time
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
    caregiverProfileId,
  ]);

  useFocusEffect(
    useCallback(() => {
      fetchContacts();
    }, [fetchContacts]),
  );

  useEffect(() => {
    if (!caregiverProfileId) return;

    // Subscribe to Direct Messages table
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = safeSubscribe(channel, (response) => {
      // Check if it's a create event
      if (response.events.some((event) => event.endsWith(".create"))) {
        const payload = response.payload as DirectMessage;

        // Check if I am the sender or receiver
        if (
          payload.sender_id === caregiverProfileId ||
          payload.receiver_id === caregiverProfileId
        ) {
          const otherUserId =
            payload.sender_id === caregiverProfileId
              ? payload.receiver_id
              : payload.sender_id;

          // Update last message
          setLastMessages((prev) => ({
            ...prev,
            [otherUserId]: payload,
          }));

          // Increment unread count if I am receiver
          if (payload.receiver_id === caregiverProfileId) {
            setUnreadCounts((prev) => {
              const n = new Map(prev);
              const convId = payload.conversation_id;
              n.set(convId, (n.get(convId) ?? 0) + 1);
              return n;
            });
          }

          // Only mark the other user as online if THEY sent the message
          if (payload.sender_id !== caregiverProfileId) {
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
      // Update last group message
      setGroupLastMessages((prev) => ({
        ...prev,
        [payload.group_id]: payload,
      }));
      // Increment group unread if not my message
      if (payload.sender_id !== caregiverProfileId) {
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
        if (payload?.user_profile_id === caregiverProfileId) {
          fetchContacts();
        }
      },
    );

    return () => {
      unsubscribe();
      unsubGroup();
      unsubMembers();
    };
  }, [caregiverProfileId]);

  // ── Realtime presence subscription ─────────────────────────────
  // Subscribe to elderly AND caregiver profile updates so the green/gray
  // dot switches in realtime when a contact comes online or goes offline.
  const contactIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    contactIdsRef.current = new Set(contacts.map((c) => c.id));
  }, [contacts]);

  useEffect(() => {
    if (!caregiverProfileId) return;

    const handlePresenceUpdate = (response: {
      events: string[];
      payload: any;
    }) => {
      if (!response.events.some((e) => e.endsWith(".update"))) return;
      const payload = response.payload as { $id: string; last_active?: string };
      if (!payload?.$id || !contactIdsRef.current.has(payload.$id)) return;

      setContacts((prev) =>
        prev.map((c) =>
          c.id === payload.$id
            ? { ...c, lastActive: payload.last_active ?? c.lastActive }
            : c,
        ),
      );
    };

    const elderlyChannel = `databases.${DATABASE_ID}.collections.${ELDERLY_TABLE_ID}.documents`;
    const caregiverChannel = `databases.${DATABASE_ID}.collections.${CAREGIVER_TABLE_ID}.documents`;
    const unsubElderly = clientReactNative.subscribe(
      elderlyChannel,
      handlePresenceUpdate,
    );
    const unsubCaregiver = clientReactNative.subscribe(
      caregiverChannel,
      handlePresenceUpdate,
    );

    return () => {
      unsubElderly();
      unsubCaregiver();
    };
  }, [caregiverProfileId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  const handleCall = useCallback((phone?: string | null) => {
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
  }, []);

  const handleSMS = useCallback((phone?: string | null) => {
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
      // Don't show self in results
      if (
        result &&
        result.role === "caregiver" &&
        result.data.$id === caregiverProfileId
      ) {
        setFoundUser(null);
      } else {
        setFoundUser(result);
      }
      setSearchDone(true);
    } catch (error) {
      Alert.alert(t("common.error"), t("emergency.failedToAdd"));
    } finally {
      setSearching(false);
    }
  }, [phoneSearch, caregiverProfileId]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser || !caregiverProfileId) return;
    setAddingContact(true);
    try {
      // Check if already in contacts
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

      // Always add to caregiver_connections (friend/chat list),
      // NOT caregiver_elderly (which implies caregiving responsibility)
      // This will now create a PENDING request
      const success = await addCaregiverConnection(
        caregiverProfileId,
        foundUser.data.$id,
      );

      if (success) {
        Alert.alert(
          t("emergency.invitationSent"),
          t("emergency.invitationSentDesc", {
            name: foundUser.data.name ?? t("common.unknown"),
          }) +
            " " +
            t("emergency.chatOnceAccepted"),
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
    } catch (error) {
      Alert.alert(t("common.error"), t("emergency.failedToAdd"));
    } finally {
      setAddingContact(false);
    }
  }, [foundUser, caregiverProfileId, contacts, closeAddDialog, fetchContacts]);

  const renderChatListItem = ({ item }: { item: ChatListItem }) => {
    const itemId = chatListItemId(item);
    const isPinned = pinnedConversations.includes(itemId);

    if (item.type === "group") {
      const group = item.group;
      const lastMsg = item.lastMsg;
      const time = lastMsg?.created_at ?? group.created_at;
      const preview = lastMsg?.body;
      let displayPreview = preview;
      if (lastMsg?.message_type === "system" && preview) {
        try {
          const sysMsg = JSON.parse(preview);
          if (sysMsg.type === "created") displayPreview = t("chat.createdTheGroup", { name: sysMsg.name });
          else if (sysMsg.type === "joined") displayPreview = t("chat.joinedTheGroup", { name: sysMsg.name });
        } catch {
          const createdMatch = preview.match(/^(.+) created the group$/);
          const joinedMatch = preview.match(/^(.+) joined the group$/);
          if (createdMatch) displayPreview = t("chat.createdTheGroup", { name: createdMatch[1] });
          else if (joinedMatch) displayPreview = t("chat.joinedTheGroup", { name: joinedMatch[1] });
        }
      }
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
            {group.avatar_file_id ? (
              <Avatar.Image
                size={52}
                source={{ uri: buildGroupAvatarUrl(group.avatar_file_id).toString() }}
              />
            ) : (
              <Avatar.Icon
                size={52}
                icon="account-group"
                style={{ backgroundColor: theme.colors.tertiaryContainer }}
              />
            )}
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
                {lastMsg?.message_type !== "system" && (lastMsg?.sender_id === caregiverProfileId
                  ? t("common.you")
                  : `${lastMsg?.sender_name}: `)}
                {lastMsg?.message_type === "voice"
                  ? t("common.voiceMessage")
                  : displayPreview}
              </Text>
            ) : (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("emergency.tapToChat")}
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
            size={52}
            role={contact.role}
          />
          <View
            style={[
              styles.statusDot,
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
                {lastMsg?.sender_id === caregiverProfileId
                  ? t("common.you")
                  : ""}
                {lastMsg?.message_type === "voice"
                  ? t("common.voiceMessage")
                  : preview}
              </Text>
            </View>
          ) : (
            <View style={styles.contactSubInfo}>
              <View style={styles.roleChip}>
                <MaterialCommunityIcons
                  name={
                    contact.role === "elderly"
                      ? "account-heart"
                      : "shield-account"
                  }
                  size={14}
                  color={theme.colors.primary}
                />
                <Text
                  variant="bodySmall"
                  style={[
                    styles.roleText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {contact.role === "elderly"
                    ? t("common.elderly")
                    : t("common.caregiver")}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("emergency.tapToChat")}
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
              size={20}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPendingRequests = () => {
    if (pendingRequests.length === 0 && pendingGroupInvites.length === 0)
      return null;

    return (
      <View style={{ marginBottom: 16 }}>
        {pendingRequests.length > 0 && (
          <>
            <Text
              variant="titleSmall"
              style={{
                marginLeft: 16,
                marginBottom: 8,
                color: theme.colors.onSurfaceVariant,
              }}
            >
              {t("emergency.pendingRequests")}
            </Text>
            {pendingRequests.map((req) => (
              <View
                key={req.connectionId}
                style={[
                  styles.contactItem,
                  { backgroundColor: theme.colors.surface, marginBottom: 1 },
                ]}
              >
                <View style={styles.avatarContainer}>
                  <Avatar.Text
                    size={52}
                    label={req.from.avatarLabel}
                    style={{ backgroundColor: theme.colors.tertiaryContainer }}
                    labelStyle={{
                      color: theme.colors.onTertiaryContainer,
                      fontWeight: "600",
                    }}
                  />
                </View>
                <View
                  style={[
                    styles.contactInfo,
                    { flexDirection: "row", alignItems: "center" },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="titleMedium"
                      style={[
                        styles.contactName,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {req.from.name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {t("emergency.wantsToConnect")}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button
                      mode="contained"
                      compact
                      onPress={() =>
                        handleAcceptRequest(req.connectionId, req.from.name)
                      }
                    >
                      {t("emergency.accept")}
                    </Button>
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => handleRejectRequest(req.connectionId)}
                    >
                      {t("emergency.reject")}
                    </Button>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Pending Group Invitations */}
        {pendingGroupInvites.length > 0 && (
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
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color="#fff"
                    />
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
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons
        name="account-group-outline"
        size={80}
        color={theme.colors.outlineVariant}
      />
      <Text
        variant="headlineSmall"
        style={[styles.emptyTitle, { color: theme.colors.onSurface }]}
      >
        {t("messages.noContactsYet")}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        {t("messages.contactsAppearHere")}
      </Text>
    </View>
  );

  const onTabPress = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.scrollToIndex({ index, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
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
            placeholder={t("messages.searchContacts")}
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

      {/* Chat List */}
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
            {t("messages.loadingContacts")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatList}
          renderItem={renderChatListItem}
          keyExtractor={(item) => chatListItemId(item)}
          ListHeaderComponent={renderPendingRequests}
          contentContainerStyle={[
            styles.listContent,
            chatList.length === 0 &&
              pendingRequests.length === 0 &&
              pendingGroupInvites.length === 0 &&
              styles.emptyList,
          ]}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                marginLeft: 82,
                backgroundColor: theme.colors.outlineVariant ?? "#E0E0E0",
              }}
            />
          )}
          ListEmptyComponent={
            pendingRequests.length === 0 && pendingGroupInvites.length === 0
              ? renderEmptyState
              : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          extraData={[
            lastMessages,
            groupLastMessages,
            pendingRequests,
            pendingGroupInvites,
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
        {[t("emergency.chats"), t("emergency.moments")].map((tab, index) => {
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
        onScroll={onScroll}
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
                {/* Header */}
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

                {/* Phone input + Search button */}
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

                {/* Search result */}
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
                      size={44}
                      label={(foundUser.data.name ?? "??")
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
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                          }}
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
                      Add
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
        myProfileId={caregiverProfileId!}
        myName={caregiverName}
        myRole="caregiver"
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchBar: {
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 44,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
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
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  statusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
  },
  contactInfo: {
    flex: 1,
    marginRight: 8,
  },
  contactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  contactName: {
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
  },
  previewText: {
    marginTop: 2,
    fontSize: 13,
  },
  contactSubInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roleText: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    marginTop: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  // ── Add Friend Modal ──
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
