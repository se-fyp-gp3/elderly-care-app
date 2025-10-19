// app/(tabs)/medication.tsx
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
    Button,
    Card,
    Chip,
    Dialog,
    IconButton,
    Portal,
    Searchbar,
    SegmentedButtons,
    Text,
    TextInput,
    useTheme
} from "react-native-paper";

export default function MedicationManagement() {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [dialogVisible, setDialogVisible] = useState(false);

    const medications = [
        {
            id: 1,
            elderly: "Grandpa Zhang",
            name: "Antihypertensive medication",
            dosage: "1 tablet",
            frequency: "Twice a day",
            time: "08:00, 20:00",
            status: "completed",
            lastTaken: "Today 08:05"
        },
        {
            id: 2,
            elderly: "Grandma Li",
            name: "Antidiabetic medication",
            dosage: "2 tablets",
            frequency: "3 times a day",
            time: "08:00, 12:00, 18:00",
            status: "pending",
            lastTaken: "Yesterday 18:30"
        },
        {
            id: 3,
            elderly: "Grandpa Wang",
            name: "Vitamin",
            dosage: "1 tablet",
            frequency: "Once a day",
            time: "09:00",
            status: "overdue",
            lastTaken: "Yesterday 09:15"
        },
    ];

    const filteredMeds = medications.filter(med => {
        const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            med.elderly.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' || med.status === filter;
        return matchesSearch && matchesFilter;
    });

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView>
                {/* 搜索和筛选 */}
                <View style={styles.header}>
                    <Searchbar
                        placeholder="Search for medicines or elderly..."
                        onChangeText={setSearchQuery}
                        value={searchQuery}
                        style={styles.searchbar}
                    />
                    <SegmentedButtons
                        value={filter}
                        onValueChange={setFilter}
                        buttons={[
                            { value: 'all', label: 'All' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'completed', label: 'Completed' },
                        ]}
                        style={styles.segmentedButtons}
                    />
                </View>

                {/* 用药统计 */}
                <View style={styles.section}>
                    <Card>
                        <Card.Content>
                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={styles.statNumber}>3</Text>
                                    <Text variant="bodyMedium">Total drugs</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.pending]}>1</Text>
                                    <Text variant="bodyMedium">Pending</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.completed]}>1</Text>
                                    <Text variant="bodyMedium">Completed</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.overdue]}>1</Text>
                                    <Text variant="bodyMedium">Expired</Text>
                                </View>
                            </View>
                        </Card.Content>
                    </Card>
                </View>

                {/* 用药列表 */}
                <View style={styles.section}>
                    <Text variant="titleLarge" style={styles.sectionTitle}>Today's medication plan</Text>

                    {filteredMeds.map((med) => (
                        <Card key={med.id} style={styles.medicationCard}>
                            <Card.Content>
                                <View style={styles.medHeader}>
                                    <View>
                                        <Text variant="titleMedium">{med.name}</Text>
                                        <Text variant="bodyMedium" style={styles.elderlyName}>
                                            {med.elderly}
                                        </Text>
                                    </View>
                                    <Chip
                                        mode="outlined"
                                        style={[
                                            styles.statusChip,
                                            med.status === 'completed' && styles.completedChip,
                                            med.status === 'overdue' && styles.overdueChip,
                                        ]}
                                        textStyle={
                                            med.status === 'completed' ? styles.completedText :
                                                med.status === 'overdue' ? styles.overdueText : undefined
                                        }
                                    >
                                        {med.status === 'completed' ? 'Completed' :
                                            med.status === 'pending' ? 'Pending' : 'Expired'}
                                    </Chip>
                                </View>

                                <View style={styles.medDetails}>
                                    <View style={styles.detailRow}>
                                        <MaterialCommunityIcons name="pill" size={16} />
                                        <Text variant="bodySmall">Dose: {med.dosage}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <MaterialCommunityIcons name="repeat" size={16} />
                                        <Text variant="bodySmall">Frequency: {med.frequency}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <MaterialCommunityIcons name="clock-outline" size={16} />
                                        <Text variant="bodySmall">Time: {med.time}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <MaterialCommunityIcons name="history" size={16} />
                                        <Text variant="bodySmall">Last taken: {med.lastTaken}</Text>
                                    </View>
                                </View>

                                <View style={styles.actionRow}>
                                    {med.status === 'pending' && (
                                        <>
                                            <Button
                                                mode="contained"
                                                compact
                                                onPress={() => setDialogVisible(true)}
                                            >
                                                Confirm taking
                                            </Button>
                                            <Button mode="outlined" compact>
                                                Remind me later
                                            </Button>
                                        </>
                                    )}
                                    {med.status === 'completed' && (
                                        <Button mode="outlined" compact disabled>
                                            Completed
                                        </Button>
                                    )}
                                    {med.status === 'overdue' && (
                                        <Button mode="contained" compact style={styles.overdueButton}>
                                            Mark Processed
                                        </Button>
                                    )}
                                    <IconButton
                                        icon="information-outline"
                                        size={20}
                                        onPress={() => console.log('check the details')}
                                    />
                                </View>
                            </Card.Content>
                        </Card>
                    ))}
                </View>
            </ScrollView>

            {/* 确认用药对话框 */}
            <Portal>
                <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
                    <Dialog.Title>Confirm medication</Dialog.Title>
                    <Dialog.Content>
                        <Text>Please make sure the elderly have taken their medication on time.</Text>
                        <TextInput
                            label="Notes (optional)"
                            mode="outlined"
                            multiline
                            numberOfLines={3}
                            style={styles.dialogInput}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
                        <Button onPress={() => setDialogVisible(false)}>Confirm completion</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 16,
    },
    searchbar: {
        marginBottom: 12,
    },
    segmentedButtons: {
        marginBottom: 8,
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    stat: {
        alignItems: 'center',
    },
    statNumber: {
        fontWeight: 'bold',
        color: '#2196F3',
    },
    pending: {
        color: '#FF9800',
    },
    completed: {
        color: '#4CAF50',
    },
    overdue: {
        color: '#F44336',
    },
    medicationCard: {
        marginBottom: 12,
    },
    medHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    elderlyName: {
        opacity: 0.7,
    },
    statusChip: {
        marginLeft: 8,
    },
    completedChip: {
        backgroundColor: '#E8F5E8',
    },
    overdueChip: {
        backgroundColor: '#FFEBEE',
    },
    completedText: {
        color: '#4CAF50',
    },
    overdueText: {
        color: '#F44336',
    },
    medDetails: {
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    overdueButton: {
        backgroundColor: '#F44336',
    },
    dialogInput: {
        marginTop: 12,
    },
});