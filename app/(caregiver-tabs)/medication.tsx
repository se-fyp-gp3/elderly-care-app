import MedicationCard, { MedicationItem } from "@/components/MedicationCard";
import { DATABASE_ID, ELDERLY_MEDICATION_TABLE_ID, tablesDB } from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import { ElderlyMedication, ElderlyMedicationStatus } from "@/types/appwrite";
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Query } from "react-native-appwrite";
import {
    Button,
    Card,
    Dialog,
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
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [dialogVisible, setDialogVisible] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [medicationsState, setMedicationsState] = useState<MedicationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            // 1. Get Caregiver & Linked Elderly
            const caregiver = await getCaregiverByUserId(user.$id);
            if (!caregiver) {
                setLoading(false);
                return;
            }

            const elderlyList = await getLinkedElderly(caregiver.$id);
            if (elderlyList.length === 0) {
                setMedicationsState([]);
                setLoading(false);
                return;
            }

            const elderlyIds = elderlyList.map(e => e.$id);

            // 2. Fetch Medication Records
            const response = await tablesDB.listRows<ElderlyMedication>({
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                queries: [
                    Query.equal('elderly', elderlyIds),
                    Query.limit(100)
                ]
            });

            // 3. Transform Data
            const mappedMeds: MedicationItem[] = response.rows.map(row => {
                // Resolve Elderly Name
                let elderlyName = "Unknown";
                if (Array.isArray(row.elderly) && row.elderly.length > 0) {
                    elderlyName = (row.elderly[0] as any).name || "Unknown";
                } else if (typeof row.elderly === 'object') {
                    elderlyName = (row.elderly as any).name || "Unknown";
                }
                
                // Resolve Medication Name & Unit
                let medName = "Unknown Drug";
                let medUnit = "";
                if (Array.isArray(row.medication) && row.medication.length > 0) {
                    const m = row.medication[0] as any;
                    medName = m.name || "Unknown";
                    medUnit = m.unit || "";
                }

                // Status Mapping (DB is Capitalized, UI expects lowercase)
                let status = (row.status || 'pending').toLowerCase();
                if (status === 'expired') status = 'overdue';

                return {
                    id: row.$id,
                    elderly: elderlyName,
                    name: medName,
                    dosage: `${row.dosage || '?'} ${medUnit}`.trim(),
                    frequency: row.frequency || '',
                    time: Array.isArray(row.approx_times) ? row.approx_times.join(', ') : (row.approx_times || ''),
                    status: status,
                    lastTaken: row.last_taken ? new Date(row.last_taken).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never',
                    notes: row.notes || ''
                };
            });

            setMedicationsState(mappedMeds);

        } catch (err) {
            console.error("Error fetching medications", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();

        (async () => {
            try {
                const { status } = await Notifications.getPermissionsAsync();
                if (status !== 'granted') {
                    await Notifications.requestPermissionsAsync();
                }

                if (Platform.OS === 'android') {
                    await Notifications.setNotificationChannelAsync('default', {
                        name: 'default',
                        importance: Notifications.AndroidImportance.MAX,
                        vibrationPattern: [0, 250, 250, 250],
                        lightColor: '#FF231F7C',
                    });
                }
            } catch (e) {
                console.warn('Notification permission request failed', e);
            }
        })();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

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

    const onConfirmTaking = async (medId: string) => {
        try {
            await tablesDB.updateRow({
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                rowId: medId,
                data: {
                    status: ElderlyMedicationStatus.COMPLETED,
                    last_taken: new Date().toISOString(),
                    notes: noteText
                }
            });

            // Optimistic update
            setMedicationsState(prev => prev.map(m => {
                if (m.id === medId) {
                    return { 
                        ...m, 
                        status: 'completed', 
                        lastTaken: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 
                        notes: noteText 
                    };
                }
                return m;
            }));
            
            setDialogVisible(null);
            setNoteText('');
        } catch (err) {
            console.error("Error updating medication", err);
            Alert.alert("Error", "Failed to update medication status.");
        }
    };

    const onRemindLater = (medId: string) => {
        (async () => {
            try {
                const { status } = await Notifications.getPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission required', 'Please enable notifications to receive reminders.');
                    return;
                }

                const med = medicationsState.find(m => m.id === medId);
                const title = 'Medication reminder';
                const body = med ? `Please check medication for ${med.elderly}: ${med.name}` : 'Please check medication';

                await Notifications.scheduleNotificationAsync({
                    content: { title, body, data: { medId } },
                    trigger: { type: 'timeInterval', seconds: 5, repeats: false } as any,
                });

                Alert.alert('Reminder set', 'Notification will appear in 5 seconds.');
            } catch (e: any) {
                console.warn('Failed to schedule notification', e);
                const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
                if (isExpoGo) {
                    Alert.alert('Not Supported', 'Notifications are not supported in Expo Go on Android (SDK 53+). Please use a Development Build.');
                } else {
                    Alert.alert('Error', 'Unable to schedule reminder.');
                }
            }
        })();
    };

    const onMarkProcessed = async (medId: string) => {
        // Alias for Confirm Taking without notes
        try {
            await tablesDB.updateRow({
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                rowId: medId,
                data: {
                    status: ElderlyMedicationStatus.COMPLETED,
                    last_taken: new Date().toISOString()
                }
            });
            
            setMedicationsState(prev => prev.map(m => {
                if (m.id === medId) {
                    return { ...m, status: 'completed', lastTaken: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) };
                }
                return m;
            }));
        } catch (err) {
             Alert.alert("Error", "Failed to update status.");
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
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

                    {filteredMeds.length === 0 ? (
                        <View style={{ alignItems: 'center', marginTop: 20 }}>
                            <Text style={{ color: theme.colors.outline }}>No medication records found.</Text>
                        </View>
                    ) : (
                        filteredMeds.map((med) => (
                            <MedicationCard
                                key={med.id}
                                med={med as MedicationItem}
                                onConfirmPress={(m) => { setDialogVisible(m.id); setNoteText(m.notes || ''); }}
                                onRemind={onRemindLater}
                                onMarkProcessed={onMarkProcessed}
                            />
                        ))
                    )}
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
});// styles.medicationCard and others below have been moved to components/MedicationCard.tsx
    // Keeping only what's necessary for the current file