import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
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

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: false,
    }),
});

export default function MedicationManagement() {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [dialogVisible, setDialogVisible] = useState<number | null>(null);
    const [noteText, setNoteText] = useState('');
    const [medicationsState, setMedicationsState] = useState<any[]>([]);

    const STORAGE_KEY = '@medications_v1';

    const defaultMeds = [
        {
            id: 1,
            elderly: "Grandpa Zhang",
            name: "Antihypertensive medication",
            dosage: "1 tablet",
            frequency: "Twice a day",
            time: "08:00, 20:00",
            status: "completed",
            lastTaken: "Today 08:05",
            notes: ''
        },
        {
            id: 2,
            elderly: "Grandma Li",
            name: "Antidiabetic medication",
            dosage: "2 tablets",
            frequency: "3 times a day",
            time: "08:00, 12:00, 18:00",
            status: "pending",
            lastTaken: "Yesterday 18:30",
            notes: ''
        },
        {
            id: 3,
            elderly: "Grandpa Wang",
            name: "Vitamin",
            dosage: "1 tablet",
            frequency: "Once a day",
            time: "09:00",
            status: "overdue",
            lastTaken: "Yesterday 09:15",
            notes: ''
        },
    ];

    const filteredMeds = medicationsState.filter(med => {
        const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            med.elderly.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' || med.status === filter;
        return matchesSearch && matchesFilter;
    });

    const totalCount = medicationsState.length;
    const pendingCount = medicationsState.filter(m => m.status === 'pending').length;
    const completedCount = medicationsState.filter(m => m.status === 'completed').length;
    const overdueCount = medicationsState.filter(m => m.status === 'overdue').length;

    const saveMedsToStorage = async (meds: any[]) => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
        } catch (e) {
            console.warn('Failed to save meds', e);
        }
    };

    const loadMedsFromStorage = async () => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            if (raw) {
                setMedicationsState(JSON.parse(raw));
            } else {
                setMedicationsState(defaultMeds);
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultMeds));
            }
        } catch (e) {
            console.warn('Failed to load meds', e);
            setMedicationsState(defaultMeds);
        }
    };

    useEffect(() => {
        loadMedsFromStorage();

        (async () => {
            try {
                const { status } = await Notifications.getPermissionsAsync();
                if (status !== 'granted') {
                    await Notifications.requestPermissionsAsync();
                }
            } catch (e) {
                console.warn('Notification permission request failed', e);
            }
        })();
    }, []);

    const nowFormatted = () => {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `Today ${hh}:${mm}`;
    };

    const onConfirmTaking = async (medId: number) => {
        const updated = medicationsState.map(m => {
            if (m.id === medId) {
                return { ...m, status: 'completed', lastTaken: nowFormatted(), notes: noteText };
            }
            return m;
        });
        setMedicationsState(updated);
        await saveMedsToStorage(updated);
        setDialogVisible(null);
        setNoteText('');
    };

    const onRemindLater = (medId: number) => {
        (async () => {
            try {
                const { status } = await Notifications.getPermissionsAsync();
                let finalStatus = status;
                if (finalStatus !== 'granted') {
                    const { status: asked } = await Notifications.requestPermissionsAsync();
                    finalStatus = asked;
                }
                if (finalStatus !== 'granted') {
                    Alert.alert('Permission required', 'Please enable notifications to receive reminders.');
                    return;
                }

                const med = medicationsState.find(m => m.id === medId);
                const title = 'Medication reminder';
                const body = med ? `Please check medication for ${med.elderly}: ${med.name}` : 'Please check medication';

                const identifier = await Notifications.scheduleNotificationAsync({
                    content: {
                        title,
                        body,
                        data: { medId },
                    },
                    trigger: { seconds: 10 * 60 } as any, // 10 minutes
                });

                const updated = medicationsState.map(m => m.id === medId ? { ...m, reminderId: identifier } : m);
                setMedicationsState(updated);
                await saveMedsToStorage(updated);

                Alert.alert('Reminder set', 'You will be reminded in 10 minutes.');
            } catch (e) {
                console.warn('Failed to schedule notification', e);
                Alert.alert('Error', 'Unable to schedule reminder.');
            }
        })();
    };

    const onMarkProcessed = async (medId: number) => {
        const updated = medicationsState.map(m => {
            if (m.id === medId) {
                return { ...m, status: 'completed', lastTaken: nowFormatted() };
            }
            return m;
        });
        setMedicationsState(updated);
        await saveMedsToStorage(updated);
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView>
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

                <View style={styles.section}>
                    <Card>
                        <Card.Content>
                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={styles.statNumber}>{totalCount}</Text>
                                    <Text variant="bodyMedium">Total drugs</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.pending]}>{pendingCount}</Text>
                                    <Text variant="bodyMedium">Pending</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.completed]}>{completedCount}</Text>
                                    <Text variant="bodyMedium">Completed</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.overdue]}>{overdueCount}</Text>
                                    <Text variant="bodyMedium">Expired</Text>
                                </View>
                            </View>
                        </Card.Content>
                    </Card>
                </View>

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
                                                onPress={() => { setDialogVisible(med.id); setNoteText(med.notes || ''); }}
                                            >
                                                Confirm taking
                                            </Button>
                                            <Button mode="outlined" compact onPress={() => onRemindLater(med.id)}>
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
                                        <Button mode="contained" compact style={styles.overdueButton} onPress={() => onMarkProcessed(med.id)}>
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

            <Portal>
                <Dialog visible={dialogVisible !== null} onDismiss={() => setDialogVisible(null)}>
                    <Dialog.Title>Confirm medication</Dialog.Title>
                    <Dialog.Content>
                        <Text>Please make sure the elderly have taken their medication on time.</Text>
                        <TextInput
                            label="Notes (optional)"
                            mode="outlined"
                            multiline
                            numberOfLines={3}
                            style={styles.dialogInput}
                            value={noteText}
                            onChangeText={setNoteText}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => { setDialogVisible(null); setNoteText(''); }}>Cancel</Button>
                        <Button onPress={() => { if (dialogVisible !== null) onConfirmTaking(dialogVisible); }}>Confirm completion</Button>
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