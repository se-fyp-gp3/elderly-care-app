import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Chip, Divider, FAB, Portal, Dialog, RadioButton, Surface, Text, useTheme } from 'react-native-paper';

type ScheduleEvent = {
    id: string;
    time: string;
    title: string;
    description: string;
    type: 'medication' | 'appointment' | 'meal' | 'activity' | 'checkup';
    status: 'pending' | 'completed' | 'missed';
    elderlyName: string;
};

// Mock Data
const EVENTS: ScheduleEvent[] = [
    { id: '1', time: '08:00', title: 'Morning Medication', description: 'Metformin 500mg, after meal', type: 'medication', status: 'completed', elderlyName: 'Grandpa Zhang' },
    { id: '2', time: '09:00', title: 'Blood Pressure Check', description: 'Routine check', type: 'checkup', status: 'completed', elderlyName: 'Grandma Li' },
    { id: '3', time: '12:00', title: 'Lunch', description: 'Low sodium diet', type: 'meal', status: 'pending', elderlyName: 'Grandpa Wang' },
    { id: '4', time: '14:30', title: 'Doctor Appointment', description: 'Dr. Smith (Cardiology)', type: 'appointment', status: 'pending', elderlyName: 'Grandpa Zhang' },
    { id: '5', time: '16:00', title: 'Afternoon Walk', description: 'Garden area', type: 'activity', status: 'pending', elderlyName: 'All' },
    { id: '6', time: '20:00', title: 'Evening Medication', description: 'Amlodipine 5mg', type: 'medication', status: 'pending', elderlyName: 'Grandma Li' },
];

