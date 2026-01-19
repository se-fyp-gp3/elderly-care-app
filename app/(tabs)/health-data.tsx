import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useMemo } from 'react';
import { Dimensions, FlatList, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card, Chip, IconButton, Surface, Text, TextInput, useTheme } from 'react-native-paper';

type HealthRecord = {
    id: string;
    time: string;
    type: string;
    value: string;
    numericValue?: number; // Helper for charts
    secondValue?: number; // Helper for BP (diastolic)
    note?: string;
};

export default function HealthDataPage() {
    const { elderlyId, elderlyName } = useLocalSearchParams();
    const theme = useTheme();
    const router = useRouter();
    const navigation = useNavigation();
    
    // Header Customization
    useLayoutEffect(() => {
        navigation.setOptions({
            headerTitle: '',
            headerLeft: () => (
                <TouchableOpacity 
                    onPress={() => router.navigate('/caregiver')} 
                    style={{ marginLeft: 10, flexDirection: 'row', alignItems: 'center' }}
                >
                    <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.onSurface} />
                    <Text style={{ marginLeft: 5, fontSize: 16 }}>Back</Text>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <IconButton icon="share-variant" onPress={handleExport} />
            )
        });
    }, [navigation, router, theme]);

    const [records, setRecords] = React.useState<HealthRecord[]>([
        { id: '1', time: '2025-11-11 09:00', type: 'Blood Pressure', value: '120/78 mmHg', numericValue: 120, secondValue: 78 },
        { id: '2', time: '2025-11-11 12:00', type: 'Heart Rate', value: '72 bpm', numericValue: 72 },
        { id: '3', time: '2025-11-10 20:00', type: 'Medication', value: 'Evening med taken' },
        { id: '4', time: '2025-11-10 08:30', type: 'Blood Pressure', value: '118/75 mmHg', numericValue: 118, secondValue: 75 },
        { id: '5', time: '2025-11-09 09:15', type: 'Blood Pressure', value: '122/80 mmHg', numericValue: 122, secondValue: 80 },
    ]);

    const [filterRange, setFilterRange] = React.useState<'24h'|'7d'|'30d'|'all'>('all');
    const [searchType, setSearchType] = React.useState('');
    const [newNote, setNewNote] = React.useState('');

    const now = React.useMemo(() => new Date('2025-11-11T13:00:00'), []); // Mock 'now' for consistent demo

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

    // Prepare Chart Data (Blood Pressure focus)
    const chartData = useMemo(() => {
        const bpRecords = records
            .filter(r => r.type === 'Blood Pressure' && r.numericValue)
            .sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime())
            .slice(-6); // Last 6 records

        if (bpRecords.length === 0) return null;

        return {
            labels: bpRecords.map(r => r.time.split(' ')[1]), // Just time
            datasets: [
                {
                    data: bpRecords.map(r => r.numericValue || 0),
                    color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`, // Blue for Systolic
                    strokeWidth: 2
                },
                {
                    data: bpRecords.map(r => r.secondValue || 0),
                    color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`, // Green for Diastolic
                    strokeWidth: 2
                }
            ],
            legend: ["Systolic", "Diastolic"]
        };
    }, [records]);

    const handleAddNote = () => {
        if (!newNote.trim()) return;
        const rec: HealthRecord = { 
            id: Date.now().toString(),
            time: new Date().toISOString().slice(0,16).replace('T',' '), 
            type: 'Note', 
            value: newNote.trim() 
        };
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
            case 'blood pressure': return '#2196F3'; // Blue
            case 'heart rate': return '#F44336'; // Red
            case 'medication': return '#4CAF50'; // Green
            case 'note': return '#FF9800'; // Orange
            default: return '#607D8B'; // Grey
        }
    };

    const getTypeIcon = (type: string) => {
        switch ((type || '').toLowerCase()) {
            case 'blood pressure': return 'heart-pulse';
            case 'heart rate': return 'heart-flash';
            case 'medication': return 'pill';
            case 'note': return 'note-text-outline';
            default: return 'chart-timeline-variant';
        }
    };

    // Render Components
    const renderSummaryCard = (title: string, value: string, sub: string, icon: string, color: string) => (
        <Surface style={styles.statCard} elevation={1}>
            <View style={[styles.statIconBadge, { backgroundColor: color + '20' }]}>
                <MaterialCommunityIcons name={icon as any} size={24} color={color} />
            </View>
            <View>
                <Text variant="labelMedium" style={{ color: theme.colors.secondary }}>{title}</Text>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{value}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceDisabled }}>{sub}</Text>
            </View>
        </Surface>
    );

    const renderRecordItem = ({ item }: { item: HealthRecord }) => (
        <View style={styles.timelineItem}>
            <View style={styles.timelineLeft}>
                <Text style={styles.timeText}>{item.time.split(' ')[1]}</Text>
                <Text style={styles.dateText}>{item.time.split(' ')[0]}</Text>
            </View>
            <View style={styles.timelineCenter}>
                <View style={styles.timelineLine} />
                <View style={[styles.timelineDot, { backgroundColor: getTypeColor(item.type) }]} />
            </View>
            <Surface style={styles.recordCard} elevation={0}>
                <View style={[styles.recordHeader, { borderLeftColor: getTypeColor(item.type), borderLeftWidth: 4 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.recordType}>{item.type}</Text>
                        <Text style={styles.recordValue}>{item.value}</Text>
                    </View>
                    <MaterialCommunityIcons name={getTypeIcon(item.type) as any} size={20} color={getTypeColor(item.type)} style={{ opacity: 0.5 }} />
                </View>
            </Surface>
        </View>
    );

    const latestBP = records.find(r => r.type === 'Blood Pressure')?.value || '—';
    const latestHR = records.find(r => r.type === 'Heart Rate')?.value || '—';

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
            <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
                {/* Header Title Area */}
                <View style={styles.pageHeader}>
                    <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>Health Data</Text>
                    {elderlyName ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <MaterialCommunityIcons name="account-circle" size={24} color={theme.colors.primary} style={{ marginRight: 6 }} />
                            <Text variant="titleMedium">{decodeURIComponent(elderlyName as string)}</Text>
                            {elderlyId && <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.outline }}>#{elderlyId}</Text>}
                        </View>
                    ) : (
                        elderlyId && <Chip icon="account" style={{ alignSelf: 'flex-start', marginTop: 4 }}>ID: {elderlyId}</Chip>
                    )}
                </View>

                {/* Summary Statistics */}
                <View style={styles.statsRow}>
                    {renderSummaryCard('Blood Pressure', latestBP, 'Latest', 'heart-pulse', '#2196F3')}
                    {renderSummaryCard('Heart Rate', latestHR, 'Latest', 'heart-flash', '#F44336')}
                </View>

                {/* Chart Section */}
                {chartData && (
                    <Card style={styles.chartCard}>
                        <Card.Title title="BP Trends (Last 6)" left={(props) => <MaterialCommunityIcons {...props} name="chart-line" />} />
                        <Card.Content style={{ alignItems: 'center' }}>
                            <LineChart
                                data={chartData}
                                width={Dimensions.get("window").width - 64} // from react-native
                                height={220}
                                yAxisLabel=""
                                yAxisSuffix=""
                                chartConfig={{
                                    backgroundColor: theme.colors.surface,
                                    backgroundGradientFrom: theme.colors.surface,
                                    backgroundGradientTo: theme.colors.surface,
                                    decimalPlaces: 0,
                                    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                    style: { borderRadius: 16 },
                                    propsForDots: { r: "4", strokeWidth: "2", stroke: "#ffa726" }
                                }}
                                bezier
                                style={{ marginVertical: 8, borderRadius: 16 }}
                            />
                        </Card.Content>
                    </Card>
                )}

                {/* Filters */}
                <View style={styles.filterSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                        {['all', '24h', '7d', '30d'].map((range) => (
                            <Chip 
                                key={range} 
                                selected={filterRange === range} 
                                onPress={() => setFilterRange(range as any)}
                                style={styles.filterChip}
                                showSelectedOverlay
                            >
                                {range.toUpperCase()}
                            </Chip>
                        ))}
                    </ScrollView>
                </View>

                {/* Records List */}
                <View style={styles.listSection}>
                    <Text variant="titleMedium" style={styles.sectionTitle}>Activity Log</Text>
                    <FlatList
                        data={filteredRecords}
                        renderItem={renderRecordItem}
                        keyExtractor={item => item.id}
                        scrollEnabled={false} // Let parent ScrollView handle scrolling
                    />
                </View>
            </ScrollView>

            {/* Quick Note Input - Fixed at bottom */}
            <Surface style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]} elevation={4}>
                <TextInput 
                    mode="outlined" 
                    placeholder="Add a quick note..." 
                    value={newNote}
                    onChangeText={setNewNote}
                    style={{ flex: 1, backgroundColor: theme.colors.surface }}
                    right={<TextInput.Icon icon="send" disabled={!newNote.trim()} onPress={handleAddNote} />}
                    dense
                />
            </Surface>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pageHeader: { padding: 20, paddingBottom: 10 },
    statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    statIconBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    chartCard: { marginHorizontal: 16, borderRadius: 16, marginBottom: 20 },
    filterSection: { marginBottom: 10 },
    filterChip: { marginRight: 8 },
    listSection: { paddingHorizontal: 16 },
    sectionTitle: { marginBottom: 12, fontWeight: 'bold' },
    
    // Timeline Styles
    timelineItem: { flexDirection: 'row', marginBottom: 0 },
    timelineLeft: { width: 60, alignItems: 'flex-end', paddingRight: 10, paddingTop: 14 },
    timeText: { fontWeight: 'bold', fontSize: 13 },
    dateText: { fontSize: 10, color: '#888' },
    timelineCenter: { width: 20, alignItems: 'center' },
    timelineLine: { width: 2, flex: 1, backgroundColor: '#E0E0E0' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, position: 'absolute', top: 18, zIndex: 1 },
    recordCard: { flex: 1, marginBottom: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginLeft: 6 },
    recordHeader: { padding: 12, flexDirection: 'row', alignItems: 'center' },
    recordType: { fontSize: 12, color: '#666', marginBottom: 2 },
    recordValue: { fontSize: 15, fontWeight: '600' },
    
    inputContainer: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: 12, 
        paddingBottom: 24
    }
});
