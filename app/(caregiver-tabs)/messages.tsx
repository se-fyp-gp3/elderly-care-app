import { useAuth } from "@/lib/auth-context";
import {
  Contact,
  formatRelativeTime,
  getContactsForCaregiver,
} from "@/lib/contacts";
import { getCaregiverByUserId } from "@/lib/caregiver";
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

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) {
        setContacts([]);
        return;
      }
      setCaregiverProfileId(caregiver.$id);
      const data = await getContactsForCaregiver(caregiver.$id);
      setContacts(data);
      setFilteredContacts(data);

      const lastMsgs: Record<string, DirectMessage | null> = {};
      await Promise.all(
        data.map(async (contact) => {
          const convId = buildConversationId(caregiver.$id, contact.id);
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

  const getStatusColor = (status?: string | null) => {
    switch (status) {
      case "Normal":
        return "#4CAF50";
      case "Warning":
        return "#FF9800";
      case "Danger":
        return "#F44336";
      default:
        return theme.colors.outline;
    }
  };

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
            size={52}
            label={item.avatarLabel}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{
              color: theme.colors.onPrimaryContainer,
              fontWeight: "600",
            }}
          />
          {item.status && (
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: getStatusColor(item.status),
                  borderColor: theme.colors.surface,
                },
              ]}
            />
          )}
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
              {lastMsg?.sender_id === caregiverProfileId ? "You: " : ""}
              {preview}
            </Text>
          ) : (
            <View style={styles.contactSubInfo}>
              <View style={styles.roleChip}>
                <MaterialCommunityIcons
                  name="account-heart"
                  size={14}
                  color={theme.colors.primary}
                />
                <Text
                  variant="bodySmall"
                  style={[styles.roleText, { color: theme.colors.onSurfaceVariant }]}
                >
                  Elderly
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
        Your linked elderly will appear here.{"\n"}Add elderly from the Care Panel
        to get started.
      </Text>
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
          <View style={styles.headerBadge}>
            <Badge size={22} style={{ backgroundColor: theme.colors.primary }}>
              {contacts.length}
            </Badge>
          </View>
        </View>
        <Searchbar
          placeholder="Search contacts..."
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
            Loading contacts...
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
          ItemSeparatorComponent={() => (
            <Divider style={[styles.divider, { marginLeft: 82 }]} />
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
  divider: {
    height: 0.5,
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
});
