import { useAuth } from "@/lib/auth-context";
import {
    buildScheduleSummary,
    fetchElderlySchedulesForUser,
} from "@/lib/elderly";
import { useChatVoice } from "@/lib/hooks/useChatVoice";
import { getFormattedTodayMedicationSummary } from "@/lib/medication_tracking";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
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

interface SelectedImage {
  uri: string;
  mimeType: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
}

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image_url";
          image_url: { url: string; detail?: "low" | "high" | "auto" };
        }
    >;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: ChatContent;
    };
  }>;
  error?: {
    message?: string;
  };
}

export default function ElderlyChat() {
  const theme = useTheme();
  const { user } = useAuth();

  // Voice broadcast hook
  const {
    voiceEnabled,
    isSpeaking,
    toggleVoice,
    speakResponse,
    pausePlayback,
    stopPlayback,
  } = useChatVoice(user?.$id);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
    null,
  );
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(`chat-${Date.now()}`);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  const OPENROUTER_API_URL =
    process.env.EXPO_PUBLIC_OPENROUTER_API_URL?.trim() ||
    "https://openrouter.ai/api/v1";
  const OPENROUTER_TEXT_MODEL =
    process.env.EXPO_PUBLIC_OPENROUTER_MODEL?.trim() ||
    "google/gemini-3-flash-preview";
  const OPENROUTER_IMAGE_MODEL =
    process.env.EXPO_PUBLIC_OPENROUTER_IMAGE_MODEL?.trim() ||
    "google/gemini-3-pro-preview";
  const REQUEST_TIMEOUT_MS = 90000;
  const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
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
      if (!user?.$id) return "I can't access your medication data right now.";
      return await getFormattedTodayMedicationSummary(user.$id);
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

  const buildConversationMessages = (
    latestUserMessage: string,
  ): ChatMessage[] => {
    const history: ChatMessage[] = messages.slice(-8).map((msg) => ({
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

  const getImageBase64 = async (uri: string) => {
    try {
      let base64String = "";

      if (Platform.OS === "web") {
        const response = await fetch(uri);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const blob = await response.blob();

        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("FileReader parsing failed"));
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const split = dataUrl.split(",");
            if (split.length < 2) reject(new Error("Invalid Base64 format"));
            resolve(split[1]);
          };
          reader.readAsDataURL(blob);
        });
      } else {
        base64String = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      if (!base64String || base64String.length % 4 !== 0) {
        throw new Error("Invalid or incomplete Base64 string");
      }

      return base64String;
    } catch (error) {
      console.error("Failed to get Base64:", error);
      throw error;
    }
  };

  const compressImage = async (image: SelectedImage) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        image.uri,
        [{ resize: { width: 1024 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      return {
        uri: manipulated.uri,
        mimeType: "image/jpeg",
      } as SelectedImage;
    } catch {
      return image;
    }
  };

  const prepareImageForUpload = async (image: SelectedImage) => {
    const maxRetry = 4;
    const qualitySteps = [0.8, 0.7, 0.6, 0.5];
    const widthSteps = [1024, 896, 768, 640];

    for (let i = 0; i < maxRetry; i += 1) {
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          image.uri,
          [{ resize: { width: widthSteps[i] } }],
          {
            compress: qualitySteps[i],
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );

        const info = await FileSystem.getInfoAsync(manipulated.uri, {
          size: true,
        });
        if (!info.exists || !info.size) {
          continue;
        }

        if (info.size <= MAX_IMAGE_BYTES) {
          return {
            uri: manipulated.uri,
            mimeType: "image/jpeg",
          } as SelectedImage;
        }
      } catch (error) {
        console.warn(`Image compression attempt ${i + 1} failed`, error);
      }
    }

    throw new Error("Image still exceeds 1.5MB after compression.");
  };

  const callOpenRouterAPI = async (
    userMessage: string,
    image?: SelectedImage | null,
    allowImageFallback = true,
  ): Promise<string> => {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

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

    if (!OPENROUTER_API_KEY) {
      return "I'm ready to chat freely, but the AI key isn't configured yet. Please add EXPO_PUBLIC_OPENROUTER_API_KEY to enable full conversation.";
    }

    const preparedImage = image ? await prepareImageForUpload(image) : null;
    const resolvedModel = preparedImage
      ? OPENROUTER_IMAGE_MODEL
      : OPENROUTER_TEXT_MODEL;
    const baseMessages = buildConversationMessages(userMessage);
    const messagesPayload: ChatMessage[] = preparedImage
      ? baseMessages.slice(0, -1).concat({
          role: "user",
          content: [
            { type: "text", text: userMessage },
            {
              type: "image_url",
              image_url: {
                url: `data:${preparedImage.mimeType};base64,${await getImageBase64(
                  preparedImage.uri,
                )}`,
                detail: "high",
              },
            },
          ],
        })
      : baseMessages;

    const payload = {
      model: resolvedModel,
      messages: messagesPayload,
      max_tokens: 1000,
      temperature: 0.7,
    };

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort();
        }, REQUEST_TIMEOUT_MS);

        const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://elderly-care-app.local",
            "X-Title": "elderly-care-app",
            "X-OpenRouter-Enable-Multimodal": "true",
          },
          signal: abortControllerRef.current?.signal,
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        clearTimeout(timeoutId);

        if (response.ok) {
          const data: OpenRouterResponse = rawText ? JSON.parse(rawText) : {};
          const content = data.choices?.[0]?.message?.content;
          if (!content) {
            throw new Error(
              data.error?.message || "No response from OpenRouter API",
            );
          }

          if (typeof content === "string") {
            return content;
          }

          const textParts = content
            .map((part) => (part.type === "text" ? part.text : ""))
            .filter(Boolean);

          if (textParts.length > 0) {
            return textParts.join("\n");
          }

          throw new Error("No response from OpenRouter API");
        }

        const errorData: OpenRouterResponse = rawText
          ? JSON.parse(rawText)
          : {};

        const providerMessage =
          errorData?.error?.message ||
          (rawText ? rawText.slice(0, 300) : "Provider returned error");

        if (response.status === 401) {
          throw new Error("Authentication failed. Please check your API key.");
        }

        if (response.status === 429) {
          lastError = new Error(
            providerMessage ||
              "Rate limit reached. Please wait a moment and try again.",
          );

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
          lastError = new Error("Request timed out. Please try again.");
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
        return await callOpenRouterAPI(userMessage, null, false);
      } catch {
        // fall through to surface the original error
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("API request failed unexpectedly.");
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
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const compressed = await compressImage({
          uri: asset.uri,
          mimeType: asset.mimeType || "image/jpeg",
        });
        setSelectedImage(compressed);
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
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const compressed = await compressImage({
          uri: asset.uri,
          mimeType: asset.mimeType || "image/jpeg",
        });
        setSelectedImage(compressed);
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
    setSelectedImage(
      messageToEdit.imageUri
        ? { uri: messageToEdit.imageUri, mimeType: "image/jpeg" }
        : null,
    );
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
      imageUri: selectedImage?.uri,
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
      const aiResponse =
        localResponse ??
        (await callOpenRouterAPI(messageForAPI, selectedImage));

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      // Auto-speak AI response if voice is enabled
      if (voiceEnabled && aiResponse) {
        speakResponse(aiResponse).catch(() => {});
      }
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

        {/* Voice toggle button */}
        <TouchableOpacity
          onPress={isSpeaking ? stopPlayback : toggleVoice}
          style={[
            styles.voiceToggleButton,
            {
              backgroundColor: voiceEnabled
                ? theme.colors.primaryContainer
                : theme.colors.surfaceVariant,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={voiceEnabled ? "Voice on" : "Voice off"}
        >
          <MaterialCommunityIcons
            name={
              isSpeaking
                ? "stop-circle"
                : voiceEnabled
                  ? "volume-high"
                  : "volume-off"
            }
            size={20}
            color={
              voiceEnabled
                ? theme.colors.primary
                : theme.colors.onSurfaceVariant
            }
          />
          <Text
            style={[
              styles.voiceToggleText,
              {
                color: voiceEnabled
                  ? theme.colors.primary
                  : theme.colors.onSurfaceVariant,
              },
            ]}
          >
            {isSpeaking ? "Stop" : voiceEnabled ? "Voice On" : "Voice Off"}
          </Text>
        </TouchableOpacity>

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
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
            <Text
              style={[
                styles.suggestionsToggle,
                { color: theme.colors.primary },
              ]}
            >
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
        style={[
          styles.inputContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{ uri: selectedImage.uri }}
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
  voiceToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 2,
    minWidth: 50,
    minHeight: 36,
  },
  voiceToggleText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: "600",
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
