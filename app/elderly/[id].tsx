import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Text, useTheme } from 'react-native-paper';

export default function ElderlyDetailPage() {
    const { id } = useLocalSearchParams();
    const theme = useTheme();
    const router = useRouter();

    // 在真实应用中可根据 id 获取服务端数据；这里用占位内容
    const sample = {
        id,
        name: `Elderly #${id}`,
        age: 75,
        phone: '+86 138-1234-5678',
        notes: 'No special notes.'
    };

    const handleCall = (phone?: string) => {
        if (!phone) {
            Alert.alert('No phone number');
            return;
        }
        const url = `tel:${phone}`;
        Linking.canOpenURL(url).then((s) => s ? Linking.openURL(url) : Alert.alert('Cannot call'));
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <Card>
                <Card.Title title={sample.name} subtitle={`ID: ${sample.id}`} left={(props) => <Avatar.Text {...props} label={sample.name.substring(0,2)} />} />
                <Card.Content>
                    <Text variant="bodyMedium">Age: {sample.age}</Text>
                    <Text variant="bodyMedium">Phone: {sample.phone}</Text>
                    <Text variant="bodyMedium" style={{ marginTop: 8 }}>{sample.notes}</Text>
                </Card.Content>
                <Card.Actions>
                    <Button mode="outlined" onPress={() => handleCall(sample.phone)}>Call</Button>
                    <Button onPress={() => router.push(`/health-data?elderlyId=${id}` as any)}>Health Data</Button>
                    <Button onPress={() => router.back()}>Back</Button>
                </Card.Actions>
            </Card>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 12 },
});
