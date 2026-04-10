import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import {
  createChatSession,
  deleteChatSession,
  listChatSessionsForUser,
  updateChatSession,
} from "@/lib/chat";
import {
  fetchDayMedicationEvents,
  fetchDayScheduleEvents,
  fetchScheduleCategories,
} from "@/lib/schedule";
import type {
  ChatSession as AppwriteChatSession,
  Elderly,
} from "@/types/appwrite";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Card,
  IconButton,
  Menu,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  imageUri?: string;
}

interface SelectedImage {
  uri: string;
  mimeType: string;
}

interface ChatMessage {
  role: string;
  content: any;
}

interface AIAPIResponse {
  choices?: { message: { content: any } }[];
  error?: { message: string };
}

/* ─── Serialisation helpers for chat history ─────────────────────────── */
const serializeMessages = (msgs: Message[]): string =>
  JSON.stringify(
    msgs.map((m) => ({
      id: m.id,
      text: m.text,
      isUser: m.isUser,
      timestamp: m.timestamp.toISOString(),
      imageUri: m.imageUri,
    })),
  );

const deserializeMessages = (raw: string): Message[] => {
  try {
    return (JSON.parse(raw) as any[]).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
};

/* ─── Component ─────────────────────────────────────────────────────── */
export default function CaregiverChatBot() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { user } = useAuth();

  /* State */
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
    null,
  );
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  // Chat history
  const [chatHistory, setChatHistory] = useState<AppwriteChatSession[]>([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Elderly context
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [elderlyContext, setElderlyContext] = useState<string>("");

  // Menu (history item options)
  const [historyMenuId, setHistoryMenuId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /* ─── API config ──────────────────────────────────────────────────── */
  const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim();
  const DASHSCOPE_API_URL = process.env.EXPO_PUBLIC_DASHSCOPE_API_URL?.trim();
  const DASHSCOPE_TEXT_MODEL = process.env.EXPO_PUBLIC_DASHSCOPE_MODEL?.trim();
  const DASHSCOPE_IMAGE_MODEL =
    process.env.EXPO_PUBLIC_DASHSCOPE_IMAGE_MODEL?.trim();
  const REQUEST_TIMEOUT_MS = 90000;
  const USE_MOCK_MODE = false;

  /* ─── Quick suggestions ───────────────────────────────────────────── */
  const quickSuggestions = useMemo(
    () => [
      "What are today's tasks for my elderly?",
      "Which medications are still pending?",
      "Any missed events today?",
      "Give me an overall health summary",
    ],
    [],
  );

  /* ─── Load linked elderly & build context ─────────────────────────── */
  const buildElderlyContext = useCallback(async () => {
    if (!user?.$id) return;
    try {
      const caregiver = await getCaregiverByUserId(user.$id);
      if (!caregiver) return;

      const elderly = await getLinkedElderly(caregiver.$id);
      setLinkedElderly(elderly);
      if (elderly.length === 0) {
        setElderlyContext("No elderly linked to this caregiver yet.");
        return;
      }

      const elderlyIds = elderly.map((e) => e.$id);
      const elderlyMap = new Map(elderly.map((e) => [e.$id, e.name]));

      const today = new Date();
      const categories = await fetchScheduleCategories();

      const [scheduleEvents, medicationEvents] = await Promise.all([
        fetchDayScheduleEvents(elderlyIds, today, categories, elderlyMap),
        fetchDayMedicationEvents(elderlyIds, today, elderlyMap),
      ]);

      // Group by elderly
      const contextParts: string[] = [];
      for (const e of elderly) {
        const sched = scheduleEvents.filter((ev) => ev.elderlyId === e.$id);
        const meds = medicationEvents.filter((ev) => ev.elderlyId === e.$id);

        let part = `【${e.name}】`;
        if (sched.length === 0 && meds.length === 0) {
          part += "\n  No tasks or medications today.";
        } else {
          if (sched.length > 0) {
            part += "\n  Schedule:";
            for (const s of sched) {
              part += `\n    • ${s.time} ${s.title} — ${s.status}`;
            }
          }
          if (meds.length > 0) {
            part += "\n  Medications:";
            for (const m of meds) {
              part += `\n    • ${m.time} ${m.title} (${m.description}) — ${m.status}`;
            }
          }
        }
        contextParts.push(part);
      }

      setElderlyContext(contextParts.join("\n\n"));
    } catch (err) {
      console.error("Failed to build elderly context:", err);
      setElderlyContext("Failed to load elderly data.");
    }
  }, [user?.$id]);

  useEffect(() => {
    buildElderlyContext();
  }, [buildElderlyContext]);

  useFocusEffect(
    useCallback(() => {
      buildElderlyContext();
    }, [buildElderlyContext]),
  );

  /* ─── Chat history ────────────────────────────────────────────────── */
  const loadHistory = useCallback(async () => {
    if (!user?.$id) return;
    try {
      const sessions = await listChatSessionsForUser(user.$id);
      setChatHistory(sessions);
    } catch (e) {
      console.warn("Failed to load chat history:", e);
    }
  }, [user?.$id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const saveCurrentChatToHistory = async () => {
    if (messages.length === 0 || !user?.$id) return;
    const titleSource = messages.find((msg) => msg.isUser)?.text;
    const title = titleSource ? titleSource.slice(0, 40) : "New chat";
    const serialized = serializeMessages(messages);
    try {
      if (currentChatId) {
        const updated = await updateChatSession(currentChatId, {
          title,
          messages: serialized,
        });
        setChatHistory((prev) =>
          prev.map((c) => (c.$id === currentChatId ? updated : c)),
        );
      } else {
        const created = await createChatSession({
          userId: user.$id,
          title,
          messages: serialized,
        });
        setCurrentChatId(created.$id);
        setChatHistory((prev) => [created, ...prev]);
      }
    } catch (e) {
      console.warn("Failed to save chat session", e);
    }
  };

  const startNewChat = async () => {
    await saveCurrentChatToHistory();
    setMessages([]);
    setInputText("");
    setSelectedImage(null);
    setIsLoading(false);
    setPendingMessageId(null);
    setCurrentChatId(null);
    buildElderlyContext(); // refresh context
  };

  const openHistory = async () => {
    await saveCurrentChatToHistory();
    await loadHistory();
    setIsHistoryVisible(true);
  };

  const loadChatFromHistory = (chat: AppwriteChatSession) => {
    setCurrentChatId(chat.$id);
    setMessages(deserializeMessages(chat.messages));
    setIsHistoryVisible(false);
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteChatSession(chatId);
      setChatHistory((prev) => prev.filter((c) => c.$id !== chatId));
      if (currentChatId === chatId) {
        setMessages([]);
        setCurrentChatId(null);
      }
    } catch {
      console.warn("Failed to delete chat session");
    }
  };

  // Auto-save after AI response
  const prevMessagesLenRef = useRef(0);
  useEffect(() => {
    if (
      messages.length > 0 &&
      messages.length > prevMessagesLenRef.current &&
      !isLoading
    ) {
      saveCurrentChatToHistory();
    }
    prevMessagesLenRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isLoading]);

  /* ─── System prompt builder ───────────────────────────────────────── */
  const buildConversationMessages = (
    latestUserMessage: string,
  ): ChatMessage[] => {
    const history: ChatMessage[] = messages.slice(-8).map((msg) => ({
      role: msg.isUser ? "user" : "assistant",
      content: msg.text,
    }));

    const dataBlock = elderlyContext
      ? `\n\nHere is today's real-time data for the elderly you are responsible for:\n${elderlyContext}`
      : "";

    return [
      {
        role: "system",
        content: `You are an AI care assistant for caregivers who manage elderly patients. Provide clear, professional, and helpful responses about the elderly's daily schedule, medication status, and health tasks.\n\nIMPORTANT: Keep your response concise — no more than 120 words. Be brief and to the point.\n\nWhen responding about tasks, medications, or schedules, use the data provided. Do NOT invent data that is not listed below. If you don't have enough data, say so.\n\nYou can identify medication from photos — provide name, common uses, dosage, and warnings. If unsure, advise consulting a pharmacist.\n\nAlways remind the caregiver to consult healthcare professionals for serious concerns.${dataBlock}`,
      },
      ...history,
      { role: "user", content: latestUserMessage },
    ];
  };

  /* ─── Image handling ──────────────────────────────────────────────── */
  const compressImage = async (image: SelectedImage) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        image.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      return { uri: manipulated.uri, mimeType: "image/jpeg" } as SelectedImage;
    } catch {
      return image;
    }
  };

  const prepareImageForUpload = async (image: SelectedImage) => {
    const manipulated = await ImageManipulator.manipulateAsync(
      image.uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!manipulated.base64)
      throw new Error("Failed to encode image to base64");
    return {
      uri: manipulated.uri,
      mimeType: "image/jpeg",
      base64: manipulated.base64,
    };
  };

  const handleImageOptions = () => {
    if (Platform.OS === "web") {
      pickImage();
    } else {
      Alert.alert("Add Photo", "Choose an option", [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Gallery", onPress: pickImage },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        const compressed = await compressImage({
          uri: result.assets[0].uri,
          mimeType: result.assets[0].mimeType || "image/jpeg",
        });
        setSelectedImage(compressed);
      }
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Camera permission is required.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        const compressed = await compressImage({
          uri: result.assets[0].uri,
          mimeType: result.assets[0].mimeType || "image/jpeg",
        });
        setSelectedImage(compressed);
      }
    } catch {
      Alert.alert("Error", "Failed to take photo.");
    }
  };

  /* ─── AI API call ─────────────────────────────────────────────────── */
  const callAIAPI = async (
    userMessage: string,
    image?: SelectedImage | null,
    allowImageFallback = true,
  ): Promise<string> => {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    if (USE_MOCK_MODE) {
      await sleep(1000);
      return `I understand you're asking about "${userMessage}". As your AI Care Assistant, I can help you manage your elderly patients' tasks and medications.`;
    }

    if (!DASHSCOPE_API_KEY) {
      return "AI key isn't configured yet. Please add EXPO_PUBLIC_DASHSCOPE_API_KEY.";
    }

    const preparedImage = image ? await prepareImageForUpload(image) : null;
    const resolvedModel = preparedImage
      ? DASHSCOPE_IMAGE_MODEL
      : DASHSCOPE_TEXT_MODEL;
    const baseMessages = buildConversationMessages(userMessage);
    const messagesPayload: ChatMessage[] = preparedImage
      ? baseMessages.slice(0, -1).concat({
          role: "user",
          content: [
            { type: "text", text: userMessage },
            {
              type: "image_url",
              image_url: {
                url: `data:${preparedImage.mimeType};base64,${preparedImage.base64}`,
                detail: "high",
              },
            },
          ],
        })
      : baseMessages;

    const payload = {
      model: resolvedModel,
      messages: messagesPayload,
      max_tokens: 300,
      temperature: 0.7,
    };

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        abortControllerRef.current = new AbortController();
        const timeoutId = setTimeout(
          () => abortControllerRef.current?.abort(),
          REQUEST_TIMEOUT_MS,
        );

        const response = await fetch(`${DASHSCOPE_API_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        clearTimeout(timeoutId);

        if (response.ok) {
          const data: AIAPIResponse = rawText ? JSON.parse(rawText) : {};
          const content = data.choices?.[0]?.message?.content;
          if (!content)
            throw new Error(data.error?.message || "No response from AI API");
          if (typeof content === "string") return content;
          const textParts = content
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .filter(Boolean);
          if (textParts.length > 0) return textParts.join("\n");
          throw new Error("No response from AI API");
        }

        const errorData: AIAPIResponse = rawText ? JSON.parse(rawText) : {};
        const providerMessage =
          errorData?.error?.message ||
          rawText?.slice(0, 300) ||
          "Provider error";

        if (response.status === 401) throw new Error("Authentication failed.");
        if (response.status === 429) {
          lastError = new Error(providerMessage || "Rate limit reached.");
          if (attempt < maxAttempts) {
            await sleep(500 * attempt * attempt);
            continue;
          }
          throw lastError;
        }

        lastError = new Error(
          providerMessage || `API request failed: ${response.status}`,
        );
        break;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error("Request timed out.");
          if (attempt < maxAttempts) {
            await sleep(500 * attempt * attempt);
            continue;
          }
          break;
        }
        lastError =
          error instanceof Error ? error : new Error("Provider returned error");
        if (attempt < maxAttempts) {
          await sleep(500 * attempt * attempt);
          continue;
        }
        break;
      }
    }

    if (image && allowImageFallback) {
      try {
        return await callAIAPI(userMessage, null, false);
      } catch {
        /* fall through */
      }
    }

    if (lastError) throw lastError;
    throw new Error("API request failed unexpectedly.");
  };

  /* ─── Send suggestion (bypasses inputText state) ───────────────────── */
  const sendSuggestion = async (text: string) => {
    if (isLoading) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setPendingMessageId(userMessage.id);
    try {
      const aiResponse = await callAIAPI(text);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setPendingMessageId(null);
    }
  };

  /* ─── Send message ────────────────────────────────────────────────── */
  const sendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim() || "📷 [Image sent]",
      isUser: true,
      timestamp: new Date(),
      imageUri: selectedImage?.uri,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setSelectedImage(null);
    setIsLoading(true);
    setPendingMessageId(userMessage.id);
    Keyboard.dismiss();

    try {
      let messageForAPI = userMessage.text;
      if (selectedImage) {
        const isMedQuery =
          /medication|medicine|pill|藥|药|capsule|tablet/i.test(messageForAPI);
        messageForAPI = isMedQuery
          ? `${messageForAPI}\n[Photo of medication. Please identify it.]`
          : `${messageForAPI}\n[User has shared an image]`;
      }

      const aiResponse = await callAIAPI(messageForAPI, selectedImage);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setPendingMessageId(null);
    }
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setPendingMessageId(null);
  };

  const editMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    setInputText(messages[idx].text);
    setSelectedImage(
      messages[idx].imageUri
        ? { uri: messages[idx].imageUri!, mimeType: "image/jpeg" }
        : null,
    );
    setMessages(messages.slice(0, idx));
    setPendingMessageId(null);
  };

  /* ─── Render ──────────────────────────────────────────────────────── */
  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageRow,
        item.isUser ? styles.userMessageRow : styles.aiMessageRow,
      ]}
    >
      {!item.isUser && (
        <Avatar.Icon size={44} icon="robot" style={styles.avatarAI} />
      )}
      <View style={styles.messageBubbleContainer}>
        <Card
          style={[
            styles.messageCard,
            item.isUser
              ? styles.userMessage
              : [
                  styles.aiMessage,
                  { backgroundColor: theme.colors.surfaceVariant },
                ],
          ]}
        >
          <Card.Content style={styles.messageContent}>
            {item.imageUri && (
              <TouchableOpacity
                onPress={() => setPreviewImageUri(item.imageUri!)}
              >
                <Image
                  source={{ uri: item.imageUri }}
                  style={styles.messageImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            <Text
              style={[
                styles.messageText,
                { color: item.isUser ? "#FFF" : theme.colors.onSurface },
              ]}
              selectable
            >
              {item.text}
            </Text>
            <Text
              style={[
                styles.timestamp,
                {
                  color: item.isUser
                    ? "rgba(255,255,255,0.8)"
                    : theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {item.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {item.isUser && (
              <View style={styles.messageActionsRow}>
                {pendingMessageId === item.id && (
                  <IconButton
                    icon="stop-circle-outline"
                    size={18}
                    onPress={stopGenerating}
                    style={styles.messageActionButton}
                    iconColor="#FFF"
                  />
                )}
                <IconButton
                  icon="pencil"
                  size={18}
                  onPress={() => editMessage(item.id)}
                  style={styles.messageActionButton}
                  iconColor="#FFF"
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>
      {item.isUser && (
        <Avatar.Icon size={44} icon="account" style={styles.avatarUser} />
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={
        Platform.OS === "ios" ? 90 : Platform.OS === "android" ? 98 : 0
      }
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <IconButton
          icon="history"
          size={28}
          onPress={openHistory}
          iconColor={theme.colors.onSurface}
        />
        <View style={styles.topBarSpacer} />
        <IconButton
          icon="refresh"
          size={24}
          onPress={buildElderlyContext}
          iconColor={theme.colors.onSurface}
        />
        <IconButton
          icon="plus"
          size={28}
          onPress={startNewChat}
          iconColor={theme.colors.onSurface}
        />
      </View>

      {/* Messages */}
      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesListContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Avatar.Icon
              size={72}
              icon="robot-happy-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
            />
            <Text
              variant="headlineSmall"
              style={{ marginTop: 16, fontWeight: "bold" }}
            >
              Care Assistant
            </Text>
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.outline,
                textAlign: "center",
                marginTop: 8,
                paddingHorizontal: 32,
              }}
            >
              Ask me about today's tasks, medications, or schedules for your
              elderly patients.
            </Text>
            <View style={styles.suggestionsContainer}>
              {quickSuggestions.map((suggestion, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.suggestionChip,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                  onPress={() => sendSuggestion(suggestion)}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.colors.onSurfaceVariant,
                    }}
                  >
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={{ marginLeft: 8, color: theme.colors.outline }}>
              Thinking...
            </Text>
          </View>
        )}
      </View>

      {/* Image preview strip */}
      {selectedImage && (
        <View style={styles.imagePreviewStrip}>
          <Image
            source={{ uri: selectedImage.uri }}
            style={styles.previewThumb}
          />
          <IconButton
            icon="close-circle"
            size={20}
            onPress={() => setSelectedImage(null)}
            style={{ margin: 0 }}
          />
        </View>
      )}

      {/* Input area */}
      <View
        style={[
          styles.inputContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <IconButton
          icon="camera"
          size={24}
          onPress={handleImageOptions}
          iconColor={theme.colors.primary}
        />
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your elderly's tasks..."
          mode="outlined"
          dense
          right={
            isLoading ? (
              <TextInput.Icon
                icon="stop-circle-outline"
                onPress={stopGenerating}
              />
            ) : (
              <TextInput.Icon
                icon="send"
                onPress={sendMessage}
                disabled={!inputText.trim() && !selectedImage}
              />
            )
          }
          onSubmitEditing={sendMessage}
        />
      </View>

      {/* History modal */}
      <Modal visible={isHistoryVisible} animationType="slide" transparent>
        <View style={styles.historyOverlay}>
          <View
            style={[
              styles.historyContainer,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.historyHeader}>
              <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                Chat History
              </Text>
              <IconButton
                icon="close"
                onPress={() => setIsHistoryVisible(false)}
              />
            </View>
            <FlatList
              data={chatHistory}
              keyExtractor={(item) => item.$id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.historyItem,
                    { borderBottomColor: theme.colors.outlineVariant },
                  ]}
                  onPress={() => loadChatFromHistory(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.outline }}
                    >
                      {new Date(item.$updatedAt).toLocaleString()}
                    </Text>
                  </View>
                  <Menu
                    visible={historyMenuId === item.$id}
                    onDismiss={() => setHistoryMenuId(null)}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
                        size={20}
                        onPress={() => setHistoryMenuId(item.$id)}
                      />
                    }
                  >
                    <Menu.Item
                      title="Delete"
                      leadingIcon="delete"
                      onPress={() => {
                        setHistoryMenuId(null);
                        handleDeleteChat(item.$id);
                      }}
                    />
                  </Menu>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", marginTop: 40 }}>
                  <Text style={{ color: theme.colors.outline }}>
                    No chat history yet.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Full image preview */}
      <Modal visible={!!previewImageUri} transparent animationType="fade">
        <Pressable
          style={styles.imagePreviewOverlay}
          onPress={() => setPreviewImageUri(null)}
        >
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.fullPreviewImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  topBarSpacer: { flex: 1 },
  chatContainer: { flex: 1 },
  messagesList: { flex: 1 },
  messagesListContent: { padding: 16, paddingBottom: 8 },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  userMessageRow: { justifyContent: "flex-end" },
  aiMessageRow: { justifyContent: "flex-start" },
  messageBubbleContainer: { maxWidth: "75%", flexShrink: 1 },
  messageCard: { borderRadius: 16, elevation: 1 },
  userMessage: { backgroundColor: "#1565C0" },
  aiMessage: { backgroundColor: "#F5F5F5" },
  messageContent: { paddingVertical: 8, paddingHorizontal: 12 },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 8 },
  timestamp: { fontSize: 11, marginTop: 4, textAlign: "right" },
  messageActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  messageActionButton: { margin: 0, padding: 0 },
  avatarAI: { backgroundColor: "#E8F5E9", marginRight: 8 },
  avatarUser: { backgroundColor: "#E3F2FD", marginLeft: 8 },
  emptyState: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionsContainer: { marginTop: 24, paddingHorizontal: 16, width: "100%" },
  suggestionChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  imagePreviewStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  previewThumb: { width: 48, height: 48, borderRadius: 8 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  textInput: { flex: 1, marginRight: 4 },
  historyOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  historyContainer: {
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullPreviewImage: { width: "90%", height: "80%" },
});
