import {
  CAREGIVER_TABLE_ID,
  clientReactNative,
  DATABASE_ID,
  DIRECT_MESSAGES_TABLE_ID,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
  Contact,
  formatRelativeTime,
  getContactsForElderly,
} from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { buildConversationId, getLastMessage } from "@/lib/messaging";
import { formatPresence, isUserOnline } from "@/lib/presence";
import { DirectMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Searchbar,
  Text,
  useTheme
} from "react-native-paper";

import MomentsView from "@/components/MomentsView";

export default function ElderlyMessages() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [elderlyProfileId, setElderlyProfileId] = useState<string | null>(null);
  const [lastMessages, setLastMessages] = useState<
    Record<string, DirectMessage | null>
  >({});

  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = React.useRef<FlatList<number>>(null);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      const elderly = await getElderlyByUserId(user.$id);
      if (!elderly) {
        setContacts([]);
        return;
      }
      setElderlyProfileId(elderly.$id);
      const data = await getContactsForElderly(elderly.$id);
      setContacts(data);
      setFilteredContacts(data);

      // Fetch last messages for each contact
      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(elderly.$id, contact.id);
          lastMsgs[contact.id] = await getLastMessage(convId);
        }),
      );
      setLastMessages(lastMsgs);

      // Sort contacts by latest message time
      data.sort((a, b) => {
        const msgA = lastMsgs[a.id];
        const msgB = lastMsgs[b.id];
        const timeA = msgA?.created_at ?? a.lastActive ?? "";
        const timeB = msgB?.created_at ?? b.lastActive ?? "";
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

  const navigateToConversation = useCallback(
    (contact: Contact) => {
      router.push({
        pathname: "/conversation",
        params: {
          contactId: contact.id,
          contactName: contact.name,
          contactRole: contact.role,
        },
      });
    },
    [router],
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (!elderlyProfileId) return;

    // Subscribe to Direct Messages table for realtime updates
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = clientReactNative.subscribe(channel, (response) => {
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

          // The sender is clearly online — update their lastActive
          const now = new Date().toISOString();

          // Reorder contacts: move the contact to top & refresh lastActive
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
    });

    return () => {
      unsubscribe();
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

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredContacts(contacts);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredContacts(
        contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            (c.phone && c.phone.includes(query)),
        ),
      );
    }
  }, [searchQuery, contacts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  }, [fetchContacts]);

  const handleCall = useCallback((phone?: string | null) => {
    if (!phone)
      return Alert.alert(
        t('common.noPhoneNumber'),
        t('emergency.noPhoneOnFile'),
      );
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert(t('common.cannotCall'));
    });
  }, [t]);

  const handleSMS = useCallback((phone?: string | null) => {
    if (!phone)
      return Alert.alert(
        t('common.noPhoneNumber'),
        t('emergency.noPhoneOnFile'),
      );
    const url = `sms:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert(t('common.cannotSMS'));
    });
  }, [t]);

  const renderContactItem = ({ item }: { item: Contact }) => {
    const lastMsg = lastMessages[item.id];
    const lastMsgTime = lastMsg?.created_at || item.lastActive;
    const preview = lastMsg?.body;
    const online = isUserOnline(item.lastActive);
    const lastSeenText = formatPresence(item.lastActive, t);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigateToConversation(item)}
        style={[styles.contactItem, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.avatarContainer}>
          <Avatar.Text
            size={56}
            label={item.avatarLabel}
            style={{ backgroundColor: theme.colors.tertiaryContainer }}
            labelStyle={{
              color: theme.colors.onTertiaryContainer,
              fontWeight: "600",
              fontSize: 20,
            }}
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
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.contactHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                variant="titleMedium"
                style={[styles.contactName, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {lastSeenText ? (
                <Text
                  variant="bodySmall"
                  style={{
                    color: online ? "#4CAF50" : theme.colors.onSurfaceVariant,
                    fontSize: 12,
                    marginTop: 1,
                  }}
                >
                  {lastSeenText}
                </Text>
              ) : null}
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
              {lastMsg?.sender_id === elderlyProfileId && (
                <MaterialCommunityIcons
                  name={lastMsg?.is_read ? "check-all" : "check"}
                  size={14}
                  color={lastMsg?.is_read ? "#4CAF50" : theme.colors.onSurfaceVariant}
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
                {lastMsg?.sender_id === elderlyProfileId ? t('common.you') : ""}
                {lastMsg?.message_type === "voice" ? t('common.voiceMessage') : preview}
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
                  {t('common.caregiver')}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t('messages.tapToChat')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleCall(item.phone);
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
        {t('messages.noCaregiversYet')}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        {t('messages.caregiverAppearHere')}
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
          {t('messages.myCaregivers')}
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
            {filteredContacts.length}
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
        <Searchbar
          placeholder={t('messages.searchCaregivers')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[
            styles.searchBar,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
          inputStyle={styles.searchInput}
          elevation={0}
        />
      </View>

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
            {t('messages.loadingCaregivers')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderContactItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            filteredContacts.length === 0 && styles.emptyList,
          ]}
          ListHeaderComponent={
            filteredContacts.length > 0 ? renderHeader : null
          }
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
          extraData={lastMessages}
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
                {tab}
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
});
