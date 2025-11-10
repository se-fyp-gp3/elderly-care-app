import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, DataTable, Text, useTheme } from 'react-native-paper';

export default function HealthDataPage() {
    const { elderlyId } = useLocalSearchParams();
    const theme = useTheme();
    const router = useRouter();

    // 示例健康数据
    const records = [
        { time: '2025-11-11 09:00', type: 'Blood Pressure', value: '120/78 mmHg' },
        { time: '2025-11-11 12:00', type: 'Heart Rate', value: '72 bpm' },
        { time: '2025-11-10 20:00', type: 'Medication', value: 'Evening med taken' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <Card style={styles.card}>
                <Card.Title title="Health Data" subtitle={`Elderly ID: ${elderlyId ?? '—'}`} />
                <Card.Content>
                    <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Latest measurements and logs</Text>

                    <DataTable>
                        <DataTable.Header>
                            <DataTable.Title>Time</DataTable.Title>
                            <DataTable.Title>Type</DataTable.Title>
                            <DataTable.Title>Value</DataTable.Title>
                        </DataTable.Header>
                        {records.map((r, i) => (
                            <DataTable.Row key={i}>
                                <DataTable.Cell>{r.time}</DataTable.Cell>
                                <DataTable.Cell>{r.type}</DataTable.Cell>
                                <DataTable.Cell>{r.value}</DataTable.Cell>
                            </DataTable.Row>
                        ))}
                    </DataTable>
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
    card: { marginTop: 8 },
});
