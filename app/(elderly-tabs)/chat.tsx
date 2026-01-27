import { useAuth } from "@/lib/auth-context";
import {
  buildMedicationSummary,
  buildScheduleSummary,
  fetchElderlyMedicationsForUser,
  fetchElderlySchedulesForUser,
} from "@/lib/elderly";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Card,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  imageUri?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
}

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export default function ElderlyChat() {
  const theme = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(
    `chat-${Date.now()}`,
  );
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const DEEPSEEK_API_KEY = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY?.trim();
  const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
  const USE_MOCK_MODE = false;

  useEffect(() => {
    (async () => {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "We need camera roll permissions to upload photos.",
          );
        }
      }
    })();
  }, []);

  const quickSuggestions = useMemo(
    () => [
      "What medicine do I need to take today?",
      "What is my schedule today?",
      "I feel unwell",
    ],
    [],
  );

  const tryHandleLocalDataRequest = async (userMessage: string) => {
    const lower = userMessage.toLowerCase();

    if (
      lower.includes("medicine") ||
      lower.includes("medication") ||
      lower.includes("pill")
    ) {
      const meds = await fetchElderlyMedicationsForUser(user?.$id);
      return buildMedicationSummary(meds);
    }

    if (
      lower.includes("schedule") ||
      lower.includes("appointment") ||
      lower.includes("event")
    ) {
      const schedules = await fetchElderlySchedulesForUser(user?.$id);
      return buildScheduleSummary(schedules);
    }

    return null;
  };

  const buildConversationMessages = (latestUserMessage: string) => {
    const history = messages.slice(-8).map((msg) => ({
      role: msg.isUser ? "user" : "assistant",
      content: msg.text,
    }));

    return [
      {
        role: "system",
        content:
          "You are a helpful AI care assistant for elderly users. Provide clear, compassionate, and helpful responses about health, medication, and wellness. Always remind users to consult healthcare professionals for serious concerns.",
      },
      ...history,
      {
        role: "user",
        content: latestUserMessage,
      },
    ];
  };

  const callDeepSeekAPI = async (userMessage: string): Promise<string> => {
    if (USE_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const lowerMessage = userMessage.toLowerCase();

      if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
        return "Hello! I'm your AI Care Assistant. I'm here to help you with health-related questions, medication reminders, and wellness advice. What would you like to know?";
      } else if (
        lowerMessage.includes("medication") ||
        lowerMessage.includes("medicine")
      ) {
        return "I can help you with medication information! For personalized medication advice, please consult with your healthcare provider. Would you like me to help you set up medication reminders?";
      } else if (
        lowerMessage.includes("health") ||
        lowerMessage.includes("symptom")
      ) {
        return "I'm here to provide general health information. However, for any serious health concerns or symptoms, please consult with a healthcare professional immediately. How can I assist you today?";
      } else if (lowerMessage.includes("emergency")) {
        return "⚠️ For medical emergencies, please call emergency services immediately (911 or your local emergency number). I'm an AI assistant and cannot provide emergency medical care.";
      } else {
        return `I understand you're asking about \"${userMessage}\". As your AI Care Assistant, I'm here to help with health information, medication tracking, and wellness support. Could you provide more details about what you'd like to know?`;
      }
    }

    if (!DEEPSEEK_API_KEY) {
      return "I'm ready to chat freely, but the AI key isn't configured yet. Please add EXPO_PUBLIC_DEEPSEEK_API_KEY to enable full conversation.";
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      signal: abortControllerRef.current?.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: buildConversationMessages(userMessage),
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error("Authentication failed. Please check your API key.");
      }
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: DeepSeekResponse = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from DeepSeek API");
    }

    return data.choices[0].message.content;
  };

  const handleImageOptions = () => {
    if (Platform.OS === "web") {
      const choice = window.confirm(
        "Click OK to take a photo, or Cancel to choose from gallery",
      );
      if (choice) {
        takePhoto();
      } else {
        pickImage();
      }
    } else {
      Alert.alert(
        "Add Photo",
        "Choose an option",
        [
          {
            text: "Take Photo",
            onPress: () => takePhoto(),
          },
          {
            text: "Choose from Gallery",
            onPress: () => pickImage(),
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ],
        { cancelable: true },
      );
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      if (Platform.OS === "web") {
        alert("Failed to pick image. Please try again.");
      } else {
        Alert.alert("Error", "Failed to pick image. Please try again.");
      }
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        if (Platform.OS === "web") {
          alert("Camera permission is required to take photos.");
        } else {
          Alert.alert(
            "Permission needed",
            "Camera permission is required to take photos.",
          );
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      if (Platform.OS === "web") {
        alert("Failed to take photo. Please try again.");
      } else {
        Alert.alert("Error", "Failed to take photo. Please try again.");
      }
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const openImagePreview = (uri: string) => {
    if (Platform.OS === "web") {
      window.open(uri, "_blank");
      return;
    }
    setPreviewImageUri(uri);
  };

  const closeImagePreview = () => {
    setPreviewImageUri(null);
  };

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setPendingMessageId(null);
  };

  const editMessage = (messageId: string) => {
    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) return;

    const messageToEdit = messages[messageIndex];
    setInputText(messageToEdit.text);
    setSelectedImage(messageToEdit.imageUri || null);
    setMessages(messages.slice(0, messageIndex));
    setPendingMessageId(null);
  };

  const saveCurrentChatToHistory = () => {
    if (messages.length === 0) return;

    const titleSource = messages.find((msg) => msg.isUser)?.text;
    const title = titleSource ? titleSource.slice(0, 40) : "New chat";
    const session: ChatSession = {
      id: currentChatId,
      title,
      messages,
      updatedAt: new Date(),
    };

    setChatHistory((prev) => {
      const existingIndex = prev.findIndex((chat) => chat.id === currentChatId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = session;
        return next;
      }
      return [session, ...prev];
    });
  };

  const startNewChat = () => {
    saveCurrentChatToHistory();
    setMessages([]);
    setInputText("");
    setSelectedImage(null);
    setIsLoading(false);
    setPendingMessageId(null);
    setCurrentChatId(`chat-${Date.now()}`);
  };

  const openHistory = () => {
    saveCurrentChatToHistory();
    setIsHistoryVisible(true);
  };

  const loadChatFromHistory = (chat: ChatSession) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages);
    setIsHistoryVisible(false);
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim() || "📷 [Image sent]",
      isUser: true,
      timestamp: new Date(),
      imageUri: selectedImage || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setSelectedImage(null);
    setIsLoading(true);
    setPendingMessageId(userMessage.id);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    Keyboard.dismiss();

    try {
      const messageForAPI = selectedImage
        ? `${userMessage.text}\n[User has shared an image]`
        : userMessage.text;

      const localResponse = await tryHandleLocalDataRequest(messageForAPI);
      const aiResponse = localResponse ?? (await callDeepSeekAPI(messageForAPI));

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error calling assistant:", error);

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

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageRow,
        item.isUser ? styles.userMessageRow : styles.aiMessageRow,
      ]}
    >
      {!item.isUser && (
        <Avatar.Icon size={36} icon="robot" style={styles.avatarAI} />
      )}

      <View style={styles.messageBubbleContainer}>
        <Card
          style={[
            styles.messageCard,
            item.isUser ? styles.userMessage : styles.aiMessage,
          ]}
        >
          <Card.Content style={styles.messageContent}>
            {item.imageUri && (
              <TouchableOpacity
                onPress={() => {
                  openImagePreview(item.imageUri!);
                }}
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
                { color: item.isUser ? "#FFFFFF" : "#000000" },
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
                    : "rgba(0,0,0,0.5)",
                },
              ]}
            >
              {item.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {item.isUser && pendingMessageId === item.id && (
              <View style={styles.messageActionsRow}>
                <IconButton
                  icon="stop-circle-outline"
                  size={18}
                  onPress={stopGenerating}
                  style={styles.messageActionButton}
                  iconColor="#FFFFFF"
                />
                <IconButton
                  icon="pencil"
                  size={18}
                  onPress={() => editMessage(item.id)}
                  style={styles.messageActionButton}
                  iconColor="#FFFFFF"
                />
              </View>
            )}
            {item.isUser && pendingMessageId !== item.id && (
              <View style={styles.messageActionsRow}>
                <IconButton
                  icon="pencil"
                  size={18}
                  onPress={() => editMessage(item.id)}
                  style={styles.messageActionButton}
                  iconColor="#FFFFFF"
                />
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      {item.isUser && (
        <Avatar.Icon size={36} icon="account" style={styles.avatarUser} />
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
      <View style={styles.topBar}>
        <IconButton
          icon="history"
          size={22}
          onPress={openHistory}
          style={styles.topBarButton}
          iconColor={theme.colors.onSurface}
        />
        <View style={styles.topBarSpacer} />
        <IconButton
          icon="plus"
          size={22}
          onPress={startNewChat}
          style={styles.topBarButton}
          iconColor={theme.colors.onSurface}
        />
      </View>
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
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator animating={true} color={theme.colors.primary} />
            <Text style={styles.loadingText}>AI is thinking...</Text>
          </View>
        )}
      </View>

      {/* Quick suggestions */}
      <View
        style={[
          styles.suggestionsContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <View style={styles.suggestionsHeaderRow}>
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Quick questions:
          </Text>
          <TouchableOpacity
            onPress={() => setIsSuggestionsExpanded((prev) => !prev)}
            accessibilityRole="button"
          >
            <Text style={[styles.suggestionsToggle, { color: theme.colors.primary }]}>
              {isSuggestionsExpanded ? "Show less" : "Show more"}
            </Text>
          </TouchableOpacity>
        </View>
        {isSuggestionsExpanded && (
          <View style={styles.suggestionsRow}>
            {quickSuggestions.map((suggestion, index) => (
              <Card
                key={index}
                style={[
                  styles.suggestionCard,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
                onPress={() => {
                  setInputText(suggestion);
                }}
              >
                <Card.Content style={styles.suggestionContent}>
                  <Text variant="bodySmall">{suggestion}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View
        style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]}
      >
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
            <IconButton
              icon="close-circle"
              size={24}
              onPress={removeSelectedImage}
              style={styles.removeImageButton}
              iconColor="#FFFFFF"
            />
          </View>
        )}

        <View style={styles.inputRow}>
          <IconButton
            icon="camera"
            size={24}
            onPress={handleImageOptions}
            style={styles.photoButton}
          />

          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            mode="outlined"
            style={styles.textInput}
            contentStyle={styles.textInputContent}
            multiline
            maxLength={500}
            right={
              <TextInput.Icon
                icon="send"
                onPress={sendMessage}
                disabled={(!inputText.trim() && !selectedImage) || isLoading}
                forceTextInputFocus={false}
              />
            }
          />
        </View>
      </View>

      <Modal
        visible={isHistoryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsHistoryVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsHistoryVisible(false)}
        >
          <Pressable style={styles.historyModal}>
            <Text variant="titleMedium" style={styles.historyTitle}>
              Chat History
            </Text>
            <FlatList
              data={chatHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Card
                  style={styles.historyCard}
                  onPress={() => loadChatFromHistory(item)}
                >
                  <Card.Content>
                    <Text variant="titleSmall">{item.title}</Text>
                    <Text variant="bodySmall" style={styles.historyMeta}>
                      {item.updatedAt.toLocaleString()}
                    </Text>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={
                <Text style={styles.historyEmpty}>No previous chats yet.</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!previewImageUri}
        transparent
        animationType="fade"
        onRequestClose={closeImagePreview}
      >
        <Pressable style={styles.modalOverlay} onPress={closeImagePreview}>
          <Pressable style={styles.imagePreviewModal}>
            {previewImageUri && (
              <Image
                source={{ uri: previewImageUri }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
            <IconButton
              icon="close"
              size={24}
              onPress={closeImagePreview}
              style={styles.closePreviewButton}
              iconColor="#FFFFFF"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topBarTitle: {
    marginLeft: 4,
    color: "#1F2937",
  },
  topBarSpacer: {
    flex: 1,
  },
  topBarButton: {
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesListContent: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  aiMessageRow: {
    justifyContent: "flex-start",
  },
  avatarAI: {
    marginRight: 8,
    backgroundColor: "#E3F2FD",
  },
  avatarUser: {
    marginLeft: 8,
    backgroundColor: "#007AFF",
  },
  messageBubbleContainer: {
    maxWidth: "75%",
    flexShrink: 1,
  },
  messageCard: {
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userMessage: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    backgroundColor: "#F5F5F5",
    borderBottomLeftRadius: 4,
  },
  messageContent: {
    padding: 8,
  },
  messageImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  messageActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  messageActionButton: {
    margin: 0,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  inputContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
  },
  photoButton: {
    margin: 0,
    width: 48,
    height: 48,
  },
  textInput: {
    backgroundColor: "transparent",
    flex: 1,
    maxHeight: 120,
    minHeight: 56,
  },
  textInputContent: {
    paddingVertical: 14,
    minHeight: 56,
  },
  imagePreviewContainer: {
    position: "relative",
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "rgba(0,0,0,0.6)",
    margin: 0,
  },
  suggestionsContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  suggestionsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  suggestionsToggle: {
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionCard: {
    borderRadius: 20,
  },
  suggestionContent: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  historyModal: {
    width: "100%",
    maxHeight: "70%",
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  historyTitle: {
    marginBottom: 12,
    color: "#F8FAFC",
  },
  historyCard: {
    marginBottom: 8,
    backgroundColor: "#111827",
  },
  historyMeta: {
    color: "#94A3B8",
    marginTop: 4,
  },
  historyEmpty: {
    textAlign: "center",
    paddingVertical: 24,
    color: "#94A3B8",
  },
  imagePreviewModal: {
    width: "100%",
    height: "70%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  closePreviewButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
