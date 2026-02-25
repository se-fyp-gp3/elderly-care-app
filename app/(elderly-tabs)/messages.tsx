import { useAuth } from "@/lib/auth-context";
import {
  Contact,
  formatRelativeTime,
  getContactsForElderly,
} from "@/lib/contacts";
import { getElderlyByUserId } from "@/lib/elderly";
import { buildConversationId, getLastMessage } from "@/lib/messaging";
import { DirectMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Badge,
  Divider,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";

export default function ElderlyMessages() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [elderlyProfileId, setElderlyProfileId] = useState<string | null>(null);
  const [lastMessages, setLastMessages] = useState<
    Record<string, DirectMessage | null>
  >({});

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

      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(elderly.$id, contact.id);
          lastMsgs[contact.id] = await getLastMessage(convId);
        }),
      );
      setLastMessages(lastMsgs);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const navigateToConversation = useCallback(
    (contact: Contact) => {
      router.push({
        pathname: "/conversation" as any,
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
    if (!phone) {
      return Alert.alert(
        "No phone number",
        "This contact has no phone number on file.",
      );
    }
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Cannot make a call from this device");
    });
  }, []);

  const renderContactItem = ({ item }: { item: Contact }) => {
    const lastMsg = lastMessages[item.id];
    const lastMsgTime = lastMsg?.created_at || item.lastActive;
    const preview = lastMsg?.body;

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
              { backgroundColor: "#4CAF50", borderColor: theme.colors.surface },
            ]}
          />
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.contactHeader}>
            <Text
              variant="titleMedium"
              style={[styles.contactName, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}
            >
              {formatRelativeTime(lastMsgTime)}
            </Text>
          </View>

          {preview ? (
            <Text
              variant="bodySmall"
              style={[styles.previewText, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {lastMsg?.sender_id === elderlyProfileId ? "You: " : ""}
              {preview}
            </Text>
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
                  Caregiver
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
        No Caregivers Yet
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        Your assigned caregivers will appear here.{"\n"}Ask your caregiver to add
        you to their care list.
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
          My Caregivers
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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}> 
        <View style={styles.headerTop}>
          <Text
            variant="headlineSmall"
            style={[styles.headerTitle, { color: theme.colors.onSurface }]}
          >
            Messages
          </Text>
          <View style={styles.headerActions}>
            <Badge size={22} style={{ backgroundColor: theme.colors.primary }}>
              {contacts.length}
            </Badge>
          </View>
        </View>
        <Searchbar
          placeholder="Search caregivers..."
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            variant="bodyMedium"
            style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}
          >
            Loading caregivers...
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
          ListHeaderComponent={filteredContacts.length > 0 ? renderHeader : null}
          ItemSeparatorComponent={() => (
            <Divider style={[styles.divider, { marginLeft: 86 }]} />
          )}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
