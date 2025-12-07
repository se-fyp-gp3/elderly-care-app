import { useAuth } from "@/lib/auth-context";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, SegmentedButtons, Switch, Text, TextInput, useTheme } from "react-native-paper";

export default function Settings() {
  const { preferences, setPreference, updatePreferences } = useAuth();
  const theme = useTheme();
  
  const [newPreference, setNewPreference] = useState({
    key: '',
    value: ''
  });
  const [customPreferences, setCustomPreferences] = useState<Record<string, any>>({});

  const handleSetPreference = async (key: string, value: any) => {
    try {
      await setPreference(key, value);
    } catch (error) {
      console.error('Error setting preference:', error);
    }
  };

  const handleAddPreference = async () => {
    if (!newPreference.key.trim()) return;
    
    try {
      let parsedValue: any = newPreference.value;
      try {
        parsedValue = JSON.parse(newPreference.value);
      } catch {
      }
      
      await handleSetPreference(newPreference.key, parsedValue);
      setNewPreference({ key: '', value: '' });
      setCustomPreferences(prev => ({
        ...prev,
        [newPreference.key]: parsedValue
      }));
    } catch (error) {
      console.error('Error adding preference:', error);
    }
  };

  const handleRemovePreference = async (key: string) => {
    try {
      const newPrefs = { ...preferences };
      delete newPrefs[key];
      await updatePreferences(newPrefs);
    } catch (error) {
      console.error('Error removing preference:', error);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineSmall" style={styles.title}>
          User Settings
        </Text>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">User Roles</Text>
            <SegmentedButtons
              value={preferences.role || 'elderly'}
              onValueChange={(value) => setPreference('role', value)}
              buttons={[
                { value: 'elderly', label: 'elderly' },
                { value: 'caregiver', label: 'caregiver' },
              ]}
              style={styles.segmentedButtons}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Font size</Text>
            <SegmentedButtons
              value={preferences.fontSize || 'medium'}
              onValueChange={(value) => setPreference('fontSize', value)}
              buttons={[
                { value: 'small', label: 'small' },
                { value: 'medium', label: 'medium' },
                { value: 'large', label: 'large' },
              ]}
              style={styles.segmentedButtons}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">AI voice intonation</Text>
            <SegmentedButtons
              value={preferences.voiceTone || 'gentle'}
              onValueChange={(value) => setPreference('voiceTone', value)}
              buttons={[
                { value: 'gentle', label: 'gentle' },
                { value: 'friendly', label: 'friendly' },
                { value: 'professional', label: 'professional' },
              ]}
              style={styles.segmentedButtons}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.switchRow}>
              <Text variant="titleMedium">Push notifications</Text>
              <Switch
                value={preferences.notifications !== false}
                onValueChange={(value) => handleSetPreference('notifications', value)}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Add custom settings</Text>
            <TextInput
              label="Setting item name"
              value={newPreference.key}
              onChangeText={(text) => setNewPreference(prev => ({ ...prev, key: text }))}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Set value (JSON supported)"
              value={newPreference.value}
              onChangeText={(text) => setNewPreference(prev => ({ ...prev, value: text }))}
              mode="outlined"
              style={styles.input}
              multiline
            />
            <Button 
              mode="contained" 
              onPress={handleAddPreference}
              disabled={!newPreference.key.trim()}
            >
              Add Settings
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Current Settings</Text>
            {Object.entries(preferences).map(([key, value]) => (
              <View key={key} style={styles.preferenceItem}>
                <View style={styles.preferenceText}>
                  <Text variant="bodyMedium" style={styles.preferenceKey}>{key}:</Text>
                  <Text variant="bodyMedium" style={styles.preferenceValue}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </Text>
                </View>
                {!['role', 'fontSize', 'voiceTone', 'notifications'].includes(key) && (
                  <Button 
                    mode="outlined" 
                    compact
                    onPress={() => handleRemovePreference(key)}
                  >
                    delete
                  </Button>
                )}
              </View>
            ))}
            {Object.keys(preferences).length === 0 && (
              <Text style={styles.noPreferences}>No custom settings yet</Text>
            )}
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: 'center',
  },
  card: {
    marginBottom: 16,
  },
  segmentedButtons: {
    marginTop: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    marginBottom: 12,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  preferenceText: {
    flex: 1,
    flexDirection: 'row',
  },
  preferenceKey: {
    fontWeight: 'bold',
    marginRight: 8,
  },
  preferenceValue: {
    flex: 1,
  },
  noPreferences: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginVertical: 16,
  },
});