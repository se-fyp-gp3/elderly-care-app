import { useAuth } from "@/lib/auth-context";
import { speakText, stopCurrentPlayback } from "@/lib/azureTTS";
import { useChatVoice } from "@/lib/hooks/useChatVoice";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
    ActivityIndicator,
    Button,
    Card,
    List,
    Menu,
    Switch,
    Text,
    useTheme,
} from "react-native-paper";

export default function ElderlySettings() {
  const { user, preferences, updatePreferences, signOut } = useAuth();
  const theme = useTheme();
  const [notifications, setNotifications] = React.useState(
    preferences.notifications ?? true,
  );

  // Voice broadcast settings
  const {
    voiceEnabled,
    selectedVoiceId,
    availableVoices,
    toggleVoice,
    selectVoice,
  } = useChatVoice(user?.$id);

  const [voiceMenuVisible, setVoiceMenuVisible] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
    null,
  );

  const selectedVoiceLabel = React.useMemo(() => {
    if (!selectedVoiceId) return "Default Voice (System)";
    const found = availableVoices.find((v) => v.voice_id === selectedVoiceId);
    return found ? `${found.caregiver_name}'s Voice` : "Custom Voice";
  }, [selectedVoiceId, availableVoices]);

  const handlePreviewVoice = async (voiceId: string | null) => {
    try {
      await stopCurrentPlayback();
      setPreviewingVoiceId(voiceId);
      await speakText({
        text: "Hello! This is a voice preview. 你好，这是语音预览。",
        voiceId: voiceId ?? undefined,
      });
    } catch {
      // ignore preview errors
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    setNotifications(value);
    await updatePreferences({ ...preferences, notifications: value });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          Settings
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          Customize your app experience
        </Text>
      </View>

      {/* Notifications */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Notifications
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Push Notifications"
          description="Receive medication and appointment reminders"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="bell"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <Switch
              value={notifications}
              onValueChange={handleNotificationToggle}
            />
          )}
        />
      </Card>

      {/* Display */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Display
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Font Size"
          description={preferences.fontSize || "Medium"}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="format-size"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          )}
        />
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <List.Item
          title="Voice Tone"
          description={preferences.voiceTone || "Friendly"}
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-voice"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          )}
        />
      </Card>

      {/* Voice Broadcast */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Voice Broadcast
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Voice Broadcast"
          description={
            voiceEnabled
              ? "AI responses will be read aloud"
              : "AI responses are text only"
          }
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name={voiceEnabled ? "volume-high" : "volume-off"}
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
          right={() => (
            <Switch value={voiceEnabled} onValueChange={toggleVoice} />
          )}
        />
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.outlineVariant },
          ]}
        />
        <Menu
          visible={voiceMenuVisible}
          onDismiss={() => setVoiceMenuVisible(false)}
          anchor={
            <List.Item
              title="Voice Selection"
              description={selectedVoiceLabel}
              onPress={() => setVoiceMenuVisible(true)}
              left={() => (
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons
                    name="microphone-settings"
                    size={24}
                    color={theme.colors.primary}
                  />
                </View>
              )}
              right={() => (
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={24}
                  color={theme.colors.onSurfaceVariant}
                />
              )}
            />
          }
        >
          <Menu.Item
            onPress={() => {
              selectVoice(null);
              setVoiceMenuVisible(false);
            }}
            title="Default Voice (System)"
            leadingIcon={!selectedVoiceId ? "check" : undefined}
          />
          {availableVoices.map((voice) => (
            <Menu.Item
              key={voice.voice_id}
              onPress={() => {
                selectVoice(voice.voice_id);
                setVoiceMenuVisible(false);
              }}
              title={`${voice.caregiver_name}'s Voice`}
              leadingIcon={
                selectedVoiceId === voice.voice_id ? "check" : undefined
              }
            />
          ))}
        </Menu>

        {/* Voice preview list */}
        {availableVoices.length > 0 && (
          <>
            <View
              style={[
                styles.divider,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
            <View style={styles.voicePreviewSection}>
              <Text
                variant="labelMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginBottom: 8,
                  marginLeft: 16,
                }}
              >
                Preview Custom Voices
              </Text>
              {availableVoices.map((voice) => (
                <View key={voice.voice_id} style={styles.voicePreviewRow}>
                  <MaterialCommunityIcons
                    name="account-voice"
                    size={20}
                    color={theme.colors.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {voice.caregiver_name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handlePreviewVoice(voice.voice_id)}
                    disabled={previewingVoiceId !== null}
                    style={[
                      styles.previewButton,
                      {
                        backgroundColor: theme.colors.primaryContainer,
                      },
                    ]}
                  >
                    {previewingVoiceId === voice.voice_id ? (
                      <ActivityIndicator size={16} />
                    ) : (
                      <MaterialCommunityIcons
                        name="play"
                        size={18}
                        color={theme.colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
      </Card>

      {/* Account */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Account
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="Role"
          description="Elderly"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="account-heart"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
        />
      </Card>

      {/* Info */}
      <Card
        style={[
          styles.infoCard,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Card.Content>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons
              name="information"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="titleSmall"
              style={{ marginLeft: 8, color: theme.colors.onPrimaryContainer }}
            >
              Need Help?
            </Text>
          </View>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onPrimaryContainer, marginTop: 8 }}
          >
            Contact your caregiver if you need help with any settings or have
            questions about the app.
          </Text>
        </Card.Content>
      </Card>

      {/* Settings Options */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <List.Item
          title="About App"
          description="Version 1.0.0"
          left={() => (
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="information"
                size={24}
                color={theme.colors.primary}
              />
            </View>
          )}
        />
      </Card>

      <Button
        mode="contained"
        onPress={signOut}
        style={styles.logoutButton}
        contentStyle={styles.logoutButtonContent}
        icon="logout"
        buttonColor={theme.colors.error}
      >
        Sign Out
      </Button>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  infoCard: {
    borderRadius: 12,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButton: {
    marginTop: 24,
    borderRadius: 12,
  },
  logoutButtonContent: {
    height: 48,
  },
  voicePreviewSection: {
    paddingVertical: 8,
  },
  voicePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomSpacer: {
    height: 32,
  },
});
