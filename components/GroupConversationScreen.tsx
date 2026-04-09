import {
    ID,
    storage,
    VOICE_MESSAGES_BUCKET_ID
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
    fetchGroupMessages,
    sendGroupMessage,
    subscribeToGroupMessages,
    updateGroupReadCursor,
} from "@/lib/group-messaging";
import { getGroupMembers } from "@/lib/groups";
import { GroupMember, GroupMessage } from "@/types/messaging";
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
import { useTranslation } from "react-i18next";
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
    IconButton,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import UserAvatar from "./UserAvatar";

interface GroupConversationScreenProps {
  myProfileId: string;
  myName: string;
  myRole: "elderly" | "caregiver";
  groupId: string;
  groupName: string;
}

/** Inline voice message player */
function VoiceMessageBubble({
  body,
  isMe,
  theme: themeObj,
}: {
  body: string;
  isMe: boolean;
  theme: any;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

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
      await setAudioModeAsync({ playsInSilentMode: true });
      const downloadUrl = storage.getFileDownloadURL(VOICE_MESSAGES_BUCKET_ID, fileId);
      const player = createAudioPlayer(downloadUrl.toString());
      playerRef.current = player;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) setPlaying(false);
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
    return () => { playerRef.current?.remove(); };
  }, []);

  const iconColor = isMe ? themeObj.colors.onPrimary : themeObj.colors.onSurface;

  return (
    <TouchableOpacity onPress={handlePlayPause} activeOpacity={0.7} style={styles.voiceBubbleRow}>
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
              { height: 6 + Math.random() * 14, backgroundColor: iconColor, opacity: playing ? 0.9 : 0.5 },
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

export default function GroupConversationScreen({
  myProfileId,
  myName,
  myRole,
  groupId,
  groupName,
}: GroupConversationScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { preferences } = useAuth();
  const { t } = useTranslation();

  const handleBack = () => {
    if (myRole === "caregiver") {
      router.replace("/(caregiver-tabs)/messages" as any);
    } else {
      router.replace("/(elderly-tabs)/emergency" as any);
    }
  };

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Voice recording
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load messages
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const [msgs, mems] = await Promise.all([
          fetchGroupMessages(groupId),
          getGroupMembers(groupId),
        ]);
        setMessages(msgs);
        setMembers(mems);
        await updateGroupReadCursor(groupId, myProfileId);
      } catch (error) {
        console.error("Error loading group messages:", error);
      } finally {
        setLoading(false);
      }

      unsub = subscribeToGroupMessages(groupId, (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.$id === newMsg.$id)) return prev;
          return [...prev, newMsg];
        });
        updateGroupReadCursor(groupId, myProfileId).catch(() => {});
      });
    })();

    return () => { unsub?.(); };
  }, [groupId, myProfileId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    Keyboard.dismiss();
    setSending(true);
    setInputText("");
    try {
      await sendGroupMessage({
        groupId,
        senderId: myProfileId,
        senderName: myName,
        senderRole: myRole,
        body: text,
      });
    } catch (error) {
      Alert.alert(t("common.error"), String(error));
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, groupId, myProfileId, myName, myRole]);

  // Voice recording handlers
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("common.permissionNeeded"), t("chat.micPermission"));
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true });
      recorder.record();
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(
        () => setRecordDuration((d) => d + 1),
        1000,
      );
    } catch {
      Alert.alert(t("common.error"), t("chat.couldNotStartRecording"));
    }
  }, [recorder]);

  const stopAndSendVoice = useCallback(async () => {
    if (!isRecording) return;
    clearInterval(timerRef.current!);
    timerRef.current = null;

    try {
      await recorder.stop();
      setIsRecording(false);
      const uri = recorder.uri;
      if (!uri) return;

      setSending(true);
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) return;

      const file = { name: `voice_${Date.now()}.m4a`, type: "audio/m4a", size: fileInfo.size || 0, uri };
      const uploaded = await storage.createFile(VOICE_MESSAGES_BUCKET_ID, ID.unique(), file);

      await sendGroupMessage({
        groupId,
        senderId: myProfileId,
        senderName: myName,
        senderRole: myRole,
        body: `${recordDuration}|${uploaded.$id}`,
        messageType: "voice",
      });
    } catch (error) {
      Alert.alert(t("common.error"), t("chat.failedToSendVoice"));
    } finally {
      setSending(false);
      setRecordDuration(0);
    }
  }, [isRecording, recorder, groupId, myProfileId, myName, myRole, recordDuration]);

  const cancelRecording = useCallback(() => {
    if (!isRecording) return;
    clearInterval(timerRef.current!);
    timerRef.current = null;
    recorder.stop();
    setIsRecording(false);
    setRecordDuration(0);
  }, [isRecording, recorder]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const renderMessage = ({ item }: { item: GroupMessage }) => {
    const isMe = item.sender_id === myProfileId;
    const isSystem = item.message_type === "system";

    if (isSystem) {
      return (
        <View style={styles.systemMsgContainer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: "italic" }}>
            {item.body}
          </Text>
        </View>
      );
    }

    const isVoice = item.message_type === "voice";

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isMe && (
          <View style={styles.senderAvatar}>
            <UserAvatar name={item.sender_name} size={28} role={item.sender_role} />
          </View>
        )}
        <View style={{ maxWidth: "75%" }}>
          {!isMe && (
            <Text variant="labelSmall" style={[styles.senderLabel, { color: theme.colors.primary }]}>
              {item.sender_name}
            </Text>
          )}
          <View
            style={[
              styles.bubble,
              isMe
                ? { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 }
                : { backgroundColor: theme.colors.surfaceVariant, borderBottomLeftRadius: 4 },
            ]}
          >
            {isVoice ? (
              <VoiceMessageBubble body={item.body} isMe={isMe} theme={theme} />
            ) : (
              <Text
                style={[
                  styles.msgText,
                  { color: isMe ? theme.colors.onPrimary : theme.colors.onSurface },
                ]}
              >
                {item.body}
              </Text>
            )}
          </View>
          <Text
            variant="labelSmall"
            style={[
              styles.timeLabel,
              { color: theme.colors.onSurfaceVariant },
              isMe && { textAlign: "right" },
            ]}
          >
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const navigateToSettings = () => {
    if (myRole === "caregiver") {
      router.push({ pathname: "/(caregiver-tabs)/group-settings" as any, params: { groupId, groupName } });
    } else {
      router.push({ pathname: "/(elderly-tabs)/group-settings" as any, params: { groupId, groupName } });
    }
  };

  const fmtRecordDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text variant="titleMedium" style={{ fontWeight: "700", color: theme.colors.onSurface }} numberOfLines={1}>
            {groupName}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {members.length} {t("chat.groupMembers")}
          </Text>
        </View>
        <IconButton icon="cog-outline" size={22} onPress={navigateToSettings} />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
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
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.colors.surface }]}>
          {isRecording ? (
            <View style={styles.recordingBar}>
              <TouchableOpacity onPress={cancelRecording}>
                <MaterialCommunityIcons name="close-circle" size={28} color={theme.colors.error} />
              </TouchableOpacity>
              <View style={styles.recordingIndicator}>
                <View style={[styles.recordingDot, { backgroundColor: theme.colors.error }]} />
                <Text style={{ color: theme.colors.error, fontWeight: "600" }}>
                  {fmtRecordDur(recordDuration)}
                </Text>
              </View>
              <TouchableOpacity onPress={stopAndSendVoice}>
                <MaterialCommunityIcons name="send-circle" size={36} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <IconButton
                icon="microphone"
                size={24}
                onPress={startRecording}
                iconColor={theme.colors.primary}
              />
              <TextInput
                mode="outlined"
                placeholder={t("chat.typeMessage")}
                value={inputText}
                onChangeText={setInputText}
                style={styles.textInput}
                outlineStyle={{ borderRadius: 20 }}
                dense
                right={
                  sending ? (
                    <TextInput.Icon icon={() => <ActivityIndicator size={18} />} />
                  ) : inputText.trim() ? (
                    <TextInput.Icon icon="send" onPress={handleSend} color={theme.colors.primary} />
                  ) : undefined
                }
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    elevation: 2,
  },
  backBtn: { padding: 8 },
  headerInfo: { flex: 1, marginLeft: 8 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  msgList: { padding: 12, paddingBottom: 8 },
  systemMsgContainer: {
    alignItems: "center",
    marginVertical: 8,
  },
  msgRow: { marginBottom: 8 },
  msgRowLeft: { flexDirection: "row", alignItems: "flex-end" },
  msgRowRight: { flexDirection: "row-reverse", alignItems: "flex-end" },
  senderAvatar: { marginRight: 6, marginBottom: 16 },
  senderLabel: { marginBottom: 2, marginLeft: 4, fontWeight: "600" },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  timeLabel: { fontSize: 10, marginTop: 2, marginHorizontal: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  textInput: { flex: 1, maxHeight: 100 },
  recordingBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  voiceBubbleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 160,
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 24,
  },
  voiceBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDuration: {
    fontSize: 12,
    minWidth: 32,
    textAlign: "right",
  },
});
