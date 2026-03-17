import {
    ID,
    storage,
    VOICE_MESSAGES_BUCKET_ID,
} from "@/lib/appwrite";
import {
    buildConversationId,
    fetchConversationMessages,
    markConversationAsRead,
    sendDirectMessage,
    subscribeToConversation,
} from "@/lib/messaging";
import { DirectMessage } from "@/types/messaging";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { AudioPlayer } from "expo-audio";
import {
    createAudioPlayer,
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    ActivityIndicator,
    Avatar,
    IconButton,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

interface ConversationScreenProps {
  /** Current user's profile doc ID (caregiver.$id or elderly.$id) */
  myProfileId: string;
  /** Current user's display name */
  myName: string;
  /** Current user's role */
  myRole: "caregiver" | "elderly";
  /** The other party's profile doc ID */
  contactId: string;
  /** The other party's display name */
  contactName: string;
  /** The other party's role */
  contactRole: "caregiver" | "elderly";
}

/** Inline voice message player */
function VoiceMessageBubble({
  body,
  isMe,
  theme,
}: {
  body: string;
  isMe: boolean;
  theme: any;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  // Parse "duration|fileId"
  const pipeIdx = body.indexOf("|");
  const duration = pipeIdx > 0 ? parseInt(body.substring(0, pipeIdx), 10) || 0 : 0;
  const fileId = pipeIdx > 0 ? body.substring(pipeIdx + 1) : body;

  const fmtDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = async () => {
    if (playing && playerRef.current) {
      playerRef.current.pause();
      setPlaying(false);
      return;
    }

    if (playerRef.current) {
      playerRef.current.play();
      setPlaying(true);
      return;
    }

    setLoading(true);
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
      });
      // Download voice file from Appwrite Storage
      const downloadUrl = storage.getFileDownloadURL(
        VOICE_MESSAGES_BUCKET_ID,
        fileId,
      );
      const player = createAudioPlayer(downloadUrl.toString());
      playerRef.current = player;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setPlaying(false);
        }
      });
      player.play();
      setPlaying(true);
    } catch (err) {
      console.error("Playback error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      playerRef.current?.remove();
    };
  }, []);

  const iconColor = isMe ? theme.colors.onPrimary : theme.colors.onSurface;

  return (
    <TouchableOpacity
      onPress={handlePlayPause}
      activeOpacity={0.7}
      style={styles.voiceBubbleRow}
    >
      {loading ? (
        <ActivityIndicator size={20} color={iconColor} />
      ) : (
        <MaterialCommunityIcons
          name={playing ? "pause-circle" : "play-circle"}
          size={32}
          color={iconColor}
        />
      )}
      <View style={styles.voiceWaveform}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.voiceBar,
              {
                height: 6 + Math.random() * 14,
                backgroundColor: iconColor,
                opacity: playing ? 0.9 : 0.5,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: iconColor, opacity: 0.8 }]}>
        {fmtDur(duration)}
      </Text>
    </TouchableOpacity>
  );
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
  const router = useRouter();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // ── Voice recording state ──
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const conversationId = buildConversationId(myProfileId, contactId);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchConversationMessages(conversationId, 100);
      setMessages(data);
      // Mark as read
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

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversationId, (newMsg) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.$id === newMsg.$id)) return prev;
        return [...prev, newMsg];
      });
      // Mark as read if we're the receiver
      if (newMsg.receiver_id === myProfileId) {
        markConversationAsRead(conversationId, myProfileId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, myProfileId]);

  // Auto-scroll to bottom when new messages arrive
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

  // ── Voice recording helpers ──
  const startRecording = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Microphone access is required to send voice messages.");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimer.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const cancelRecording = async () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    setIsRecording(false);
    setRecordingDuration(0);
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch { /* ignore */ }
    }
  };

  const sendVoiceMessage = async () => {
    if (!recorder.isRecording) return;
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    setIsRecording(false);
    setSending(true);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording URI");

      // Get file info for upload
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) throw new Error("Recording file not found");

      // Upload voice file to Appwrite Storage
      const uploadedFile = await storage.createFile({
        bucketId: VOICE_MESSAGES_BUCKET_ID,
        fileId: ID.unique(),
        file: {
          name: `voice_${Date.now()}.m4a`,
          type: "audio/m4a",
          size: fileInfo.size ?? 0,
          uri,
        },
      });

      // Build a payload: duration|fileId
      const payload = `${recordingDuration}|${uploadedFile.$id}`;

      const newMsg = await sendDirectMessage({
        conversationId,
        senderId: myProfileId,
        senderName: myName,
        senderRole: myRole,
        receiverId: contactId,
        body: payload,
        messageType: "voice",
      });

      setMessages((prev) => {
        if (prev.some((m) => m.$id === newMsg.$id)) return prev;
        return [...prev, newMsg];
      });
      setRecordingDuration(0);
    } catch (error) {
      console.error("Error sending voice message:", error);
      Alert.alert("Error", "Failed to send voice message.");
    } finally {
      setSending(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatMessageTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
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

  const renderMessage = ({
    item,
    index,
  }: {
    item: DirectMessage;
    index: number;
  }) => {
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
            {item.message_type === "voice" ? (
              <VoiceMessageBubble body={item.body} isMe={isMe} theme={theme} />
            ) : (
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
            )}
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
              {isMe ? (
                <MaterialCommunityIcons
                  name={item.is_read ? "check-all" : "check"}
                  size={14}
                  color={item.is_read ? "#64DD17" : theme.colors.onPrimary}
                  style={{ marginLeft: 4, opacity: 0.8 }}
                />
              ) : (
                item.is_read && (
                  <MaterialCommunityIcons
                    name="check-all"
                    size={14}
                    color="#4CAF50"
                    style={{ marginLeft: 4, opacity: 0.8 }}
                  />
                )
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
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.surface }]}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Chat Header */}
        <View
          style={[styles.chatHeader, { backgroundColor: theme.colors.surface }]}
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
                name={
                  contactRole === "caregiver"
                    ? "shield-account"
                    : "account-heart"
                }
                size={14}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {contactRole === "caregiver" ? "Caregiver" : "Elderly"}
              </Text>
            </View>
          </View>
        </View>

        {/* Messages */}
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

        {/* Input Bar */}
        {isRecording ? (
          <View style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.recordingBar}>
              <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecordBtn}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.error} />
              </TouchableOpacity>
              <View style={styles.recordingIndicator}>
                <View style={[styles.recordingDot, { backgroundColor: "#D32F2F" }]} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
                  {formatDuration(recordingDuration)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={sendVoiceMessage}
                style={[styles.sendVoiceBtn, { backgroundColor: theme.colors.primary }]}
              >
                {sending ? (
                  <ActivityIndicator size={20} color={theme.colors.onPrimary} />
                ) : (
                  <MaterialCommunityIcons name="send" size={20} color={theme.colors.onPrimary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}
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
              right={
                inputText.trim() ? (
                  <TextInput.Icon
                    icon="send"
                    color={theme.colors.primary}
                    onPress={handleSend}
                    disabled={sending}
                  />
                ) : undefined
              }
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            {!inputText.trim() && (
              <IconButton
                icon="microphone"
                mode="contained"
                containerColor={theme.colors.primary}
                iconColor={theme.colors.onPrimary}
                size={22}
                onPress={startRecording}
                disabled={sending}
                style={styles.sendButton}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
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
    borderBottomColor: "rgba(0,0,0,0.08)",
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
    borderTopColor: "rgba(0,0,0,0.08)",
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
  // Voice message bubble styles
  voiceBubbleRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 10,
    minWidth: 180,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  voiceWaveform: {
    flexDirection: "row" as const,
    alignItems: "center",
    flex: 1,
    gap: 2,
    height: 28,
  },
  voiceBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: 12,
    marginLeft: 4,
    minWidth: 32,
    textAlign: "right" as const,
  },
  // Recording UI styles
  recordingBar: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  cancelRecordBtn: {
    padding: 8,
  },
  recordingIndicator: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sendVoiceBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
});
