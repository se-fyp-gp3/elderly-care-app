import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Share, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, DataTable, Text, TextInput, useTheme } from 'react-native-paper';

type HealthRecord = {
    time: string;
    type: string;
    value: string;
    note?: string;
};

export default function HealthDataPage() {
    const { elderlyId } = useLocalSearchParams();
    const theme = useTheme();
    const router = useRouter();
    // 示例健康数据
    const [records, setRecords] = React.useState<HealthRecord[]>([
        { time: '2025-11-11 09:00', type: 'Blood Pressure', value: '120/78 mmHg' },
        { time: '2025-11-11 12:00', type: 'Heart Rate', value: '72 bpm' },
        { time: '2025-11-10 20:00', type: 'Medication', value: 'Evening med taken' },
    ]);

    const [filterRange, setFilterRange] = React.useState<'24h'|'7d'|'30d'|'all'>('all');
    const [searchType, setSearchType] = React.useState('');
    const [newNote, setNewNote] = React.useState('');

    const now = React.useMemo(() => new Date(), []);

    const filteredRecords = React.useMemo(() => {
        const cutoff = (() => {
            if (filterRange === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            if (filterRange === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (filterRange === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return new Date(0);
        })();

        return records.filter(r => {
            const t = new Date(r.time);
            if (isNaN(t.getTime())) return true; // keep if cannot parse
            if (t < cutoff) return false;
            if (searchType && !r.type.toLowerCase().includes(searchType.toLowerCase())) return false;
            return true;
        }).sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    }, [records, filterRange, searchType, now]);

    // Pagination / virtual list settings
    const PAGE_SIZE = 10;
    const [page, setPage] = React.useState(1);
    const pagedRecords = React.useMemo(() => filteredRecords.slice(0, page * PAGE_SIZE), [filteredRecords, page]);
    const hasMore = pagedRecords.length < filteredRecords.length;

    const loadMore = () => {
        if (hasMore) setPage(p => p + 1);
    };

    // 简单摘要：最新血压 & 心率（如果存在）
    const summary = React.useMemo(() => {
        const latestByType: Record<string, HealthRecord | undefined> = {};
        for (const r of records) {
            const key = r.type;
            if (!latestByType[key] || new Date(r.time) > new Date(latestByType[key]!.time)) latestByType[key] = r;
        }
        return latestByType;
    }, [records]);

    const handleAddNote = () => {
        if (!newNote.trim()) return;
        const rec: HealthRecord = { time: new Date().toISOString().slice(0,16).replace('T',' '), type: 'Note', value: newNote.trim() };
        setRecords(prev => [rec, ...prev]);
        setNewNote('');
    };

    const handleExport = async () => {
        try {
            await Share.share({ message: JSON.stringify({ elderlyId, records }, null, 2) });
        } catch (e) {
            console.warn('Export failed', e);
        }
    };

    const getTypeColor = (type: string) => {
        switch ((type || '').toLowerCase()) {
            case 'blood pressure': return '#2196F3';
            case 'heart rate': return '#F44336';
            case 'medication': return '#4CAF50';
            case 'note': return '#9E9E9E';
            default: return '#607D8B';
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <Card style={styles.card}>
                <Card.Title title="Health Data" subtitle={`Elderly ID: ${elderlyId ?? '—'}`} />
                <Card.Content>
                    {/* Summary row */}
                    <View style={[styles.summaryRow, { marginBottom: 12 }]}> 
                        <View style={[styles.summaryItem, { backgroundColor: theme.colors.surface, borderRadius: 8 }]}> 
                            <Text variant="titleMedium">Latest BP</Text>
                            <Text variant="bodyLarge">{summary['Blood Pressure']?.value ?? '—'}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceDisabled }}>{summary['Blood Pressure']?.time ?? ''}</Text>
                        </View>
                        <View style={[styles.summaryItem, { backgroundColor: theme.colors.surface, borderRadius: 8 }]}> 
                            <Text variant="titleMedium">Latest HR</Text>
                            <Text variant="bodyLarge">{summary['Heart Rate']?.value ?? '—'}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceDisabled }}>{summary['Heart Rate']?.time ?? ''}</Text>
                        </View>
                        <View style={[styles.summaryItem, { backgroundColor: theme.colors.surface, borderRadius: 8 }]}> 
                            <Text variant="titleMedium">Records</Text>
                            <Text variant="bodyLarge">{records.length}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceDisabled }}>{filteredRecords.length} shown</Text>
                        </View>
                    </View>

                    {/* Filters */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8, gap: 8 }}>
                        <Chip compact mode={filterRange==='24h'?'flat':'outlined'} onPress={() => setFilterRange('24h')}>24h</Chip>
                        <Chip compact mode={filterRange==='7d'?'flat':'outlined'} onPress={() => setFilterRange('7d')}>7d</Chip>
                        <Chip compact mode={filterRange==='30d'?'flat':'outlined'} onPress={() => setFilterRange('30d')}>30d</Chip>
                        <Chip compact mode={filterRange==='all'?'flat':'outlined'} onPress={() => setFilterRange('all')}>All</Chip>
                        <View style={{ flex: 1 }} />
                        <Button onPress={handleExport}>Export</Button>
                    </View>

                    <TextInput label="Filter by type" value={searchType} onChangeText={setSearchType} style={{ marginBottom: 8 }} />

                    <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Latest measurements and logs</Text>

                    <DataTable>
                        <DataTable.Header>
                            <DataTable.Title style={{ flex: 2 }}>Time</DataTable.Title>
                            <DataTable.Title style={{ flex: 2 }}>Type</DataTable.Title>
                            <DataTable.Title style={{ flex: 3 }}>Value / Note</DataTable.Title>
                        </DataTable.Header>

                        {/* Virtualized list using FlatList with client-side pagination */}
                        <FlatList
                            data={pagedRecords}
                            keyExtractor={(_, idx) => String(idx)}
                            onEndReached={loadMore}
                            onEndReachedThreshold={0.5}
                            ListFooterComponent={() => hasMore ? (
                                <View style={{ padding: 8, alignItems: 'center' }}>
                                    <Button onPress={loadMore}>Load more</Button>
                                </View>
                            ) : null}
                            renderItem={({ item: r }) => (
                                <DataTable.Row style={styles.dataRow}>
                                    <DataTable.Cell style={{ flex: 2 }}>{r.time}</DataTable.Cell>
                                    <DataTable.Cell style={{ flex: 2 }}>
                                        <View style={styles.typeBadge}>
                                            <View style={[styles.typeDot, { backgroundColor: getTypeColor(r.type) }]} />
                                            <Text style={styles.typeText}>{r.type}</Text>
                                        </View>
                                    </DataTable.Cell>
                                    <DataTable.Cell style={{ flex: 3 }}>{r.value}{r.note ? ` — ${r.note}` : ''}</DataTable.Cell>
                                </DataTable.Row>
                            )}
                            style={{ maxHeight: 420 }}
                        />
                    </DataTable>

                    {/* 添加备注 */}
                    <View style={{ marginTop: 12 }}>
                        <TextInput label="Add quick note" value={newNote} onChangeText={setNewNote} mode="outlined" />
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                            <Button mode="contained" onPress={handleAddNote}>Add Note</Button>
                        </View>
                    </View>
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
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryItem: { flex: 1, padding: 8, alignItems: 'flex-start' },
    dataRow: { paddingVertical: 6 },
    typeBadge: { flexDirection: 'row', alignItems: 'center' },
    typeDot: { width: 10, height: 10, borderRadius: 6, marginRight: 8 },
    typeText: { fontSize: 14 },
});
