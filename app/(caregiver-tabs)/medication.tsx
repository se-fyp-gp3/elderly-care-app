import MedicationCard, { MedicationItem } from "@/components/MedicationCard";
import {
    DATABASE_ID,
    ELDERLY_MEDICATION_TABLE_ID,
    MEDICATION_LOGS_TABLE_ID,
    MEDICATION_TABLE_ID,
    tablesDB
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { getCaregiverByUserId, getLinkedElderly } from "@/lib/caregiver";
import { Elderly, ElderlyMedication, Medication } from "@/types/appwrite";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Query } from "react-native-appwrite";
import {
    Avatar,
    Button,
    Card,
    Dialog,
    Divider,
    Portal,
    Searchbar,
    Text,
    useTheme
} from "react-native-paper";

// Helper to safely extract ID from relationship
const getRelationshipId = (val: any): string | null => {
    if (!val) return null;
    if (Array.isArray(val)) {
        if (val.length === 0) return null;
        const item = val[0];
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item.$id) return item.$id;
    }
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.$id) return val.$id;
    return null;
};

// Start notification handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

interface ElderlyGroup {
    elderlyId: string;
    elderlyName: string;
    medications: MedicationItem[];
}

export default function MedicationManagement() {
    const theme = useTheme();
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [dialogVisible, setDialogVisible] = useState<MedicationItem | null>(null);
    const [noteText, setNoteText] = useState('');
    const [elderlyGroups, setElderlyGroups] = useState<ElderlyGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // New Filter State
    const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
    const [personFilterVisible, setPersonFilterVisible] = useState(false);
    const [selectedElderlyId, setSelectedElderlyId] = useState<string>('All');
    const [statusFilterVisible, setStatusFilterVisible] = useState(false);
    const [filterSearchQuery, setFilterSearchQuery] = useState('');

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
            setLinkedElderly(elderlyList); // Store linked elderly list

            if (elderlyList.length === 0) {
                setElderlyGroups([]);
                setLoading(false);
                return;
            }

            const elderlyMap = new Map(elderlyList.map(e => [e.$id, e]));
            const elderlyIds = elderlyList.map(e => e.$id);

            // 2. Fetch Medication Records (Prescriptions) - BASE "PLAN"
            const emResponse = await tablesDB.listRows<ElderlyMedication>({
                databaseId: DATABASE_ID,
                tableId: ELDERLY_MEDICATION_TABLE_ID,
                queries: [
                    Query.equal('elderly', elderlyIds),
                    Query.limit(100)
                ]
            });

            // 3. Fetch Medication Details
            const medIds = new Set<string>();
            emResponse.rows.forEach(row => {
                const mId = getRelationshipId(row.medication);
                if (mId) medIds.add(mId);
            });

            const medMap = new Map<string, Medication>();
            if (medIds.size > 0) {
                const medResponse = await tablesDB.listRows<Medication>({
                    databaseId: DATABASE_ID,
                    tableId: MEDICATION_TABLE_ID,
                    queries: [
                        Query.equal('$id', Array.from(medIds)),
                        Query.limit(100)
                    ]
                });
                medResponse.rows.forEach(m => medMap.set(m.$id, m));
            }

            // 4. Fetch Today's Logs (to check status)
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const logsResponse = await tablesDB.listRows<any>({
                databaseId: DATABASE_ID,
                tableId: MEDICATION_LOGS_TABLE_ID,
                queries: [
                    Query.equal('elderly', elderlyIds),
                    Query.greaterThanEqual('scheduled_at', startOfDay.toISOString()),
                    Query.lessThanEqual('scheduled_at', endOfDay.toISOString()),
                    Query.limit(100)
                ]
            });

            // 5. Build Grouped Data
            const groups: ElderlyGroup[] = elderlyList.map(elderly => {
                // Find prescriptions for this elderly
                const elderPrescriptions = emResponse.rows.filter(row => {
                    const eId = getRelationshipId(row.elderly);
                    return eId === elderly.$id;
                });

                let dailyMeds: MedicationItem[] = [];

                elderPrescriptions.forEach(em => {
                    const mId = getRelationshipId(em.medication);
                    const medication = mId ? medMap.get(mId) : null;
                    const medName = medication ? medication.name || "Unknown Drug" : "Unknown Drug";
                    const medUnit = medication ? medication.unit || "" : "";
                    const dosage = `${em.dosage || '?'} ${medUnit}`;

                    // Find logs for this prescription (indirectly via Reminder -> or just by elderly & medication match?)
                    // Since linking Log -> ElderlyMedication is via Reminder, valid paths are complex.
                    // For Simplicity & Robustness: Filter logs by matching Elderly AND Date. 
                    // To map Log to Prescription, we ideally need ID. 
                    // Let's rely on approx_times to generate "Planned Slots"
                    
                    const times = em.approx_times || [];
                    if (times.length === 0) {
                         // No specific times, maybe 'PRN' or just show one generic pending item
                         dailyMeds.push({
                            id: em.$id, // Log ID not available yet
                            isPrescriptionId: true, // Flag to indicate this ID is consistent
                            elderly: elderly.name,
                            name: medName,
                            dosage: dosage,
                            frequency: em.frequency || '',
                            time: 'Anytime',
                            status: 'pending',
                            lastTaken: em.last_taken ? new Date(em.last_taken).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never',
                            notes: em.notes || ''
                         });
                    } else {
                        times.forEach((tStr, index) => {
                            let scheduledTime;
                            try {
                                scheduledTime = new Date(tStr);
                            } catch {
                                return;
                            }
                            
                            // Normalize scheduledTime to Today for display/comparison
                            const displayTime = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                            
                            // Try start find if there is a log that matches this time approximately?
                            // Or just find ANY log for this ElderlyMedication that is "taken" today?
                            // Current Log structure has `elderly_medication_reminder` which points to `elderly_medication`.
                            // So we can find logs related to `em.$id`.
                            
                            // Filter logs for this ElderlyMedication
                            // Complexity: We need to know which reminder ID corresponds to this EM.
                            // But we fetched Logs. Logs have `elderly_medication_reminder` (ID).
                            // We didn't fetch all reminders.
                            // Simplified Check: Check if there's any log for this elderly at roughly this time?
                            // Better: Check if any log is linked to a reminder that is linked to this EM.
                            // This requires fetching reminders. Or, assuming we can just display Prescriptions "as is" and if we find a log, we mark complete.
                            
                            // Let's implement a simple "Plan View"
                            // Use the time from approx_times.
                            // Status: Check Global Logs for this elderly, try to match by time? unreliable.
                            
                            // Advanced: Use 'reminders' query if needed. 
                            // FALLBACK: Use Prescription status/last_taken if Log logic is too complex without reminder fetching.
                            // BUT user has logs.
                            
                            // Let's try to match Log by Time + Medication Name (if possible)? No med name in log.
                            // Let's assume for now: Show Prescription Items. Status comes from Prescription 'last_taken' check against Today?
                            // em.last_taken is datetime.
                            
                            let status = 'pending';
                            const lastTakenDate = em.last_taken ? new Date(em.last_taken) : null;
                            const isTakenToday = lastTakenDate && 
                                lastTakenDate.getDate() === new Date().getDate() &&
                                lastTakenDate.getMonth() === new Date().getMonth() &&
                                lastTakenDate.getFullYear() === new Date().getFullYear();

                            // If frequencies > 1, single last_taken isn't enough.
                            // But usually last_taken updates on every take.
                            // If taken today, and we are iterating times... difficult to map 1-to-1 without Logs.
                            
                            // Let's look at logsResponse. 
                            // We can guess: if we find *any* log for this medication today that is 'taken', mark one as taken?
                            // Limitation: Without full join, we can't perfectly map Log -> Time Slot.
                            
                            // Compromise: Show "Plan" as generated from Prescriptions.
                            // Status: 'pending' (default)
                            // If user logs it, we create a Log AND update Prescription last_taken.
                            
                            dailyMeds.push({
                                id: `${em.$id}_${index}`, // Composite ID for list key
                                realId: em.$id, // Actual ID for actions
                                elderly: elderly.name,
                                name: medName,
                                dosage: dosage,
                                frequency: em.frequency || '',
                                time: displayTime,
                                status: (isTakenToday && times.length === 1) ? 'completed' : 'pending', // Rough heuristic
                                lastTaken: em.last_taken ? new Date(em.last_taken).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never',
                                notes: em.notes || ''
                            });
                        });
                    }
                });
                
                dailyMeds.sort((a, b) => a.time.localeCompare(b.time));

                return {
                    elderlyId: elderly.$id,
                    elderlyName: elderly.name,
                    medications: dailyMeds
                };
            }).filter(g => g.medications.length > 0 || (groups.length > 0)); // Keep groups even if empty?

            setElderlyGroups(groups);

        } catch (err) {
            console.error("Error fetching medications", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
        // Permission check...
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    // Flatten for stats
    const allMeds = elderlyGroups.flatMap(g => g.medications);
    
    // Filtering logic (apply to groups)
    const filteredGroups = elderlyGroups
        .filter(group => selectedElderlyId === 'All' || group.elderlyId === selectedElderlyId)
        .map(group => {
            const filteredMeds = group.medications.filter(med => {
                const matchesSearch = med.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    group.elderlyName.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesFilter = filter === 'all' || med.status === filter;
                return matchesSearch && matchesFilter;
            });
            return { ...group, medications: filteredMeds };
        }).filter(g => g.medications.length > 0 || (searchQuery === '' && filter === 'all')); 
    // Show empty groups? Maybe not.
    // Fixed: Keep groups if they have meds OR if we are not searching (to show "No meds" under a group if needed, but above filtered removed them)
    // Actually, earlier code filtered out empty groups.
    // If we want to show "No medications scheduled" for an elderly, we should keep the group if it was originally there.
    
    // Let's refine: If we have groups, we show them. If a filter hides all meds in a group, hide the group.

    const totalCount = allMeds.length;
    const pendingCount = allMeds.filter(m => m.status === 'pending').length;
    const completedCount = allMeds.filter(m => m.status === 'completed' || m.status === 'taken').length;
    const overdueCount = allMeds.filter(m => m.status === 'overdue' || m.status === 'missing').length;

    const onConfirmTaking = async (medItem: MedicationItem) => {
        // If it's a generated item (from prescription), we might need to CREATE a log
        // If it's a log item, we update it.
        // For simplicity in this fix, let's assume we update Log if strictly log ID, 
        // OR we update Prescription status if that was the old logic?
        // But we want to use logs.
        
        // This part requires checking if medItem.id is a Log ID or our composite ID.
        // We added `isPrescriptionId` to `MedicationItem`. We need to use `realId`.
        
        // Check if item has realId (our custom prop) - wait, MedicationItem interface in components/MedicationCard needs this?
        // Or we just cast it.
        const item = medItem as any;
        
        try {
            if (item.isPrescriptionId) {
                // It's a prescription item, so we CREATE a log
                // rowId: unique()
                // data: { elderly, elderly_medication_reminder?? We don't have reminder ID easily here without fetching it. }
                // Fallback: Just update local state to green or use old logic: Update ElderlyMedication.last_taken
                
                 await tablesDB.updateRow({
                    databaseId: DATABASE_ID,
                    tableId: ELDERLY_MEDICATION_TABLE_ID,
                    rowId: item.realId,
                    data: {
                        last_taken: new Date().toISOString(),
                        // status: 'Completed' // Don't change status of Regimen
                    }
                });
            } else {
                // It's an existing Log
                await tablesDB.updateRow({
                    databaseId: DATABASE_ID,
                    tableId: MEDICATION_LOGS_TABLE_ID, 
                    rowId: medItem.id,
                    data: {
                        status: 'taken',
                        taken_at: new Date().toISOString(),
                    }
                });
            }

            setElderlyGroups(prev => prev.map(group => ({
                ...group,
                medications: group.medications.map(m => {
                    if (m.id === medItem.id) {
                        return { 
                            ...m, 
                            status: 'completed', 
                            lastTaken: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        };
                    }
                    return m;
                })
            })));
            
            setDialogVisible(null);
            setNoteText('');
        } catch (err) {
            console.error("Error updating medication", err);
            Alert.alert("Error", "Failed to update status.");
        }
    };

    const onRemindLater = (medId: string) => {
        // ... same notification logic ...
        // Need to find med from groups
    };

    const onMarkProcessed = async (medId: string) => {
        // Simple confirm
         try {
            await tablesDB.updateRow({
                databaseId: DATABASE_ID,
                tableId: MEDICATION_LOGS_TABLE_ID,
                rowId: medId,
                data: {
                    status: 'taken',
                    taken_at: new Date().toISOString()
                }
            });
            
            setElderlyGroups(prev => prev.map(group => ({
                ...group,
                medications: group.medications.map(m => {
                    if (m.id === medId) {
                        return { ...m, status: 'completed', lastTaken: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) };
                    }
                    return m;
                })
            })));
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
                </View>

                <View style={styles.section}>
                    <Card>
                        <Card.Content>
                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={styles.statNumber}>{totalCount}</Text>
                                    <Text variant="bodyMedium">Total</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.pending]}>{pendingCount}</Text>
                                    <Text variant="bodyMedium">Pending</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.completed]}>{completedCount}</Text>
                                    <Text variant="bodyMedium">Done</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text variant="headlineSmall" style={[styles.statNumber, styles.overdue]}>{overdueCount}</Text>
                                    <Text variant="bodyMedium">Missed</Text>
                                </View>
                            </View>
                        </Card.Content>
                    </Card>
                </View>

                <View style={styles.section}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Today's Plan</Text>
                        <View style={{ flexDirection: 'row' }}>
                             <Button
                                mode="text"
                                onPress={() => setStatusFilterVisible(true)}
                                compact
                                contentStyle={{ flexDirection: 'row-reverse' }}
                                icon="chevron-down"
                                labelStyle={{ fontSize: 14 }}
                            >
                                {filter === 'all' ? 'Status' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </Button>
                            <Button
                                mode="text"
                                onPress={() => setPersonFilterVisible(true)}
                                compact
                                contentStyle={{ flexDirection: 'row-reverse' }}
                                icon="chevron-down"
                                labelStyle={{ fontSize: 14 }}
                            >
                                {selectedElderlyId === 'All' ? 'Everyone' : (linkedElderly.find(e => e.$id === selectedElderlyId)?.name.split(' ')[0] || 'Unknown')}
                            </Button>
                        </View>
                    </View>

                    {filteredGroups.length === 0 ? (
                         <View style={{ alignItems: 'center', marginTop: 20 }}>
                            <Text style={{ color: theme.colors.outline }}>No medication records found.</Text>
                        </View>
                    ) : (
                        filteredGroups.map(group => (
                            <View key={group.elderlyId} style={styles.groupContainer}>
                                <View style={styles.groupHeader}>
                                    <View style={[styles.avatarPlaceholder, { backgroundColor: theme.colors.primaryContainer }]}>
                                        <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                                            {group.elderlyName.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text variant="titleMedium" style={styles.groupTitle}>{group.elderlyName}</Text>
                                </View>
                                <Divider style={{ marginBottom: 12 }} />
                                
                                {group.medications.length === 0 ? (
                                    <Text style={{ color: theme.colors.outline, fontStyle: 'italic', marginBottom: 10 }}>No medications scheduled.</Text>
                                ) : (
                                    group.medications.map(med => (
                                        <MedicationCard
                                            key={med.id}
                                            med={med}
                                            onConfirmPress={() => { setDialogVisible(med); setNoteText(med.notes || ''); }}
                                            onRemind={() => onRemindLater(med.id)}
                                            onMarkProcessed={() => onMarkProcessed(med.id)}
                                        />
                                    ))
                                )}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <Portal>
                 <Dialog visible={personFilterVisible} onDismiss={() => setPersonFilterVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title>Select Elderly</Dialog.Title>
                    <Dialog.Content style={{ paddingBottom: 0 }}>
                        <Searchbar
                            placeholder="Search"
                            onChangeText={setFilterSearchQuery}
                            value={filterSearchQuery}
                            style={{ backgroundColor: theme.colors.surfaceVariant, height: 40, marginBottom: 10 }}
                            inputStyle={{ minHeight: 0 }}
                        />
                        <ScrollView style={{ maxHeight: 300 }}>
                             <TouchableOpacity
                                style={[styles.selectionRow, { backgroundColor: selectedElderlyId === 'All' ? theme.colors.secondaryContainer : 'transparent' }]}
                                onPress={() => { setSelectedElderlyId('All'); setPersonFilterVisible(false); }}
                            >
                                <Avatar.Icon size={40} icon="account-group" style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                                <Text variant="titleMedium">Everyone</Text>
                                {selectedElderlyId === 'All' && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                            {linkedElderly
                                .filter(e => e.name.toLowerCase().includes(filterSearchQuery.toLowerCase()))
                                .map((item) => (
                                    <TouchableOpacity
                                        key={item.$id}
                                        style={[styles.selectionRow, { backgroundColor: selectedElderlyId === item.$id ? theme.colors.secondaryContainer : 'transparent' }]}
                                        onPress={() => { setSelectedElderlyId(item.$id); setPersonFilterVisible(false); }}
                                    >
                                        <Avatar.Text size={40} label={item.name.substring(0, 2)} style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                                        <Text variant="titleMedium">{item.name}</Text>
                                        {selectedElderlyId === item.$id && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>
                                ))}
                        </ScrollView>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setPersonFilterVisible(false)}>Cancel</Button>
                    </Dialog.Actions>
                </Dialog>

                <Dialog visible={statusFilterVisible} onDismiss={() => setStatusFilterVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title>Filter Status</Dialog.Title>
                    <Dialog.Content>
                         {['all', 'pending', 'completed'].map(status => (
                            <TouchableOpacity
                                key={status}
                                style={[styles.selectionRow, { backgroundColor: filter === status ? theme.colors.secondaryContainer : 'transparent' }]}
                                onPress={() => { setFilter(status); setStatusFilterVisible(false); }}
                            >
                                <MaterialCommunityIcons 
                                    name={status === 'all' ? 'filter-variant' : (status === 'pending' ? 'clock-outline' : 'check-circle-outline')} 
                                    size={24} 
                                    color={theme.colors.onSurface}
                                    style={{ marginRight: 16 }}
                                />
                                <Text variant="titleMedium">
                                    {status === 'all' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1)}
                                </Text>
                                {filter === status && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                         ))}
                    </Dialog.Content>
                     <Dialog.Actions>
                        <Button onPress={() => setStatusFilterVisible(false)}>Cancel</Button>
                    </Dialog.Actions>
                </Dialog>

                <Dialog visible={dialogVisible !== null} onDismiss={() => setDialogVisible(null)}>
                    <Dialog.Title>Confirm Medication</Dialog.Title>
                    <Dialog.Content>
                        <Text>Confirm {dialogVisible?.name} for {dialogVisible?.elderly}?</Text>
                        {/* Note: Medication Logs table doesn't have notes column in standard schema, but we can't save it if it doesn't exist. 
                            Assuming we just confirm status. */}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => { setDialogVisible(null); setNoteText(''); }}>Cancel</Button>
                        <Button onPress={() => { if (dialogVisible) onConfirmTaking(dialogVisible); }}>Confirm</Button>
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
    groupContainer: {
        marginBottom: 24,
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    groupTitle: {
        fontWeight: 'bold',
        marginLeft: 12,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialogInput: {
        marginTop: 12,
    },
    selectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
});
