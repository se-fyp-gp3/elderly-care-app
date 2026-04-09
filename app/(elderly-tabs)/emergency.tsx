import CreateGroupModal from "@/components/CreateGroupModal";
import UserAvatar from "@/components/UserAvatar";
import {
  clientReactNative,
  DATABASE_ID,
  DIRECT_MESSAGES_TABLE_ID,
  GROUP_MEMBERS_TABLE_ID,
  GROUP_MESSAGES_TABLE_ID,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
  acceptElderlyConnection,
  addElderlyConnection,
  Contact,
  formatRelativeTime,
  getContactsForElderly,
  getElderlyContacts,
  getPendingConnectionRequests,
  rejectElderlyConnection,
  searchElderlyByPhone,
} from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { getGroupUnreadCount, getLastGroupMessage } from "@/lib/group-messaging";
import { acceptGroupInvitation, getGroupsForUser, getPendingGroupInvitations, rejectGroupInvitation } from "@/lib/groups";
import { buildConversationId, getLastMessage, getUnreadCountPerConversation } from "@/lib/messaging";
import { isUserOnline } from "@/lib/presence";
import { Elderly } from "@/types/appwrite";
import { DirectMessage, Group, GroupMember, GroupMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  | { type: "direct"; contact: Contact; lastMsg: DirectMessage | null; unread: number }
  | { type: "group"; group: Group; lastMsg: GroupMessage | null; unread: number };

function chatListItemId(item: ChatListItem): string {
  return item.type === "direct" ? item.contact.id : `group_${item.group.$id}`;
}

function chatListItemTime(item: ChatListItem): string {
  if (item.type === "direct") {
    return item.lastMsg?.created_at ?? item.contact.lastActive ?? "";
  }
  return item.lastMsg?.created_at ?? item.group.created_at ?? "";
}

export default function ElderlyEmergency() {
  const theme = useTheme();
  const { user, preferences, updatePreferences } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // ── Elderly profile ──
  const [elderlyProfile, setElderlyProfile] = useState<Elderly | null>(null);

  // ── Contacts & messages state ──
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastMessages, setLastMessages] = useState<
    Record<string, DirectMessage | null>
  >({});

  // ── Group state ──
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupLastMessages, setGroupLastMessages] = useState<Record<string, GroupMessage | null>>({});
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [groupUnreadCounts, setGroupUnreadCounts] = useState<Record<string, number>>({});
  const pinnedConversations: string[] = (preferences.pinnedConversations as string[]) ?? [];

  // ── Menu & Group creation ──
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [longPressItem, setLongPressItem] = useState<ChatListItem | null>(null);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);

  // ── Pending group invitations ──
  const [pendingGroupInvites, setPendingGroupInvites] = useState<
    { membership: GroupMember; group: Group }[]
  >([]);
  const [acceptingGroupId, setAcceptingGroupId] = useState<string | null>(null);

  // ── Add contact dialog state ──
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundElderly, setFoundElderly] = useState<Elderly | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // ── Pending requests state ──
  const [pendingRequests, setPendingRequests] = useState<
    { connectionId: string; from: Elderly }[]
  >([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = React.useRef<FlatList<number>>(null);

  // ── Fetch contacts & last messages ──
  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      const elderly = await getElderlyByUserId(user.$id);
      if (!elderly) {
        setContacts([]);
        return;
      }
      setElderlyProfile(elderly);

      // Get both caregiver contacts, elderly-to-elderly contacts, groups, and DM unread counts
      const [caregiverData, elderlyData, pending, userGroups, dmUnreadMap, groupInvites] = await Promise.all([
        getContactsForElderly(elderly.$id),
        getElderlyContacts(elderly.$id),
        getPendingConnectionRequests(elderly.$id),
        getGroupsForUser(elderly.$id),
        getUnreadCountPerConversation(elderly.$id),
        getPendingGroupInvitations(elderly.$id),
      ]);
      setPendingGroupInvites(groupInvites);
      setPendingRequests(pending);
      setUnreadCounts(dmUnreadMap);
      setGroups(userGroups);
      const data = [...caregiverData, ...elderlyData];

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

      // Sort by most recent message first
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

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ── Realtime message subscription ──
  useEffect(() => {
    if (!elderlyProfile) return;

    // Subscribe to Direct Messages
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = clientReactNative.subscribe(channel, (response) => {
      if (response.events.some((event) => event.endsWith(".create"))) {
        const payload = response.payload as DirectMessage;
        if (
          payload.sender_id === elderlyProfile.$id ||
          payload.receiver_id === elderlyProfile.$id
        ) {
          const otherUserId =
            payload.sender_id === elderlyProfile.$id
              ? payload.receiver_id
              : payload.sender_id;
          setLastMessages((prev) => ({ ...prev, [otherUserId]: payload }));

          // Increment unread count if I am receiver
          if (payload.receiver_id === elderlyProfile.$id) {
            setUnreadCounts((prev) => {
              const n = new Map(prev);
              const convId = payload.conversation_id;
              n.set(convId, (n.get(convId) ?? 0) + 1);
              return n;
            });
          }

          // Only mark the other user as online if THEY sent the message
          if (payload.sender_id !== elderlyProfile.$id) {
            const now = new Date().toISOString();
            setContacts((prev) => {
              const idx = prev.findIndex((c) => c.id === otherUserId);
              if (idx === -1) return prev;
              const updated = [...prev];
              const [moved] = updated.splice(idx, 1);
              updated.unshift({ ...moved, lastActive: now });
              return updated;
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
      setGroupLastMessages((prev) => ({ ...prev, [payload.group_id]: payload }));
      if (payload.sender_id !== elderlyProfile.$id) {
        setGroupUnreadCounts((prev) => ({ ...prev, [payload.group_id]: (prev[payload.group_id] ?? 0) + 1 }));
      }
    });

    // Subscribe to group_members for realtime group discovery
    const groupMembersChannel = `databases.${DATABASE_ID}.collections.${GROUP_MEMBERS_TABLE_ID}.documents`;
    const unsubMembers = clientReactNative.subscribe(groupMembersChannel, (response) => {
      if (!response.events.some((e) => e.endsWith(".create"))) return;
      const payload = response.payload as { user_profile_id?: string };
      if (payload?.user_profile_id === elderlyProfile.$id) {
        fetchContacts();
      }
    });

    return () => {
      unsubscribe();
      unsubGroup();
      unsubMembers();
    };
  }, [elderlyProfile]);

  // ── Build unified chat list (DMs + groups, with search & pin) ──
  const chatList: ChatListItem[] = useMemo(() => {
    const items: ChatListItem[] = [];
    const query = searchQuery.toLowerCase();

    contacts.forEach((c) => {
      if (query && !c.name.toLowerCase().includes(query) && !(c.phone && c.phone.includes(query))) return;
      const convId = buildConversationId(elderlyProfile?.$id ?? "", c.id);
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
  }, [contacts, groups, lastMessages, groupLastMessages, unreadCounts, groupUnreadCounts, pinnedConversations, searchQuery, elderlyProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  // ── Navigation & actions ──
  const navigateToConversation = useCallback(
    (contact: Contact) => {
      const convId = buildConversationId(elderlyProfile?.$id ?? "", contact.id);
      setUnreadCounts((prev) => { const n = new Map(prev); n.delete(convId); return n; });
      router.push({
        pathname: "/conversation",
        params: {
          contactId: contact.id,
          contactName: contact.name,
          contactRole: contact.role,
        },
      });
    },
    [router, elderlyProfile],
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

  const handleCall = useCallback((phone?: string | null) => {
    if (!phone)
      return Alert.alert(t('common.noPhoneNumber'), t('emergency.noPhoneOnFile'));
    Linking.openURL(`tel:${phone}`);
  }, [t]);

  // ── Add contact dialog handlers ──
  const openAddDialog = useCallback(() => {
    setPhoneSearch("");
    setFoundElderly(null);
    setSearchDone(false);
    setAddDialogVisible(true);
  }, []);

  const closeAddDialog = useCallback(() => {
    setAddDialogVisible(false);
    setPhoneSearch("");
    setFoundElderly(null);
    setSearchDone(false);
  }, []);

  const handlePhoneSearch = useCallback(async () => {
    const trimmed = phoneSearch.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSearching(true);
    setFoundElderly(null);
    setSearchDone(false);
    try {
      const result = await searchElderlyByPhone(trimmed);
      // Don't show self in results
      if (result && result.$id === elderlyProfile?.$id) {
        setFoundElderly(null);
      } else {
        setFoundElderly(result);
      }
      setSearchDone(true);
    } catch (error) {
      Alert.alert(t('common.error'), t('emergency.failedToAdd'));
    } finally {
      setSearching(false);
    }
  }, [phoneSearch, elderlyProfile]);

  const handleAddContact = useCallback(async () => {
    if (!foundElderly || !elderlyProfile) return;
    setAddingContact(true);
    try {
      // Check if already in contacts
      const alreadyExists = contacts.some((c) => c.id === foundElderly.$id);
      if (alreadyExists) {
        Alert.alert(t('emergency.alreadyAdded'), t('emergency.alreadyInContacts', { name: foundElderly.name ?? t('common.unknown') }));
        setAddingContact(false);
        return;
      }

      const success = await addElderlyConnection(elderlyProfile.$id, foundElderly.$id);
      if (success) {
        Alert.alert(t('emergency.requestSent'), t('emergency.requestSentDesc', { name: foundElderly.name ?? t('common.unknown') }));
        closeAddDialog();
        await fetchContacts();
      } else {
        Alert.alert(t('emergency.alreadySent'), t('emergency.alreadySentDesc', { name: foundElderly.name ?? t('common.unknown') }));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('emergency.failedToAdd'));
    } finally {
      setAddingContact(false);
    }
  }, [foundElderly, elderlyProfile, contacts, closeAddDialog, fetchContacts]);

  // ── Accept / Reject connection request handlers ──
  const handleAcceptRequest = useCallback(async (connectionId: string, name: string) => {
    setAcceptingId(connectionId);
    try {
      await acceptElderlyConnection(connectionId);
      Alert.alert(t('emergency.accepted'), t('emergency.nowYourContact', { name }));
      await fetchContacts();
    } catch (e) {
      Alert.alert(t('common.error'), t('emergency.failedToAccept'));
    } finally {
      setAcceptingId(null);
    }
  }, [fetchContacts]);

  const handleRejectRequest = useCallback(async (connectionId: string, name: string) => {
    Alert.alert(t('emergency.declineRequest'), t('emergency.declineConfirm', { name }), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('emergency.decline'),
        style: "destructive",
        onPress: async () => {
          try {
            await rejectElderlyConnection(connectionId);
            setPendingRequests((prev) => prev.filter((r) => r.connectionId !== connectionId));
          } catch (e) {
            Alert.alert(t('common.error'), t('emergency.failedToDecline'));
          }
        },
      },
    ]);
  }, []);

  // ── Accept / Reject group invitation handlers ──
  const handleAcceptGroupInvite = useCallback(async (invite: { membership: GroupMember; group: Group }) => {
    if (!elderlyProfile) return;
    setAcceptingGroupId(invite.membership.$id);
    try {
      await acceptGroupInvitation(
        invite.membership.$id,
        invite.group.$id,
        elderlyProfile.name ?? "User",
        "elderly",
        elderlyProfile.$id,
      );
      Alert.alert(t('chat.acceptedGroupInvite'), invite.group.name);
      await fetchContacts();
    } catch (e) {
      Alert.alert(t('common.error'), t('chat.failedToAcceptInvite'));
    } finally {
      setAcceptingGroupId(null);
    }
  }, [elderlyProfile, fetchContacts, t]);

  const handleRejectGroupInvite = useCallback((invite: { membership: GroupMember; group: Group }) => {
    Alert.alert(t('chat.declineGroupInvite'), t('chat.declineGroupConfirm', { name: invite.group.name }), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('emergency.decline'),
        style: "destructive",
        onPress: async () => {
          try {
            await rejectGroupInvitation(invite.membership.$id);
            setPendingGroupInvites((prev) => prev.filter((i) => i.membership.$id !== invite.membership.$id));
          } catch (e) {
            Alert.alert(t('common.error'), t('chat.failedToDeclineInvite'));
          }
        },
      },
    ]);
  }, [t]);

  // ── Pager tab helpers ──
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

  // ── Render chat list item (DM or Group) ──
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
          style={[styles.conversationCard, { backgroundColor: isPinned ? theme.colors.surfaceVariant : theme.colors.surface }]}
        >
          <View style={styles.avatarWrap}>
            <Avatar.Icon size={52} icon="account-group" style={{ backgroundColor: theme.colors.tertiaryContainer }} />
            {item.unread > 0 && (
              <Badge size={18} style={styles.unreadBadge}>{item.unread}</Badge>
            )}
          </View>
          <View style={styles.conversationInfo}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                {isPinned && <MaterialCommunityIcons name="pin" size={14} color={theme.colors.primary} style={{ marginRight: 4 }} />}
                <Text variant="titleMedium" style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>
                  {group.name}
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatRelativeTime(time)}
              </Text>
            </View>
            {preview ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }} numberOfLines={1}>
                {lastMsg?.sender_id === elderlyProfile?.$id ? t('common.you') : `${lastMsg?.sender_name}: `}
                {lastMsg?.message_type === "voice" ? t('common.voiceMessage') : preview}
              </Text>
            ) : (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }}>
                {t('emergency.tapToChat')}
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
        style={[styles.conversationCard, { backgroundColor: isPinned ? theme.colors.surfaceVariant : theme.colors.surface }]}
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <UserAvatar avatarFileId={contact.avatarFileId} name={contact.name} size={52} role={contact.role} />
          <View style={[styles.onlineDot, { backgroundColor: online ? "#4CAF50" : "#BDBDBD", borderColor: theme.colors.surface }]} />
          {item.unread > 0 && (
            <Badge size={18} style={styles.unreadBadge}>{item.unread}</Badge>
          )}
        </View>

        {/* Name / preview */}
        <View style={styles.conversationInfo}>
          <View style={styles.nameRow}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
              {isPinned && <MaterialCommunityIcons name="pin" size={14} color={theme.colors.primary} style={{ marginRight: 4 }} />}
              <Text variant="titleMedium" style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>
                {contact.name}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatRelativeTime(lastMsgTime)}
            </Text>
          </View>
          <View style={styles.roleRow}>
            <MaterialCommunityIcons
              name={contact.role === "caregiver" ? "shield-account" : "account-heart"}
              size={12}
              color={theme.colors.tertiary}
            />
            <Text variant="labelSmall" style={{ color: theme.colors.tertiary, marginLeft: 3 }}>
              {contact.role === "caregiver" ? t('common.caregiver') : t('common.friend')}
            </Text>
          </View>
          {preview ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
              {lastMsg?.sender_id === elderlyProfile?.$id && (
                <MaterialCommunityIcons
                  name={lastMsg?.is_read ? "check-all" : "check"}
                  size={14}
                  color={lastMsg?.is_read ? "#4CAF50" : theme.colors.onSurfaceVariant}
                  style={{ marginRight: 3 }}
                />
              )}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }} numberOfLines={1}>
                {lastMsg?.sender_id === elderlyProfile?.$id ? t('common.you') : ""}
                {lastMsg?.message_type === "voice" ? t('common.voiceMessage') : preview}
              </Text>
            </View>
          ) : (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }}>
              {t('emergency.tapToChat')}
            </Text>
          )}
        </View>

        {/* Quick call button */}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); handleCall(contact.phone); }}
          style={[styles.callBtn, { backgroundColor: "#E8F5E9" }]}
        >
          <MaterialCommunityIcons name="phone" size={20} color="#2E7D32" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ── Empty state ──
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="chat-plus-outline" size={56} color={theme.colors.outlineVariant} />
      <Text variant="bodyLarge" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
        {t('emergency.noConversationsYet')}
      </Text>
      <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
        {t('emergency.contactsAppearHere')}
      </Text>
    </View>
  );

  // ── Page renderers ──
  const renderChatPage = () => (
    <View style={{ width, flex: 1 }}>
      {/* Search bar + Add menu */}
      <View style={styles.searchWrap}>
        <Searchbar
          placeholder={t('emergency.searchContacts')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.colors.surfaceVariant, flex: 1 }]}
          inputStyle={styles.searchInput}
          elevation={0}
        />
        <Menu
          visible={showAddMenu}
          onDismiss={() => setShowAddMenu(false)}
          anchor={
            <TouchableOpacity
              onPress={() => setShowAddMenu(true)}
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus" size={22} color={theme.colors.onPrimary} />
            </TouchableOpacity>
          }
        >
          <Menu.Item
            leadingIcon="account-plus"
            title={t('chat.addNewFriend')}
            onPress={() => { setShowAddMenu(false); openAddDialog(); }}
          />
          <Menu.Item
            leadingIcon="account-group"
            title={t('chat.createGroupChat')}
            onPress={() => { setShowAddMenu(false); setShowCreateGroup(true); }}
          />
        </Menu>
      </View>

      {/* Pending Friend Requests */}
      {pendingRequests.length > 0 && !loading && (
        <View style={styles.pendingSection}>
          <View style={styles.pendingHeader}>
            <MaterialCommunityIcons name="account-clock" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ marginLeft: 6, fontWeight: "700", color: theme.colors.primary }}>
              {t('emergency.friendRequests', { count: pendingRequests.length })}
            </Text>
          </View>
          {pendingRequests.map((req) => (
            <View
              key={req.connectionId}
              style={[styles.pendingCard, { backgroundColor: theme.colors.primaryContainer }]}
            >
              <Avatar.Text
                size={40}
                label={(req.from.name ?? "??").substring(0, 2).toUpperCase()}
                style={{ backgroundColor: theme.colors.tertiaryContainer }}
                labelStyle={{ color: theme.colors.onTertiaryContainer, fontWeight: "600" }}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="titleSmall" style={{ fontWeight: "600" }}>
                  {req.from.name ?? t('common.unknown')}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {req.from.phone ?? ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleAcceptRequest(req.connectionId, req.from.name ?? "User")}
                disabled={acceptingId === req.connectionId}
                style={[styles.acceptBtn, { backgroundColor: "#4CAF50" }]}
              >
                {acceptingId === req.connectionId ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="check" size={18} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRejectRequest(req.connectionId, req.from.name ?? "User")}
                style={[styles.rejectBtn, { backgroundColor: "#FFCDD2" }]}
              >
                <MaterialCommunityIcons name="close" size={18} color="#D32F2F" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Pending Group Invitations */}
      {pendingGroupInvites.length > 0 && !loading && (
        <View style={styles.pendingSection}>
          <View style={styles.pendingHeader}>
            <MaterialCommunityIcons name="account-group" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ marginLeft: 6, fontWeight: "700", color: theme.colors.primary }}>
              {t('chat.groupInvitations', { count: pendingGroupInvites.length })}
            </Text>
          </View>
          {pendingGroupInvites.map((invite) => (
            <View
              key={invite.membership.$id}
              style={[styles.pendingCard, { backgroundColor: theme.colors.primaryContainer }]}
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
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('chat.invitedYouToGroup')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleAcceptGroupInvite(invite)}
                disabled={acceptingGroupId === invite.membership.$id}
                style={[styles.acceptBtn, { backgroundColor: "#4CAF50" }]}
              >
                {acceptingGroupId === invite.membership.$id ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="check" size={18} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRejectGroupInvite(invite)}
                style={[styles.rejectBtn, { backgroundColor: "#FFCDD2" }]}
              >
                <MaterialCommunityIcons name="close" size={18} color="#D32F2F" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Conversations list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyMedium" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
            {t('common.loading')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatList}
          renderItem={renderChatListItem}
          keyExtractor={(item) => chatListItemId(item)}
          contentContainerStyle={[styles.listContent, chatList.length === 0 && styles.emptyList]}
          ListEmptyComponent={renderEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, marginLeft: 80, backgroundColor: theme.colors.outlineVariant ?? "#E0E0E0" }} />
          )}
          extraData={[lastMessages, groupLastMessages, unreadCounts, groupUnreadCounts, pinnedConversations]}
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Tab Bar */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, elevation: 1 }}>
        {['Chats', 'Moments'].map((tab, index) => {
          const isActive = activeTab === index;
          return (
            <TouchableOpacity
              key={tab}
              style={{
                flex: 1,
                paddingVertical: 14,
                alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: isActive ? theme.colors.primary : 'transparent',
              }}
              onPress={() => onTabPress(index)}
              activeOpacity={0.7}
            >
              <Text
                variant="labelLarge"
                style={{
                  color: isActive ? theme.colors.primary : theme.colors.onSurfaceVariant,
                  fontWeight: isActive ? '700' : '500',
                }}
              >
                {index === 0 ? t('emergency.chats') : t('emergency.moments')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        ref={pagerRef}
        data={[0, 1]}
        renderItem={({ item }) => item === 0 ? renderChatPage() : renderMomentsPage()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.toString()}
        style={{ flex: 1 }}
        getItemLayout={(data, index) => (
          { length: width, offset: width * index, index }
        )}
      />

      {/* ── Add Contact Modal ── */}
      <Modal
        visible={addDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddDialog}
      >
        <TouchableWithoutFeedback onPress={closeAddDialog}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                    {t('emergency.addContact')}
                  </Text>
                  <TouchableOpacity onPress={closeAddDialog}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
                  </TouchableOpacity>
                </View>

                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
                  {t('emergency.searchByPhone')}
                </Text>

                {/* Phone input + Search button */}
                <View style={styles.phoneRow}>
                  <TextInput
                    mode="outlined"
                    label={t('emergency.phoneNumber')}
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
                    {t('common.search')}
                  </Button>
                </View>

                {/* Search result */}
                {searching && (
                  <View style={styles.resultArea}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>
                      {t('emergency.searching')}
                    </Text>
                  </View>
                )}

                {searchDone && !searching && foundElderly && (
                  <View style={[styles.resultCard, { backgroundColor: theme.colors.secondaryContainer }]}>
                    <Avatar.Text
                      size={44}
                      label={(foundElderly.name ?? "??").substring(0, 2).toUpperCase()}
                      style={{ backgroundColor: theme.colors.tertiaryContainer }}
                      labelStyle={{ color: theme.colors.onTertiaryContainer, fontWeight: "600", fontSize: 16 }}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text variant="titleMedium" style={{ fontWeight: "600" }}>
                        {foundElderly.name ?? t('common.unknown')}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <MaterialCommunityIcons name="phone" size={13} color={theme.colors.onSecondaryContainer} />
                        <Text variant="bodySmall" style={{ marginLeft: 4, color: theme.colors.onSecondaryContainer }}>
                          {foundElderly.phone ?? "N/A"}
                        </Text>
                      </View>
                    </View>
                    <Button
                      mode="contained"
                      onPress={handleAddContact}
                      loading={addingContact}
                      disabled={addingContact}
                      compact
                    >
                      Add
                    </Button>
                  </View>
                )}

                {searchDone && !searching && !foundElderly && (
                  <View style={styles.resultArea}>
                    <MaterialCommunityIcons name="account-search" size={28} color={theme.colors.outlineVariant} />
                    <Text variant="bodyMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>
                      {t('emergency.noUserFound')}
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
        myProfileId={elderlyProfile?.$id ?? ""}
        myName={elderlyProfile?.name || user?.name || "Me"}
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
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface, padding: 16 }]}>
              {longPressItem && (() => {
                const itemId = chatListItemId(longPressItem);
                const isPinned = pinnedConversations.includes(itemId);
                return (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}
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
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                      {isPinned ? t('chat.unpinConversation') : t('chat.pinConversation')}
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
  // ── Search ──
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  searchBar: {
    borderRadius: 12,
    height: 42,
  },
  searchInput: {
    fontSize: 15,
    minHeight: 42,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  // ── Conversation card ──
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarWrap: {
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  // ── Shared ──
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  // ── Add Contact Modal ──
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
  // ── Pending requests ──
  pendingSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pendingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  acceptBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
});
