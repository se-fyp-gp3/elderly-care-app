// components/ChatBox.tsx
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Avatar,
  Card,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  imageUri?: string;
}

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export default function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const theme = useTheme();

  const DEEPSEEK_API_KEY = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY?.trim();
  const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const USE_MOCK_MODE = true;

  useEffect(() => {
    const welcomeMessage: Message = {
      id: '1',
      text: "Hello! I'm your AI Care Assistant. 👋\n\nI'm here to help you with health information, medication reminders, and general wellness advice. How can I assist you today?",
      isUser: false,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);

    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'We need camera roll permissions to upload photos.');
        }
      }
    })();
  }, []);

  const callDeepSeekAPI = async (userMessage: string): Promise<string> => {
    if (USE_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const lowerMessage = userMessage.toLowerCase();

      if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return "Hello! I'm your AI Care Assistant. I'm here to help you with health-related questions, medication reminders, and wellness advice. What would you like to know?";
      } else if (lowerMessage.includes('medication') || lowerMessage.includes('medicine')) {
        return 'I can help you with medication information! For personalized medication advice, please consult with your healthcare provider. Would you like me to help you set up medication reminders?';
      } else if (lowerMessage.includes('health') || lowerMessage.includes('symptom')) {
        return "I'm here to provide general health information. However, for any serious health concerns or symptoms, please consult with a healthcare professional immediately. How can I assist you today?";
      } else if (lowerMessage.includes('emergency')) {
        return "⚠️ For medical emergencies, please call emergency services immediately (911 or your local emergency number). I'm an AI assistant and cannot provide emergency medical care.";
      } else {
        return `I understand you're asking about "${userMessage}". As your AI Care Assistant, I'm here to help with health information, medication tracking, and wellness support. Could you provide more details about what you'd like to know?`;
      }
    }

    if (!DEEPSEEK_API_KEY) {
      throw new Error('DeepSeek API key not configured.');
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful AI care assistant for elderly users. Provide clear, compassionate, and helpful responses about health, medication, and wellness. Always remind users to consult healthcare professionals for serious concerns.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your API key.');
      }
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: DeepSeekResponse = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from DeepSeek API');
    }

    return data.choices[0].message.content;
  };

  const handleImageOptions = () => {
    if (Platform.OS === 'web') {
      const choice = window.confirm('Click OK to take a photo, or Cancel to choose from gallery');
      if (choice) {
        takePhoto();
      } else {
        pickImage();
      }
    } else {
      Alert.alert(
        'Add Photo',
        'Choose an option',
        [
          {
            text: 'Take Photo',
            onPress: () => takePhoto(),
          },
          {
            text: 'Choose from Gallery',
            onPress: () => pickImage(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        { cancelable: true }
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
      console.error('Error picking image:', error);
      if (Platform.OS === 'web') {
        alert('Failed to pick image. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to pick image. Please try again.');
      }
    }
  };

  const takePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS === 'web') {
          alert('Camera permission is required to take photos.');
        } else {
          Alert.alert('Permission needed', 'Camera permission is required to take photos.');
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
      console.error('Error taking photo:', error);
      if (Platform.OS === 'web') {
        alert('Failed to take photo. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to take photo. Please try again.');
      }
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const sendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim() || '📷 [Image sent]',
      isUser: true,
      timestamp: new Date(),
      imageUri: selectedImage || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    // Dismiss keyboard
    Keyboard.dismiss();

    try {
      const messageForAPI = selectedImage
        ? `${userMessage.text}\n[User has shared an image]`
        : userMessage.text;

      const aiResponse = await callDeepSeekAPI(messageForAPI);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error calling DeepSeek API:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
                  if (Platform.OS === 'web') {
                    window.open(item.imageUri, '_blank');
                  } else {
                    Alert.alert('Image', 'Image preview');
                  }
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
                { color: item.isUser ? '#FFFFFF' : '#000000' },
              ]}
            >
              {item.text}
            </Text>
            <Text
              style={[
                styles.timestamp,
                {
                  color: item.isUser
                    ? 'rgba(255,255,255,0.8)'
                    : 'rgba(0,0,0,0.5)',
                },
              ]}
            >
              {item.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Card.Content>
        </Card>
      </View>

      {item.isUser && (
        <Avatar.Icon
          size={36}
          icon="account"
          style={styles.avatarUser}
        />
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : Platform.OS === 'android' ? 98 : 0}
    >
      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator animating={true} color={theme.colors.primary} />
            <Text style={styles.loadingText}>AI is thinking...</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  aiMessageRow: {
    justifyContent: 'flex-start',
  },
  avatarAI: {
    marginRight: 8,
    backgroundColor: '#E3F2FD',
  },
  avatarUser: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
  },
  messageBubbleContainer: {
    maxWidth: '75%',
    flexShrink: 1,
  },
  messageCard: {
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userMessage: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    backgroundColor: '#F5F5F5',
    borderBottomLeftRadius: 4,
  },
  messageContent: {
    padding: 8,
  },
  messageImage: {
    width: '100%',
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
    alignSelf: 'flex-end',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderTopColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  photoButton: {
    margin: 0,
    width: 48,
    height: 48,
  },
  // ... keep imagePreviewContainer, imagePreview, removeImageButton unchanged
  textInput: {
    flex: 1,
    backgroundColor: 'transparent',
    maxHeight: 120,
    minHeight: 56,
  },
  textInputContent: {
    paddingVertical: 14,
    minHeight: 56,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    margin: 0,
  },
});