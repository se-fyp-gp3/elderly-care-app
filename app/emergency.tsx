import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

export default function EmergencyPage() {
    const theme = useTheme();
    const router = useRouter();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <Card>
                <Card.Title title="Emergency Notifications" />
                <Card.Content>
                    <Text variant="bodyMedium">Emergency contact and notification center. Use this page to broadcast alerts or view recent emergencies.</Text>
                </Card.Content>
                <Card.Actions>
                    <Button onPress={() => router.back()}>Back</Button>
                </Card.Actions>
            </Card>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 12 },
});
