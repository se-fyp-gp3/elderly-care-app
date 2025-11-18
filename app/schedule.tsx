import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

export default function SchedulePage() {
    const theme = useTheme();
    const router = useRouter();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <Card>
                <Card.Title title="Schedule" />
                <Card.Content>
                    <Text variant="bodyMedium">This is a placeholder schedule page. You can integrate calendar or appointments here.</Text>
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
