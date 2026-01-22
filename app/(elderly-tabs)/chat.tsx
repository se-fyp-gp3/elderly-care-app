import React, { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Avatar, Card, Text, TextInput, useTheme } from "react-native-paper";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function ElderlyChat() {
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! I'm your AI health assistant. How can I help you today?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "I understand. Let me help you with that. Is there anything specific you would like to know about your health or medications?",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 1000);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageContainer,
        item.isUser ? styles.userMessageContainer : styles.aiMessageContainer,
      ]}
    >
      {!item.isUser && (
        <Avatar.Icon
          size={36}
          icon="robot-happy-outline"
          style={{ backgroundColor: theme.colors.primary, marginRight: 8 }}
        />
      )}
      <Card
        style={[
          styles.messageCard,
          {
            backgroundColor: item.isUser
              ? theme.colors.primary
              : theme.colors.surfaceVariant,
          },
        ]}
      >
        <Card.Content>
          <Text
            style={{
              color: item.isUser
                ? theme.colors.onPrimary
                : theme.colors.onSurfaceVariant,
            }}
          >
            {item.text}
          </Text>
        </Card.Content>
      </Card>
      {item.isUser && (
        <Avatar.Icon
          size={36}
          icon="account"
          style={{ backgroundColor: theme.colors.secondary, marginLeft: 8 }}
        />
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
      />

      <View
        style={[
          styles.inputContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          style={styles.textInput}
          right={<TextInput.Icon icon="send" onPress={sendMessage} />}
          onSubmitEditing={sendMessage}
        />
      </View>

      {/* Quick suggestions */}
      <View
        style={[
          styles.suggestionsContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <Text
          variant="labelMedium"
          style={{ marginBottom: 8, color: theme.colors.onSurfaceVariant }}
        >
          Quick questions:
        </Text>
        <View style={styles.suggestionsRow}>
          {[
            "How do I take my medicine?",
            "When is my next appointment?",
            "I feel unwell",
          ].map((suggestion, index) => (
            <Card
              key={index}
              style={[
                styles.suggestionCard,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
              onPress={() => setInputText(suggestion)}
            >
              <Card.Content style={styles.suggestionContent}>
                <Text variant="bodySmall">{suggestion}</Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  userMessageContainer: {
    justifyContent: "flex-end",
  },
  aiMessageContainer: {
    justifyContent: "flex-start",
  },
  messageCard: {
    maxWidth: "70%",
    borderRadius: 16,
  },
  inputContainer: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  textInput: {
    backgroundColor: "transparent",
  },
  suggestionsContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
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
});
