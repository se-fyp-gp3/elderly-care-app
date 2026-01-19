import ElderlyCard, { ElderlyItem } from "@/components/ElderlyCard"; // Import the new component
import { DATABASE_ID, databases, ELDERLY_COLLECTION_ID, ElderlyDocument } from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Databases, Query } from "react-native-appwrite";
import {
    Avatar,
    Button,
    Card,
    Chip,
    DataTable,
    Dialog,
    FAB,
    List,
    Portal,
    Text,
    useTheme
} from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
interface ElderlyListItem extends ElderlyDocument {
    lastCheck?: string;
    medication?: string;
    nextAppointment?: string;
}

export default function CaregiverDashboard() {
    const { preferences } = useAuth();
    const theme = useTheme();
    const [refreshing, setRefreshing] = React.useState(false);
    const [elderlyList, setElderlyList] = React.useState<ElderlyListItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const fetchElderlyData = React.useCallback(async () => {
        try {
            setError(null);
            const response = await (databases as Databases).listDocuments(
                DATABASE_ID,
                ELDERLY_COLLECTION_ID,
                [Query.limit(100), Query.orderDesc('$createdAt')]
            );
            
            const transformedData: ElderlyListItem[] = response.documents.map((doc: any) => ({
                ...doc,
                lastCheck: "Recently",
                medication: "Pending",
                nextAppointment: "None"
            }));
            
            setElderlyList(transformedData);
        } catch (err: any) {
            console.error('Error fetching elderly data:', err);
            setError(err.message || 'Failed to load elderly data');
            // Fallback to empty list on error
            setElderlyList([]);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchElderlyData();
    }, [fetchElderlyData]);

    const router = useRouter();

    const quickActions = [
        { icon: "pill", label: "Medication Management", color: "#4CAF50", route: "medication" },
        { icon: "heart-pulse", label: "Health Data", color: "#F44336", route: "health-data" },
        { icon: "calendar-clock", label: "Schedule", color: "#2196F3", route: "schedule" },
        { icon: "chat-alert", label: "Emergency Notification", color: "#FF9800", route: "emergency" },
    ];

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await fetchElderlyData();
        setRefreshing(false);
    }, [fetchElderlyData]);

    const handleCall = React.useCallback((phone?: string) => {
        if (!phone) return Alert.alert('No phone number');
        const url = `tel:${phone}`;
        Linking.canOpenURL(url).then((supported) => {
            if (supported) Linking.openURL(url);
            else Alert.alert('Cannot make a call from this device');
        });
    }, []);

    const handleViewInfo = React.useCallback((id: string) => {
        router.push(`/elderly/${id}` as any);
    }, [router]);

    const handleViewHealth = React.useCallback((id: string) => {
        const elderly = elderlyList.find(e => e.$id === id);
        const nameParam = elderly ? `&elderlyName=${encodeURIComponent(elderly.name)}` : '';
        router.push(`/health-data?elderlyId=${id}${nameParam}` as any);
    }, [router, elderlyList]);

    const [infoVisible, setInfoVisible] = React.useState(false);
    const [selectedElderly, setSelectedElderly] = React.useState<any>(null);
    const [selectionVisible, setSelectionVisible] = React.useState(false); // New State for Health Data Selection

    const handleQuickAction = (route: string) => {
        if (route === 'health-data') {
            setSelectionVisible(true);
        } else {
            router.push(route as any);
        }
    };

    const openInfoDialog = (elderly: any) => {
        setSelectedElderly(elderly);
        setInfoVisible(true);
    };

    const closeInfoDialog = () => {
        setInfoVisible(false);
        setSelectedElderly(null);
    };

    if (preferences.role !== 'caregiver') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <View style={styles.centered}>
                    <MaterialCommunityIcons
                        name="account-supervisor"
                        size={80}
                        color={theme.colors.primary}
                    />
                    <Text variant="headlineMedium" style={styles.title}>
                        Caregiver Panel
                    </Text>
                    <Text variant="bodyMedium" style={styles.subtitle}>
                        Please switch to "Nursing Mode" in settings to use this feature
                    </Text>
                    <Button
                        mode="contained"
                        onPress={() => {}}
                        style={styles.button}
                    >
                        Go to Settings
                    </Button>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                <View style={styles.header}>
                    <Card style={styles.statsCard}>
                        <Card.Content style={styles.statsContent}>
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>{elderlyList.length}</Text>
                                <Text variant="bodyMedium">Elderly</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>{elderlyList.filter(e => e.medication === 'Pending').length}</Text>
                                <Text variant="bodyMedium">Today's Reminder</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>{elderlyList.filter(e => e.status === 'warning').length}</Text>
                                <Text variant="bodyMedium">Needs Attention</Text>
                            </View>
                        </Card.Content>
                    </Card>
                </View>

                <View style={styles.section}>
                    <Text variant="titleLarge" style={styles.sectionTitle}>Quick Actions</Text>
                    
                    {/* Temporary Demo Button - Removed as per request now that Info button works
                    <Button 
                        mode="contained-tonal" 
                        onPress={() => router.push('/elderly/demo-user-001')}
                        style={{ marginBottom: 16, borderColor: theme.colors.primary, borderWidth: 1 }}
                        icon="eye"
                    >
                        Preview Detail Page DeshandleQuickAction(action.route
                    </Button>
                    */}

                    <View style={styles.quickActions}>
                        {quickActions.map((action, index) => (
                            <Card
                                key={index}
                                style={styles.actionCard}
                                onPress={() => handleQuickAction(action.route)}
                            >
                                <Card.Content style={styles.actionContent}>
                                    <MaterialCommunityIcons
                                        name={action.icon as IconName}
                                        size={32}
                                        color={action.color}
                                    />
                                    <Text variant="bodyMedium" style={styles.actionLabel}>
                                        {action.label}
                                    </Text>
                                </Card.Content>
                            </Card>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text variant="titleLarge" style={styles.sectionTitle}>
                            Responsible old man
                        </Text>
                        <Button mode="text" compact>
                            View All
                        </Button>
                    </View>

                    {loading && (
                        <Card style={styles.elderlyCard}>
                            <Card.Content>
                                <Text>Loading elderly data...</Text>
                            </Card.Content>
                        </Card>
                    )}

                    {error && (
                        <Card style={styles.elderlyCard}>
                            <Card.Content>
                                <Text style={{ color: theme.colors.error }}>{error}</Text>
                                <Button mode="outlined" onPress={fetchElderlyData} style={{ marginTop: 8 }}>
                                    Retry
                                </Button>
                            </Card.Content>
                        </Card>
                    )}

                    {!loading && !error && elderlyList.length === 0 && (
                        <Card style={styles.elderlyCard}>
                            <Card.Content>
                                <Text>No elderly records found. Add some using the + button below.</Text>
                            </Card.Content>
                        </Card>
                    )}

                    {!loading && elderlyList.map((elderly) => (
                        <ElderlyCard
                            key={elderly.$id}
                            elderly={elderly as ElderlyItem}
                            onCall={handleCall}
                            onViewInfo={() => handleViewInfo(elderly.$id)}
                            onViewHealth={handleViewHealth}
                        />
                    ))}
                </View>

                <View style={styles.section}>
                    <Text variant="titleLarge" style={styles.sectionTitle}>Today's Reminder</Text>
                    <Card>
                        <Card.Content>
                            <DataTable>
                                <DataTable.Header>
                                    <DataTable.Title>Time</DataTable.Title>
                                    <DataTable.Title>Old Man</DataTable.Title>
                                    <DataTable.Title>Items</DataTable.Title>
                                    <DataTable.Title numeric>Status</DataTable.Title>
                                </DataTable.Header>

                                <DataTable.Row>
                                    <DataTable.Cell>09:00</DataTable.Cell>
                                    <DataTable.Cell>Grandpa Zhang</DataTable.Cell>
                                    <DataTable.Cell>Measure Blood Pressure</DataTable.Cell>
                                    <DataTable.Cell numeric>
                                        <Chip mode="outlined" compact>Completed</Chip>
                                    </DataTable.Cell>
                                </DataTable.Row>

                                <DataTable.Row>
                                    <DataTable.Cell>2:30 PM</DataTable.Cell>
                                    <DataTable.Cell>Grandma Li</DataTable.Cell>
                                    <DataTable.Cell>Doctor's Follow-up</DataTable.Cell>
                                    <DataTable.Cell numeric>
                                        <Chip mode="flat" compact textStyle={{ color: 'white' }} style={{ backgroundColor: '#2196F3' }}>
                                            To be continued
                                        </Chip>
                                    </DataTable.Cell>
                                </DataTable.Row>

                                <DataTable.Row>
                                    <DataTable.Cell>8:00 PM</DataTable.Cell>
                                    <DataTable.Cell>Grandpa Wang</DataTable.Cell>
                                    <DataTable.Cell>Evening Medication</DataTable.Cell>
                                    <DataTable.Cell numeric>
                                        <Chip mode="outlined" compact>Pending</Chip>
                                    </DataTable.Cell>
                                </DataTable.Row>
                            </DataTable>
                        </Card.Content>
                    </Card>
                </View>
            </ScrollView>

            <Portal>
                {/* Health Data Selection Dialog */}
                <Dialog visible={selectionVisible} onDismiss={() => setSelectionVisible(false)}>
                    <Dialog.Title>Select Health Data</Dialog.Title>
                    <Dialog.ScrollArea>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {elderlyList.length > 0 ? (
                                elderlyList.map((item) => (
                                    <List.Item
                                        key={item.$id}
                                        title={item.name}
                                        description={`Age: ${item.age || 'Unknown'}`}
                                        left={(props) => (
                                            <Avatar.Text 
                                                {...props} 
                                                size={40} 
                                                label={item.name ? item.name.substring(0, 2) : "??"} 
                                                style={{ backgroundColor: theme.colors.primary, marginRight: 10 }}
                                            />
                                        )}
                                        onPress={() => {
                                            setSelectionVisible(false);
                                            router.push(`/health-data?elderlyId=${item.$id}&elderlyName=${encodeURIComponent(item.name)}` as any);
                                        }}
                                        right={(props) => <List.Icon {...props} icon="chevron-right" />}
                                    />
                                ))
                            ) : (
                                <Text style={{ padding: 20, textAlign: 'center' }}>No elderly records found.</Text>
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={() => setSelectionVisible(false)}>Cancel</Button>
                    </Dialog.Actions>
                </Dialog>

                <Dialog visible={infoVisible} onDismiss={closeInfoDialog}>
                    <Dialog.Title>{selectedElderly?.name ?? 'Details'}</Dialog.Title>
                    <Dialog.Content>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Avatar.Text size={48} label={selectedElderly?.name?.substring(0,2) ?? ''} />
                            <View style={{ marginLeft: 12 }}>
                                <Text variant="titleMedium">{selectedElderly?.name}</Text>
                                <Text variant="bodySmall">ID: {selectedElderly?.$id}</Text>
                            </View>
                        </View>

                        <Text variant="bodyMedium">Age: {selectedElderly?.age ?? '—'}</Text>
                        <Text variant="bodyMedium">Phone: {selectedElderly?.phone ?? '—'}</Text>
                        <Text variant="bodyMedium">Status: {selectedElderly?.status ?? '—'}</Text>
                        <Text variant="bodyMedium">Last Check: {selectedElderly?.lastCheck ?? '—'}</Text>
                        <Text variant="bodyMedium">Medication: {selectedElderly?.medication ?? '—'}</Text>
                        <Text variant="bodyMedium">Next Appointment: {selectedElderly?.nextAppointment ?? '—'}</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => { handleCall(selectedElderly?.phone); closeInfoDialog(); }}>Call</Button>
                        <Button onPress={() => { selectedElderly && handleViewHealth(selectedElderly.$id); closeInfoDialog(); }}>Health Data</Button>
                        <Button onPress={closeInfoDialog}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <FAB
                icon="plus"
                style={styles.fab}
                onPress={() => console.log('添加新记录')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: 24,
        opacity: 0.7,
    },
    button: {
        marginTop: 8,
    },
    header: {
        padding: 16,
    },
    statsCard: {
        marginBottom: 8,
    },
    statsContent: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontWeight: 'bold',
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#E0E0E0',
    },
    section: {
        padding: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontWeight: 'bold',
        marginBottom: 16,
    },
    quickActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    actionCard: {
        width: '48%',
        marginBottom: 12,
    },
    actionContent: {
        alignItems: 'center',
        padding: 16,
    },
    actionLabel: {
        marginTop: 8,
        textAlign: 'center',
    },
    elderlyCard: {
        marginBottom: 12,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});