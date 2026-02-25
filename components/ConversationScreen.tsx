import {
    buildConversationId,
    fetchConversationMessages,
    markConversationAsRead,
    sendDirectMessage,
    subscribeToConversation,
} from "@/lib/messaging";
import { DirectMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Avatar,
    IconButton,
    Surface,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ConversationScreenProps {
  myProfileId: string;
  myName: string;
  myRole: "caregiver" | "elderly";
  contactId: string;
  contactName: string;
  contactRole: "caregiver" | "elderly";
}

export default function ConversationScreen({
  myProfileId,
  myName,
  myRole,
  contactId,
  contactName,
  contactRole,
}: ConversationScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const conversationId = buildConversationId(myProfileId, contactId);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchConversationMessages(conversationId, 100);
      setMessages(data);
      await markConversationAsRead(conversationId, myProfileId);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, myProfileId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversationId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.$id === newMsg.$id)) return prev;
        return [...prev, newMsg];
      });

      if (newMsg.receiver_id === myProfileId) {
        markConversationAsRead(conversationId, myProfileId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, myProfileId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    Keyboard.dismiss();

    try {
      const newMsg = await sendDirectMessage({
        conversationId,
        senderId: myProfileId,
        senderName: myName,
        senderRole: myRole,
        receiverId: contactId,
        body: text,
      });

      setMessages((prev) => {
        if (prev.some((m) => m.$id === newMsg.$id)) return prev;
        return [...prev, newMsg];
      });
      setInputText("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatDateSeparator = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

      return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].created_at).toDateString();
    const previous = new Date(messages[index - 1].created_at).toDateString();
    return current !== previous;
  };

  const renderMessage = ({ item, index }: { item: DirectMessage; index: number }) => {
    const isMe = item.sender_id === myProfileId;
    const showDate = shouldShowDateSeparator(index);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <View
              style={[
                styles.dateLine,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
            <Text
              variant="labelSmall"
              style={[
                styles.dateText,
                {
                  color: theme.colors.onSurfaceVariant,
                  backgroundColor: theme.colors.background,
                },
              ]}
            >
              {formatDateSeparator(item.created_at)}
            </Text>
            <View
              style={[
                styles.dateLine,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>
        )}
        <View
          style={[
            styles.messageRow,
            isMe ? styles.messageRowRight : styles.messageRowLeft,
          ]}
        >
          {!isMe && (
            <Avatar.Text
              size={32}
              label={contactName.substring(0, 2).toUpperCase()}
              style={[
                styles.messageAvatar,
                {
                  backgroundColor:
                    contactRole === "caregiver"
                      ? theme.colors.tertiaryContainer
                      : theme.colors.primaryContainer,
                },
              ]}
              labelStyle={{
                fontSize: 12,
                color:
                  contactRole === "caregiver"
                    ? theme.colors.onTertiaryContainer
                    : theme.colors.onPrimaryContainer,
              }}
            />
          )}
          <View
            style={[
              styles.messageBubble,
              isMe
                ? [styles.myBubble, { backgroundColor: theme.colors.primary }]
                : [
                    styles.theirBubble,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ],
            ]}
          >
            <Text
              style={[
                styles.messageText,
                {
                  color: isMe ? theme.colors.onPrimary : theme.colors.onSurface,
                },
              ]}
            >
              {item.body}
            </Text>
            <View style={styles.messageFooter}>
              <Text
                style={[
                  styles.messageTime,
                  {
                    color: isMe
                      ? theme.colors.onPrimary
                      : theme.colors.onSurfaceVariant,
                    opacity: 0.7,
                  },
                ]}
              >
                {formatMessageTime(item.created_at)}
              </Text>
              {isMe && (
                <MaterialCommunityIcons
                  name={item.is_read ? "check-all" : "check"}
                  size={14}
                  color={item.is_read ? "#64DD17" : theme.colors.onPrimary}
                  style={{ marginLeft: 4, opacity: 0.8 }}
                />
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyChat = () => (
    <View style={styles.emptyContainer}>
      <View
        style={[
          styles.emptyIconCircle,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
      >
        <MaterialCommunityIcons
          name="message-text-outline"
          size={48}
          color={theme.colors.outlineVariant}
        />
      </View>
      <Text
        variant="titleMedium"
        style={[styles.emptyTitle, { color: theme.colors.onSurface }]}
      >
        Start a Conversation
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        Send a message to {contactName}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Surface
        elevation={1}
        style={[
          styles.chatHeader,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
            paddingTop: Math.max(insets.top, 8),
          },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => router.back()}
          style={styles.backButton}
        />
        <Avatar.Text
          size={40}
          label={contactName.substring(0, 2).toUpperCase()}
          style={{
            backgroundColor:
              contactRole === "caregiver"
                ? theme.colors.tertiaryContainer
                : theme.colors.primaryContainer,
          }}
          labelStyle={{
            color:
              contactRole === "caregiver"
                ? theme.colors.onTertiaryContainer
                : theme.colors.onPrimaryContainer,
            fontWeight: "600",
          }}
        />
        <View style={styles.chatHeaderInfo}>
          <Text
            variant="titleMedium"
            style={[styles.chatHeaderName, { color: theme.colors.onSurface }]}
          >
            {contactName}
          </Text>
          <View style={styles.chatHeaderRole}>
            <MaterialCommunityIcons
              name={contactRole === "caregiver" ? "shield-account" : "account-heart"}
              size={14}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {contactRole === "caregiver" ? "Caregiver" : "Elderly"}
            </Text>
          </View>
        </View>
      </Surface>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.$id}
          contentContainerStyle={[
            styles.messagesList,
            messages.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={renderEmptyChat}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />
      )}

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          style={styles.textInput}
          outlineStyle={styles.textInputOutline}
          contentStyle={styles.textInputContent}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <IconButton
          icon="send"
          mode="contained"
          containerColor={theme.colors.primary}
          iconColor={theme.colors.onPrimary}
          size={22}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 0.5,
  },
  backButton: {
    margin: 0,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderName: {
    fontWeight: "600",
  },
  chatHeaderRole: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 12,
  },
  emptyList: {
    flexGrow: 1,
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  dateLine: {
    flex: 1,
    height: 0.5,
  },
  dateText: {
    paddingHorizontal: 12,
    fontSize: 12,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-end",
  },
  messageRowLeft: {
    justifyContent: "flex-start",
    marginRight: 50,
  },
  messageRowRight: {
    justifyContent: "flex-end",
    marginLeft: 50,
  },
  messageAvatar: {
    marginRight: 8,
    marginBottom: 2,
  },
  messageBubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 16,
    fontWeight: "600",
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: "center",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    gap: 6,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    fontSize: 15,
  },
  textInputOutline: {
    borderRadius: 24,
  },
  textInputContent: {
    paddingVertical: 8,
  },
  sendButton: {
    marginBottom: 4,
  },
});
