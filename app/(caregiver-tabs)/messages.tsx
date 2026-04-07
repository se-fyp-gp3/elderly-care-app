import {
  DATABASE_ID,
  DIRECT_MESSAGES_TABLE_ID,
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
import { buildConversationId, getLastMessage } from "@/lib/messaging";
import { Caregiver, Elderly } from "@/types/appwrite";
import { DirectMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
  Button,
  Searchbar,
  Text,
  TextInput,
  useTheme
} from "react-native-paper";

import MomentsView from "@/components/MomentsView";

export default function CaregiverMessages() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [caregiverProfileId, setCaregiverProfileId] = useState<string | null>(
    null,
  );
  const [lastMessages, setLastMessages] = useState<
    Record<string, DirectMessage | null>
  >({});

  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = React.useRef<FlatList<number>>(null);

  // ── Add friend dialog state ──
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<
    { role: "elderly"; data: Elderly } | { role: "caregiver"; data: Caregiver } | null
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
      
      const [data, requests] = await Promise.all([
        getContactsForCaregiver(caregiver.$id),
        getPendingCaregiverConnections(caregiver.$id),
      ]);
      setPendingRequests(requests);

      // Fetch last messages for each contact
      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(caregiver.$id, contact.id);
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
      Alert.alert("Connected", `You are now connected with ${name}`);
      fetchContacts();
    } catch (error) {
      Alert.alert("Error", "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    try {
      await rejectCaregiverConnection(connectionId);
      Alert.alert("Rejected", "Friend request rejected.");
      fetchContacts();
    } catch (error) {
      Alert.alert("Error", "Failed to reject request.");
    }
  };

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
    if (!caregiverProfileId) return;

    // Subscribe to Direct Messages table
    const channel = `databases.${DATABASE_ID}.collections.${DIRECT_MESSAGES_TABLE_ID}.documents`;
    const unsubscribe = safeSubscribe(channel, (response) => {
      // Check if it's a create event
      if (
        response.events.some((event) => event.endsWith(".create"))
      ) {
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

          // Reorder contacts: move the contact to top
          setContacts((prevContacts) => {
            const index = prevContacts.findIndex((c) => c.id === otherUserId);
            if (index === -1) {
              // Optional: if new contact started chatting, we might need to fetch them
              // For now, simpler handling:
              return prevContacts;
            }

            const updatedContact = prevContacts[index];
            const newContacts = [...prevContacts];
            // Remove from old position
            newContacts.splice(index, 1);
            // Add to top
            newContacts.unshift(updatedContact);
            return newContacts;
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [caregiverProfileId]);

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
        "No phone number",
        "This contact has no phone number on file.",
      );
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Cannot make a call from this device");
    });
  }, []);

  const handleSMS = useCallback((phone?: string | null) => {
    if (!phone)
      return Alert.alert(
        "No phone number",
        "This contact has no phone number on file.",
      );
    const url = `sms:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Cannot send SMS from this device");
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
      Alert.alert("Error", "Failed to search. Please try again.");
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
          "Already added",
          `${foundUser.data.name ?? "This user"} is already in your contacts.`,
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
          "Invitation Sent",
          `An invitation has been sent to ${foundUser.data.name ?? "User"}. You can chat once they accept.`,
        );
        closeAddDialog();
        await fetchContacts();
      } else {
        Alert.alert(
          "Already added",
          `${foundUser.data.name ?? "This user"} is already in your contacts or has a pending request.`,
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to add contact. Please try again.");
    } finally {
      setAddingContact(false);
    }
  }, [foundUser, caregiverProfileId, contacts, closeAddDialog, fetchContacts]);

  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const isOnline = (lastActive?: string): boolean => {
    if (!lastActive) return false;
    try {
      return Date.now() - new Date(lastActive).getTime() < ONLINE_THRESHOLD_MS;
    } catch {
      return false;
    }
  };

  const formatLastSeen = (lastActive?: string): string => {
    if (!lastActive) return "";
    if (isOnline(lastActive)) return "Online";
    return `Last seen ${formatRelativeTime(lastActive)}`;
  };

  const renderContactItem = ({ item }: { item: Contact }) => {
    const lastMsg = lastMessages[item.id];
    const lastMsgTime = lastMsg?.created_at || item.lastActive;
    const preview = lastMsg?.body;
    const online = isOnline(item.lastActive);
    const lastSeenText = formatLastSeen(item.lastActive);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigateToConversation(item)}
        style={[styles.contactItem, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.avatarContainer}>
          <Avatar.Text
            size={52}
            label={item.avatarLabel}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{
              color: theme.colors.onPrimaryContainer,
              fontWeight: "600",
            }}
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
              {lastMsg?.sender_id === caregiverProfileId && (
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
                {lastMsg?.sender_id === caregiverProfileId ? "You: " : ""}
                {lastMsg?.message_type === "voice" ? "\ud83c\udfa4 Voice message" : preview}
              </Text>
            </View>
          ) : (
            <View style={styles.contactSubInfo}>
              <View style={styles.roleChip}>
                <MaterialCommunityIcons
                  name={item.role === "elderly" ? "account-heart" : "shield-account"}
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
                  {item.role === "elderly" ? "Elderly" : "Caregiver"}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Tap to start chatting
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
              size={20}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPendingRequests = () => {
    if (pendingRequests.length === 0) return null;

    return (
      <View style={{ marginBottom: 16 }}>
        <Text
          variant="titleSmall"
          style={{
            marginLeft: 16,
            marginBottom: 8,
            color: theme.colors.onSurfaceVariant,
          }}
        >
          Pending Requests
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
            <View style={[styles.contactInfo, { flexDirection: "row", alignItems: "center" }]}>
              <View style={{ flex: 1 }}>
                <Text
                  variant="titleMedium"
                  style={[styles.contactName, { color: theme.colors.onSurface }]}
                >
                  {req.from.name}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  Wants to connect
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  mode="contained"
                  compact
                  onPress={() => handleAcceptRequest(req.connectionId, req.from.name)}
                >
                  Accept
                </Button>
                <Button
                  mode="outlined"
                  compact
                  onPress={() => handleRejectRequest(req.connectionId)}
                >
                  Reject
                </Button>
              </View>
            </View>
          </View>
        ))}
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
        No Contacts Yet
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        Your linked elderly will appear here.{"\n"}Tap the + button to add
        friends by phone number.
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
            placeholder="Search contacts..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={[
              styles.searchBar,
              { backgroundColor: theme.colors.surfaceVariant, flex: 1 },
            ]}
            inputStyle={styles.searchInput}
            elevation={0}
          />
          <TouchableOpacity
            onPress={openAddDialog}
            style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="account-plus"
              size={22}
              color={theme.colors.onPrimary}
            />
          </TouchableOpacity>
        </View>
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
            Loading contacts...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderContactItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderPendingRequests}
          contentContainerStyle={[
            styles.listContent,
            filteredContacts.length === 0 && pendingRequests.length === 0 && styles.emptyList,
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
          ListEmptyComponent={pendingRequests.length === 0 ? renderEmptyState : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          extraData={[lastMessages, pendingRequests]}
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
                 borderBottomColor: isActive ? theme.colors.primary : 'transparent' 
               }}
               onPress={() => onTabPress(index)}
               activeOpacity={0.7}
             >
               <Text 
                 variant="labelLarge"
                 style={{ 
                   color: isActive ? theme.colors.primary : theme.colors.onSurfaceVariant, 
                   fontWeight: isActive ? '700' : '500' 
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
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.toString()}
        style={{ flex: 1 }}
        getItemLayout={(data, index) => (
          {length: width, offset: width * index, index}
        )}
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
                    Add Friend
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
                  Search for a friend by their phone number
                </Text>

                {/* Phone input + Search button */}
                <View style={styles.phoneRow}>
                  <TextInput
                    mode="outlined"
                    label="Phone number"
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
                    Search
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
                      Searching...
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
                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: "600" }}
                      >
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
                      No user found with that number
                    </Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
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
