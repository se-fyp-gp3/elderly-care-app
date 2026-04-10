import { useAuth } from "@/lib/auth-context";
import {
  createChatSession,
  deleteChatSession,
  listChatSessionsForUser,
  updateChatSession,
} from "@/lib/chat";
import {
  buildScheduleSummary,
  fetchElderlySchedulesForUser,
} from "@/lib/elderly";
import { getFormattedTodayMedicationSummary } from "@/lib/medication_tracking";
import { synthesizePersonalVoice } from "@/lib/personal-voice";
import { formatSearchResultsForContext, searchWeb, shouldSearch } from "@/lib/search";
import type { ChatSession as AppwriteChatSession } from "@/types/appwrite";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
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
  Chip,
  IconButton,
  Menu,
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

interface AIAPIResponse {
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { user, preferences, updatePreferences } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
    null,
  );
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [chatHistory, setChatHistory] = useState<AppwriteChatSession[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [isVoiceSynthesizing, setIsVoiceSynthesizing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [langMenuVisible, setLangMenuVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const aiVoicePlayerRef = useRef<AudioPlayer | null>(null);

  const aiVoiceEnabled = preferences.aiVoiceEnabled === true;
  const selectedVoiceId =
    typeof preferences.aiVoiceId === "string" ? preferences.aiVoiceId : "";

  const stopAiVoicePlayback = useCallback(() => {
    if (aiVoicePlayerRef.current) {
      try {
        aiVoicePlayerRef.current.pause();
      } catch {}
      aiVoicePlayerRef.current.remove();
      aiVoicePlayerRef.current = null;
    }
    setIsVoiceSpeaking(false);
  }, []);

  const speakAiResponse = useCallback(
    async (text: string) => {
      if (!aiVoiceEnabled || !selectedVoiceId) return;
      if (!text.trim()) return;

      const plainText = text.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!plainText) return;

      try {
        stopAiVoicePlayback();
        setIsVoiceSynthesizing(true);
        setVoiceError(null);

        const synthesized = await synthesizePersonalVoice(
          plainText,
          selectedVoiceId,
        );

        let audioSourceUri: string | null = null;

        if (synthesized.audioUrl) {
          audioSourceUri = synthesized.audioUrl;
        } else if (synthesized.audioBase64) {
          const tempUri = `${FileSystem.cacheDirectory}ai-voice-${Date.now()}.mp3`;
          await FileSystem.writeAsStringAsync(
            tempUri,
            synthesized.audioBase64,
            {
              encoding: FileSystem.EncodingType.Base64,
            },
          );
          audioSourceUri = tempUri;
        }

        if (!audioSourceUri) {
          throw new Error("No playable audio source from TTS.");
        }

        await setAudioModeAsync({ playsInSilentMode: true });
        const player = createAudioPlayer(audioSourceUri);
        aiVoicePlayerRef.current = player;
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) {
            setIsVoiceSpeaking(false);
            player.remove();
            if (aiVoicePlayerRef.current === player) {
              aiVoicePlayerRef.current = null;
            }
          }
        });
        player.play();
        setIsVoiceSpeaking(true);
      } catch (error) {
        console.warn("AI voice playback failed:", error);
        const reason =
          error instanceof Error && error.message
            ? error.message
            : "Voice playback failed.";
        setVoiceError(reason);
        setIsVoiceSpeaking(false);
      } finally {
        setIsVoiceSynthesizing(false);
      }
    },
    [aiVoiceEnabled, selectedVoiceId, stopAiVoicePlayback],
  );

  const handleToggleAiVoice = useCallback(async () => {
    if (!aiVoiceEnabled && !selectedVoiceId) {
      Alert.alert(
        "No voice selected",
        "Please select a caregiver voice in Settings first.",
      );
      return;
    }

    const nextValue = !aiVoiceEnabled;
    await updatePreferences({
      ...preferences,
      aiVoiceEnabled: nextValue,
    });

    if (!nextValue) {
      stopAiVoicePlayback();
      setVoiceError(null);
    }
  }, [aiVoiceEnabled, preferences, stopAiVoicePlayback, updatePreferences]);

  const LANG_OPTIONS = [
    { key: "cantonese", label: "粵語" },
    { key: "mandarin", label: "普通話" },
    { key: "english", label: "English" },
  ] as const;

  const voiceReplyLang = (
    typeof preferences.voiceReplyLang === "string"
      ? preferences.voiceReplyLang
      : "cantonese"
  ) as string;

  const currentLangLabel =
    LANG_OPTIONS.find((o) => o.key === voiceReplyLang)?.label ?? "粵語";

  const handleLangChange = useCallback(
    async (lang: string) => {
      setLangMenuVisible(false);
      await updatePreferences({ ...preferences, voiceReplyLang: lang });
    },
    [preferences, updatePreferences],
  );

  useEffect(() => {
    return () => {
      stopAiVoicePlayback();
    };
  }, [stopAiVoicePlayback]);

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

  const deserializeMessages = (json: string): Message[] => {
    try {
      const arr = JSON.parse(json) as Array<{
        id: string;
        text: string;
        isUser: boolean;
        timestamp: string;
        imageUri?: string;
      }>;
      return arr.map((m) => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: new Date(m.timestamp),
        imageUri: m.imageUri,
      }));
    } catch {
      return [];
    }
  };

  const loadHistory = useCallback(async () => {
    if (!user?.$id) return;
    try {
      const sessions = await listChatSessionsForUser(user.$id);
      setChatHistory(sessions);
    } catch (e) {
      console.warn("Failed to load chat history", e);
    }
  }, [user?.$id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY?.trim();
  const DASHSCOPE_API_URL = process.env.EXPO_PUBLIC_DASHSCOPE_API_URL?.trim();
  const DASHSCOPE_TEXT_MODEL = process.env.EXPO_PUBLIC_DASHSCOPE_MODEL?.trim();
  const DASHSCOPE_IMAGE_MODEL =
    process.env.EXPO_PUBLIC_DASHSCOPE_IMAGE_MODEL?.trim();
  const REQUEST_TIMEOUT_MS = 90000;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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

  const { t } = useTranslation();

  const quickSuggestions = useMemo(
    () => [
      t("chat.questionMedicine"),
      t("chat.questionSchedule"),
      t("chat.questionUnwell"),
      t("chat.questionPhotoMedId"),
    ],
    [t],
  );

  const tryHandleLocalDataRequest = async (userMessage: string) => {
    const lower = userMessage.toLowerCase();

    if (
      lower.includes("medicine") ||
      lower.includes("medication") ||
      lower.includes("pill")
    ) {
      if (!user?.$id) return "I can't access your medication data right now.";
      const lang = voiceReplyLang === "cantonese" ? "yue" : voiceReplyLang === "mandarin" ? "zh" : "en";
      return await getFormattedTodayMedicationSummary(user.$id, lang as "yue" | "zh" | "en");
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

    const langInstruction =
      voiceReplyLang === "cantonese"
        ? "You MUST reply in 香港粵語 (Hong Kong Cantonese written Chinese). Use informal Cantonese written style."
        : voiceReplyLang === "mandarin"
          ? "You MUST reply in 普通話 (Mandarin Chinese, simplified or traditional)."
          : "You MUST reply in English.";

    return [
      {
        role: "system",
        content:
          `You are a helpful AI care assistant for elderly users. Provide clear, compassionate, and helpful responses about health, medication, and wellness. Always remind users to consult healthcare professionals for serious concerns.\n\nIMPORTANT: Keep your response concise — no more than 80 words. Be brief and to the point.\n\n${langInstruction}\n\nWhen the user's message contains [SEARCH RESULTS], you MUST base your answer strictly on those results. Do NOT make up or guess information — only use facts from the provided search data. Summarize the key points for the elderly user in a caring tone.\n\nYou also have a special ability: when the user sends a photo of medication (pills, tablets, capsules, medicine boxes, prescription labels, etc.), you should identify the medication in the image. Provide the medication name, common uses, dosage information, and any important warnings or side effects. If you are not confident in your identification, clearly state that and advise the user to consult a pharmacist or doctor.`,
      },
      ...history,
      {
        role: "user",
        content: latestUserMessage,
      },
    ];
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

  const prepareImageForUpload = async (
    image: SelectedImage,
  ): Promise<{ uri: string; mimeType: string; base64: string }> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      image.uri,
      [{ resize: { width: 1024 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );

    if (!manipulated.base64) {
      throw new Error("Failed to encode image to base64");
    }

    return {
      uri: manipulated.uri,
      mimeType: "image/jpeg",
      base64: manipulated.base64,
    };
  };

  const callAIAPI = async (
    userMessage: string,
    image?: SelectedImage | null,
    allowImageFallback = true,
    hasSearchContext = false,
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

    if (!DASHSCOPE_API_KEY) {
      return "I'm ready to chat freely, but the AI key isn't configured yet. Please add EXPO_PUBLIC_DASHSCOPE_API_KEY to enable full conversation.";
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
      max_tokens: 200,
      temperature: hasSearchContext ? 0.2 : 0.7,
    };

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort();
        }, REQUEST_TIMEOUT_MS);

        const response = await fetch(`${DASHSCOPE_API_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
          },
          signal: abortControllerRef.current?.signal,
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        clearTimeout(timeoutId);

        if (response.ok) {
          const data: AIAPIResponse = rawText ? JSON.parse(rawText) : {};
          const content = data.choices?.[0]?.message?.content;
          if (!content) {
            throw new Error(data.error?.message || "No response from AI API");
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

          throw new Error("No response from AI API");
        }

        const errorData: AIAPIResponse = rawText ? JSON.parse(rawText) : {};

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
        return await callAIAPI(userMessage, null, false);
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

  const saveCurrentChatToHistory = async () => {
    if (messages.length === 0 || !user?.$id) return;

    const titleSource = messages.find((msg) => msg.isUser)?.text;
    const title = titleSource ? titleSource.slice(0, 40) : "New chat";
    const serialized = serializeMessages(messages);

    try {
      if (currentChatId) {
        // Update existing session
        const updated = await updateChatSession(currentChatId, {
          title,
          messages: serialized,
        });
        setChatHistory((prev) =>
          prev.map((c) => (c.$id === currentChatId ? updated : c)),
        );
      } else {
        // Create new session
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
    } catch (e) {
      console.warn("Failed to delete chat session", e);
    }
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
      let messageForAPI: string;
      if (selectedImage) {
        const userText = userMessage.text;
        const isMedQuery =
          /識藥|识药|medication|medicine|pill|藥|药|capsule|tablet/i.test(
            userText,
          );
        messageForAPI = isMedQuery
          ? `${userText}\n[User has shared a photo of medication. Please identify the medication, including its name, common uses, dosage, and any important warnings or side effects. Respond in the same language the user used.]`
          : `${userText}\n[User has shared an image]`;
      } else {
        messageForAPI = userMessage.text;
      }

      const localResponse = await tryHandleLocalDataRequest(messageForAPI);

      // Selective search: only search when toggle is on AND query looks like it needs web info
      let searchContext = "";
      let rawSearchResponse: Awaited<ReturnType<typeof searchWeb>> | null = null;
      if (searchEnabled && !localResponse && !selectedImage && shouldSearch(userMessage.text)) {
        try {
          rawSearchResponse = await searchWeb(userMessage.text);
          searchContext = formatSearchResultsForContext(rawSearchResponse);
        } catch (e) {
          console.warn("Search failed, proceeding without:", e);
        }
      }

      if (rawSearchResponse) {
        console.log('[Search] Raw response:', JSON.stringify({
          hasAiOverview: !!rawSearchResponse.aiOverview?.text,
          aiOverviewText: rawSearchResponse.aiOverview?.text ?? '(none)',
          aiOverviewRefs: rawSearchResponse.aiOverview?.references ?? [],
          answerBoxType: rawSearchResponse.answerBox?.type ?? '(none)',
          answerBox: rawSearchResponse.answerBox ?? '(none)',
          hasKG: !!rawSearchResponse.knowledgeGraph?.description,
          knowledgeGraph: rawSearchResponse.knowledgeGraph ?? '(none)',
          resultsCount: rawSearchResponse.results?.length ?? 0,
          results: rawSearchResponse.results?.map(r => ({ title: r.title, snippet: r.snippet })) ?? [],
        }, null, 2));
      }
      if (searchContext) {
        console.log('[Search] Formatted context for AI (full):\n', searchContext);
      } else if (searchEnabled && shouldSearch(userMessage.text)) {
        console.log('[Search] No search context produced — search may have returned empty results');
      }

      const finalMessage = searchContext
        ? `${messageForAPI}\n\n[SEARCH RESULTS — you MUST base your answer ONLY on these facts. Do NOT add, guess, or invent any information not found below:]\n${searchContext}\n[END SEARCH RESULTS]\n\nUsing ONLY the search results above, answer the user's question concisely.`
        : messageForAPI;

      console.log('[AI] Final message to model (full):\n', finalMessage);

      // Start AI call; fire TTS in parallel once we get the response
      const hasSearch = searchContext.length > 0;
      const aiResponsePromise = localResponse
        ? Promise.resolve(localResponse)
        : callAIAPI(finalMessage, selectedImage, true, hasSearch);

      const aiResponse = await aiResponsePromise;

      console.log('[AI] Model reply (full):', aiResponse);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };

      // Update UI and start TTS in parallel (don't await TTS)
      setMessages((prev) => [...prev, aiMessage]);
      void speakAiResponse(aiResponse);
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

  // Auto-save after each AI response
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

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageRow,
        item.isUser ? styles.userMessageRow : styles.aiMessageRow,
      ]}
    >
      {!item.isUser && (
        <Avatar.Icon
          size={44}
          icon="robot"
          style={[
            styles.avatarAI,
            { backgroundColor: isDark ? "rgba(76,175,80,0.15)" : "#E8F5E9" },
          ]}
        />
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
                { color: item.isUser ? "#FFFFFF" : theme.colors.onSurface },
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
      <View
        style={[
          styles.topBar,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <IconButton
          icon="history"
          size={28}
          onPress={openHistory}
          style={[
            styles.topBarButton,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
          iconColor={theme.colors.onSurface}
        />
        <View style={styles.topBarSpacer} />
        <IconButton
          icon={aiVoiceEnabled ? "volume-high" : "volume-off"}
          size={24}
          onPress={handleToggleAiVoice}
          style={[
            styles.topBarButton,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
          iconColor={theme.colors.onSurface}
        />
        {aiVoiceEnabled && (
          <Menu
            visible={langMenuVisible}
            onDismiss={() => setLangMenuVisible(false)}
            anchor={
              <Chip
                icon="translate"
                onPress={() => setLangMenuVisible(true)}
                style={styles.langChip}
                textStyle={styles.langChipText}
                compact
              >
                {currentLangLabel}
              </Chip>
            }
          >
            {LANG_OPTIONS.map((opt) => (
              <Menu.Item
                key={opt.key}
                title={opt.label}
                onPress={() => handleLangChange(opt.key)}
                leadingIcon={voiceReplyLang === opt.key ? "check" : undefined}
              />
            ))}
          </Menu>
        )}
        <IconButton
          icon={searchEnabled ? "magnify" : "magnify-close"}
          size={24}
          onPress={() => setSearchEnabled((prev) => !prev)}
          style={[
            styles.topBarButton,
            searchEnabled && { backgroundColor: "#E3F2FD" },
          ]}
          iconColor={searchEnabled ? "#1565C0" : theme.colors.onSurface}
        />
        <IconButton
          icon="plus"
          size={28}
          onPress={startNewChat}
          style={[
            styles.topBarButton,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
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
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: isDark ? "rgba(21,101,192,0.1)" : "#F0F7FF" },
            ]}
          >
            <ActivityIndicator animating={true} color={theme.colors.primary} />
            <Text
              style={[
                styles.loadingText,
                { color: isDark ? "#64B5F6" : "#1565C0" },
              ]}
            >
              AI is thinking...
            </Text>
          </View>
        )}

        {(isVoiceSynthesizing || isVoiceSpeaking) && (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: isDark ? "rgba(21,101,192,0.1)" : "#F0F7FF" },
            ]}
          >
            <ActivityIndicator animating={true} color={theme.colors.primary} />
            <Text
              style={[
                styles.loadingText,
                { color: isDark ? "#64B5F6" : "#1565C0" },
              ]}
            >
              {isVoiceSynthesizing ? "Generating voice..." : "Playing voice..."}
            </Text>
          </View>
        )}

        {voiceError && (
          <View
            style={[
              styles.voiceErrorContainer,
              { backgroundColor: isDark ? "rgba(183,28,28,0.12)" : "#FFEBEE" },
            ]}
          >
            <Text style={styles.voiceErrorText} numberOfLines={3}>
              Voice error: {voiceError}
            </Text>
            <IconButton
              icon="close"
              size={18}
              onPress={() => setVoiceError(null)}
              iconColor="#B71C1C"
              style={styles.voiceErrorClose}
            />
          </View>
        )}
      </View>

      {/* Quick suggestions */}
      <View
        style={[
          styles.suggestionsContainer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.suggestionsHeaderRow}>
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("chat.quickQuestions")}
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
              {isSuggestionsExpanded ? t("chat.showLess") : t("chat.showMore")}
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
                  if (suggestion.includes("拍照識藥")) {
                    setInputText("請幫我識別這個藥物的名稱、用途和注意事項。");
                    handleImageOptions();
                  } else {
                    setInputText(suggestion);
                  }
                }}
              >
                <Card.Content style={styles.suggestionContent}>
                  <Text variant="bodyMedium">{suggestion}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
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
          <View
            style={[
              styles.inputPill,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            <IconButton
              icon="camera"
              size={24}
              onPress={handleImageOptions}
              style={styles.photoButton}
              iconColor={theme.colors.onSurfaceVariant}
            />
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={t("chat.typeMessage")}
              mode="flat"
              style={styles.textInput}
              contentStyle={styles.textInputContent}
              multiline
              maxLength={500}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
            />
          </View>
          <IconButton
            icon="send"
            size={24}
            onPress={sendMessage}
            disabled={(!inputText.trim() && !selectedImage) || isLoading}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  (!inputText.trim() && !selectedImage) || isLoading
                    ? theme.colors.surfaceVariant
                    : "#1565C0",
              },
            ]}
            iconColor="#FFFFFF"
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
          <Pressable
            style={[
              styles.historyModal,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              variant="titleMedium"
              style={[styles.historyTitle, { color: theme.colors.onSurface }]}
            >
              Chat History
            </Text>
            <FlatList
              data={chatHistory}
              keyExtractor={(item) => item.$id}
              renderItem={({ item }) => (
                <Card
                  style={[
                    styles.historyCard,
                    { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                  onPress={() => loadChatFromHistory(item)}
                >
                  <Card.Content style={styles.historyCardContent}>
                    <View style={styles.historyCardRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="titleSmall">{item.title}</Text>
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.historyMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {new Date(item.$updatedAt).toLocaleString()}
                        </Text>
                      </View>
                      <IconButton
                        icon="delete-outline"
                        size={20}
                        onPress={() => handleDeleteChat(item.$id)}
                        iconColor="#EF4444"
                        style={{ margin: 0 }}
                      />
                    </View>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.historyEmpty,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  No previous chats yet.
                </Text>
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
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E8ECF0",
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
    backgroundColor: "#F3F4F6",
    width: 44,
    height: 44,
  },
  langChip: {
    marginHorizontal: 4,
    height: 36,
  },
  langChipText: {
    fontSize: 13,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesListContent: {
    paddingTop: 20,
    paddingBottom: 12,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 16,
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
    marginRight: 10,
    backgroundColor: "#E8F5E9",
  },
  avatarUser: {
    marginLeft: 10,
    backgroundColor: "#1565C0",
  },
  messageBubbleContainer: {
    maxWidth: "75%",
    flexShrink: 1,
  },
  messageCard: {
    borderRadius: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  userMessage: {
    backgroundColor: "#1565C0",
    borderBottomRightRadius: 6,
  },
  aiMessage: {
    backgroundColor: "#F8F9FA",
    borderBottomLeftRadius: 6,
  },
  messageContent: {
    padding: 12,
  },
  messageImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 17,
    lineHeight: 25,
  },
  timestamp: {
    fontSize: 12,
    marginTop: 6,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#F0F7FF",
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: "500",
    color: "#1565C0",
  },
  voiceErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFEBEE",
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  voiceErrorText: {
    flex: 1,
    color: "#B71C1C",
    fontSize: 13,
    lineHeight: 18,
  },
  voiceErrorClose: {
    margin: 0,
  },
  inputContainer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8ECF0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 28,
    paddingLeft: 2,
    paddingRight: 8,
    minHeight: 52,
  },
  photoButton: {
    margin: 0,
    width: 44,
    height: 44,
  },
  textInput: {
    backgroundColor: "transparent",
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    fontSize: 17,
    paddingHorizontal: 0,
  },
  textInputContent: {
    paddingVertical: 10,
    minHeight: 48,
  },
  sendButton: {
    margin: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  imagePreviewContainer: {
    position: "relative",
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "rgba(0,0,0,0.6)",
    margin: 0,
  },
  suggestionsContainer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E8ECF0",
  },
  suggestionsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  suggestionsToggle: {
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  suggestionCard: {
    borderRadius: 24,
    elevation: 1,
  },
  suggestionContent: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  historyModal: {
    width: "100%",
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  historyTitle: {
    marginBottom: 16,
    color: "#1F2937",
    fontWeight: "bold",
  },
  historyCard: {
    marginBottom: 10,
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    elevation: 1,
  },
  historyMeta: {
    color: "#6B7280",
    marginTop: 4,
  },
  historyCardContent: {
    paddingVertical: 8,
  },
  historyCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyEmpty: {
    textAlign: "center",
    paddingVertical: 24,
    color: "#9CA3AF",
    fontSize: 16,
  },
  imagePreviewModal: {
    width: "100%",
    height: "70%",
    borderRadius: 20,
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
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
  },
});