export default function SchedulePage() {
    const theme = useTheme();
    const router = useRouter();
    const navigation = useNavigation();
    const [selectedDate, setSelectedDate] = useState(new Date().getDate());
    const [filterVisible, setFilterVisible] = useState(false);
    const [selectedElderly, setSelectedElderly] = useState('All');

    // Get unique elderly names
    const elderlyList = ['All', ...Array.from(new Set(EVENTS.map(e => e.elderlyName).filter(n => n !== 'All')))];

    const filteredEvents = selectedElderly === 'All' 
        ? EVENTS 
        : EVENTS.filter(item => item.elderlyName === selectedElderly);

    // Generate next 7 days
    const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return {
            day: d.toLocaleDateString('en-US', { weekday: 'short' }),
            date: d.getDate(),
            fullDate: d
        };
    });

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
                <View style={{ marginRight: 10 }}>
                     <Chip icon="calendar-month" onPress={() => {}}>Month</Chip>
                </View>
            )
        });
    }, [navigation, router, theme]);

    const getStatusColor = (status: string) => {
        if (status === 'completed') return theme.colors.primary; // '#4CAF50';
        if (status === 'missed') return theme.colors.error;
        return theme.colors.secondary;
    };

    const getTypeIcon = (type: string) => {
        switch(type) {
            case 'medication': return 'pill';
            case 'appointment': return 'doctor';
            case 'meal': return 'food';
            case 'activity': return 'walk';
            case 'checkup': return 'heart-pulse';
            default: return 'calendar-check';
        }
    };

    const renderEvent = ({ item }: { item: ScheduleEvent }) => (
        <View style={styles.timelineRow}>
            <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{item.time}</Text>
                {item.status === 'completed' && <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} style={{ marginTop: 4}} />}
                {item.status === 'missed' && <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.error} style={{ marginTop: 4}} />}
            </View>
            
            <View style={styles.timelineLineContainer}>
                 <View style={[styles.timelineLine, { backgroundColor: theme.colors.outlineVariant }]} />
                 <View style={[styles.timelineDot, { backgroundColor: getStatusColor(item.status) }]} />
            </View>

            <Surface style={[styles.eventCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={[styles.eventHeader, { borderLeftColor: getStatusColor(item.status), borderLeftWidth: 4 }]}>
                    <View style={{ flex: 1 }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                             <MaterialCommunityIcons name="account" size={14} color={theme.colors.secondary} />
                             <Text variant="bodySmall" style={{ color: theme.colors.secondary, marginLeft: 4 }}>{item.elderlyName}</Text>
                        </View>
                    </View>
                    <Avatar.Icon size={40} icon={getTypeIcon(item.type)} style={{ backgroundColor: theme.colors.secondaryContainer }} />
                </View>
                <Divider />
                <View style={styles.eventBody}>
                    <Text variant="bodyMedium" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{item.description}</Text>
                    {item.status === 'pending' && (
                        <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
                             <Button mode="contained-tonal" compact uppercase={false} onPress={() => {}}>Mark Done</Button>
                        </View>
                    )}
                </View>
            </Surface>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Header Date Strip */}
            <View style={[styles.calendarStrip, { backgroundColor: theme.colors.background }]}>
                <Text variant="headlineSmall" style={{ fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 16, marginTop: 10 }}>
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
                    {dates.map((d, index) => {
                        const isSelected = d.date === selectedDate;
                        return (
                             <TouchableOpacity 
                                key={index} 
                                onPress={() => setSelectedDate(d.date)}
                                style={[
                                    styles.dateBox, 
                                    { backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceVariant }
                                ]}
                            >
                                <Text style={[styles.dayText, { color: isSelected ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }]}>{d.day}</Text>
                                <Text style={[styles.dateText, { color: isSelected ? theme.colors.onPrimary : theme.colors.onSurface }]}>{d.date}</Text>
                             </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.taskListContainer}>
                <View style={styles.listHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginRight: 8 }}>Tasks for</Text>
                         <Button 
                            mode="text" 
                            onPress={() => setFilterVisible(true)} 
                            compact 
                            contentStyle={{ flexDirection: 'row-reverse' }}
                            icon="chevron-down"
                            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                        >
                            {selectedElderly === 'All' ? 'Everyone' : selectedElderly}
                        </Button>
                        <Portal>
                            <Dialog visible={filterVisible} onDismiss={() => setFilterVisible(false)}>
                                <Dialog.Title>Select Elderly</Dialog.Title>
                                <Dialog.ScrollArea style={{ maxHeight: 300, paddingHorizontal: 0 }}>
                                    <ScrollView contentContainerStyle={{paddingHorizontal: 0}}>
                                        <RadioButton.Group onValueChange={value => {
                                            setSelectedElderly(value);
                                            setFilterVisible(false);
                                        }} value={selectedElderly}>
                                            {elderlyList.map((name) => (
                                                <RadioButton.Item 
                                                    key={name}
                                                    label={name === 'All' ? 'Everyone' : name} 
                                                    value={name} 
                                                />
                                            ))}
                                        </RadioButton.Group>
                                    </ScrollView>
                                </Dialog.ScrollArea>
                                <Dialog.Actions>
                                    <Button onPress={() => setFilterVisible(false)}>Cancel</Button>
                                </Dialog.Actions>
                            </Dialog>
                        </Portal>
                    </View>
                    <Chip compact>{filteredEvents.length} Total</Chip>
                </View>
                <FlatList
                    data={filteredEvents}
                    keyExtractor={item => item.id}
                    renderItem={renderEvent}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                />
            </View>
            
            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                color={theme.colors.onPrimary}
                onPress={() => {}}
                label="New Task"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    calendarStrip: {
        paddingBottom: 16,
    },
    dateBox: {
        width: 60,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 6,
        borderRadius: 16,
    },
    dayText: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    dateText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    taskListContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 16,
    },
    timelineRow: {
        flexDirection: 'row',
        marginBottom: 0,
    },
    timeColumn: {
        width: 50,
        alignItems: 'flex-end',
        paddingRight: 12,
        paddingTop: 16,
    },
    timeText: {
        fontWeight: 'bold',
        color: '#666',
    },
    timelineLineContainer: {
        width: 20,
        alignItems: 'center',
    },
    timelineLine: {
        width: 2,
        flex: 1,
    },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        position: 'absolute',
        top: 20,
        zIndex: 1,
        borderWidth: 2,
        borderColor: 'white',
    },
    eventCard: {
        flex: 1,
        marginLeft: 8,
        marginBottom: 20,
        borderRadius: 16,
        overflow: 'hidden',
    },
    eventHeader: {
        flexDirection: 'row',
        padding: 12,
        alignItems: 'center',
    },
    eventBody: {
        padding: 12,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});
