import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Chip, Dialog, Divider, FAB, IconButton, Modal, Portal, Searchbar, Surface, Text, TextInput, useTheme } from 'react-native-paper';

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
    
    // Date Management
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    
    // Custom Month Picker
    const [monthPickerVisible, setMonthPickerVisible] = useState(false);
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

    // Dropdown Menus
    const [selectionMode, setSelectionMode] = useState<'form' | 'elderly' | 'type'>('form');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSearchQuery, setFilterSearchQuery] = useState('');

    // Filters
    const [filterVisible, setFilterVisible] = useState(false);
    const [selectedElderly, setSelectedElderly] = useState('All');

    // New Task Management
    const [newTaskVisible, setNewTaskVisible] = useState(false);
    const [timePickerVisible, setTimePickerVisible] = useState(false);
    const [newTaskDatePickerVisible, setNewTaskDatePickerVisible] = useState(false);
    const [newTask, setNewTask] = useState<{
        title: string;
        description: string;
        date: Date;
        time: string;
        type: 'medication' | 'appointment' | 'meal' | 'activity' | 'checkup';
        elderlyName: string;
        status: 'pending' | 'completed' | 'missed';
    }>({
        title: '',
        description: '',
        date: new Date(),
        time: '',
        type: 'medication',
        elderlyName: 'All', // Default or select first
        status: 'pending'
    });

    // Get unique elderly names
    const elderlyList = ['All', ...Array.from(new Set(EVENTS.map(e => e.elderlyName).filter(n => n !== 'All')))];

    const filteredEvents = selectedElderly === 'All' 
        ? EVENTS 
        : EVENTS.filter(item => item.elderlyName === selectedElderly);

    // Generate next 7 days from referenceDate
    const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(referenceDate);
        d.setDate(referenceDate.getDate() + i);
        return {
            day: d.toLocaleDateString('en-US', { weekday: 'short' }),
            date: d.getDate(),
            fullDate: d,
            isToday: d.toDateString() === new Date().toDateString()
        };
    });

    const onConfirmDate = (event: any, selectedDate?: Date) => {
        setDatePickerVisible(false);
        if (selectedDate) {
            setReferenceDate(selectedDate);
            setSelectedDate(selectedDate);
        }
    };

    const onConfirmTime = (event: any, selectedDate?: Date) => {
        setTimePickerVisible(false);
        if (selectedDate) {
            const hours = selectedDate.getHours();
            const minutes = selectedDate.getMinutes();
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            setNewTask(prev => ({ ...prev, time: timeString }));
        }
    };

    const onConfirmNewTaskDate = (event: any, selectedDate?: Date) => {
        setNewTaskDatePickerVisible(false);
        if (selectedDate) {
            setNewTask(prev => ({ ...prev, date: selectedDate }));
        }
    };

    const handleMonthSelect = (monthIndex: number) => {
        const newDate = new Date(pickerYear, monthIndex, 1);
        setReferenceDate(newDate);
        setSelectedDate(newDate);
        setMonthPickerVisible(false);
    };

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
                     <Chip icon="calendar-month" onPress={() => setDatePickerVisible(true)}>Calendar</Chip>
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
                <TouchableOpacity onPress={() => { setPickerYear(referenceDate.getFullYear()); setMonthPickerVisible(true); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, marginTop: 10 }}>
                        <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginRight: 8 }}>
                            {referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                         <MaterialCommunityIcons name="chevron-down" size={24} color={theme.colors.onSurface} />
                    </View>
                </TouchableOpacity>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
                    {dates.map((d, index) => {
                        const isSelected = d.fullDate.toDateString() === selectedDate.toDateString();
                        return (
                             <TouchableOpacity 
                                key={index} 
                                onPress={() => setSelectedDate(d.fullDate)}
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
                            <Dialog visible={filterVisible} onDismiss={() => setFilterVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
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
                                        {elderlyList
                                            .filter(name => name.toLowerCase().includes(filterSearchQuery.toLowerCase()))
                                            .map((name) => (
                                                <TouchableOpacity
                                                    key={name}
                                                    style={[
                                                        styles.selectionRow,
                                                        { backgroundColor: selectedElderly === name ? theme.colors.secondaryContainer : 'transparent' }
                                                    ]}
                                                    onPress={() => {
                                                        setSelectedElderly(name);
                                                        setFilterVisible(false);
                                                    }}
                                                >
                                                    <Avatar.Icon size={40} icon="account" style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                                                    <Text variant="titleMedium">{name === 'All' ? 'Everyone' : name}</Text>
                                                    {selectedElderly === name && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                                                </TouchableOpacity>
                                            ))}
                                    </ScrollView>
                                </Dialog.Content>
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
                onPress={() => setNewTaskVisible(true)}
                label="New Task"
            />

            {/* Native Date Picker */}
            {datePickerVisible && (
                <DateTimePicker 
                    value={referenceDate}
                    mode="date"
                    display="default"
                    onChange={onConfirmDate}
                />
            )}

            {/* Native Time Picker for New Task */}
            {timePickerVisible && (
                 <DateTimePicker 
                    value={new Date()}
                    mode="time"
                    display="default"
                    onChange={onConfirmTime}
                />
            )}

            {/* Native Date Picker for New Task */}
            {newTaskDatePickerVisible && (
                 <DateTimePicker 
                    value={newTask.date}
                    mode="date"
                    display="default"
                    onChange={onConfirmNewTaskDate}
                />
            )}

            {/* Custom Month Picker Dialog */}
            <Portal>
                <Dialog visible={monthPickerVisible} onDismiss={() => setMonthPickerVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Content>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Button icon="chevron-left" onPress={() => setPickerYear(pickerYear - 1)} compact>Prev</Button>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{pickerYear}</Text>
                            <Button icon="chevron-right" contentStyle={{flexDirection: 'row-reverse'}} onPress={() => setPickerYear(pickerYear + 1)} compact>Next</Button>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
                                <TouchableOpacity 
                                    key={month} 
                                    style={[
                                        styles.monthButton, 
                                        { backgroundColor: (index === referenceDate.getMonth() && pickerYear === referenceDate.getFullYear()) ? theme.colors.primaryContainer : 'transparent' }
                                    ]}
                                    onPress={() => handleMonthSelect(index)}
                                >
                                    <Text style={{ 
                                        color: (index === referenceDate.getMonth() && pickerYear === referenceDate.getFullYear()) ? theme.colors.onPrimaryContainer : theme.colors.onSurface 
                                    }}>{month}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setMonthPickerVisible(false)}>Cancel</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* New Task Modal */}
            <Portal>
                <Modal 
                    visible={newTaskVisible} 
                    onDismiss={() => { setNewTaskVisible(false); setSelectionMode('form'); }} 
                    contentContainerStyle={[styles.modalContent, {backgroundColor: theme.colors.surface}]}
                >
                    {selectionMode === 'form' ? (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text variant="headlineSmall" style={{marginBottom: 20, fontWeight: 'bold'}}>New Task</Text>
                            
                            <TextInput 
                                mode="outlined"
                                label="Title" 
                                value={newTask.title} 
                                onChangeText={t => setNewTask({...newTask, title: t})} 
                                style={styles.input}
                            />
                            
                            <TextInput 
                                mode="outlined"
                                label="Description" 
                                value={newTask.description} 
                                onChangeText={t => setNewTask({...newTask, description: t})} 
                                style={styles.input}
                                multiline
                            />
                            
                            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                                 <TouchableOpacity onPress={() => setNewTaskDatePickerVisible(true)} style={{flex: 1, marginRight: 8}}>
                                    <TextInput 
                                        mode="outlined"
                                        label="Date" 
                                        value={newTask.date.toLocaleDateString()} 
                                        editable={false} 
                                        style={styles.input}
                                        right={<TextInput.Icon icon="calendar" onPress={() => setNewTaskDatePickerVisible(true)} />}
                                    />
                                </TouchableOpacity>
    
                                <TouchableOpacity onPress={() => setTimePickerVisible(true)} style={{flex: 1}}>
                                    <TextInput 
                                        mode="outlined"
                                        label="Time" 
                                        value={newTask.time} 
                                        editable={false} 
                                        style={styles.input}
                                        right={<TextInput.Icon icon="clock" onPress={() => setTimePickerVisible(true)} />}
                                    />
                                </TouchableOpacity>
                            </View>
                            
                            <TouchableOpacity onPress={() => setSelectionMode('elderly')}>
                                <TextInput 
                                    mode="outlined"
                                    label="Who is this for?" 
                                    value={newTask.elderlyName} 
                                    editable={false} 
                                    style={styles.input}
                                    right={<TextInput.Icon icon="chevron-right" onPress={() => setSelectionMode('elderly')} />}
                                />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setSelectionMode('type')}>
                                <TextInput 
                                    mode="outlined"
                                    label="Type" 
                                    value={newTask.type ? (newTask.type.charAt(0).toUpperCase() + newTask.type.slice(1)) : ''}
                                    editable={false} 
                                    style={styles.input}
                                    right={<TextInput.Icon icon="chevron-right" onPress={() => setSelectionMode('type')} />}
                                />
                            </TouchableOpacity>
    
                            <Button mode="contained" onPress={() => setNewTaskVisible(false)} style={{marginTop: 10, paddingVertical: 5}}>
                                Save Task
                            </Button>
                        </ScrollView>
                    ) : (
                        <View>
                            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                                <IconButton icon="arrow-left" onPress={() => setSelectionMode('form')} />
                                <Text variant="titleLarge" style={{fontWeight: 'bold'}}>
                                    {selectionMode === 'elderly' ? 'Select Elderly' : 'Select Type'}
                                </Text>
                            </View>
                            <Divider />
                            {selectionMode === 'elderly' && (
                                <View style={{paddingVertical: 10}}>
                                    <Searchbar
                                        placeholder="Search"
                                        onChangeText={setSearchQuery}
                                        value={searchQuery}
                                        style={{backgroundColor: theme.colors.surfaceVariant, height: 40}}
                                        inputStyle={{minHeight: 0}}
                                    />
                                </View>
                            )}
                            <ScrollView>
                                {selectionMode === 'elderly' ? (
                                    elderlyList
                                        .filter(e => e!=='All' && e.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(name => (
                                        <TouchableOpacity 
                                            key={name} 
                                            style={[styles.selectionRow, { backgroundColor: newTask.elderlyName === name ? theme.colors.secondaryContainer : 'transparent' }]}
                                            onPress={() => {
                                                setNewTask({...newTask, elderlyName: name});
                                                setSelectionMode('form');
                                            }}
                                        >
                                            <Avatar.Icon size={40} icon="account" style={{marginRight: 16, backgroundColor: theme.colors.secondary}} />
                                            <Text variant="titleMedium">{name}</Text>
                                            {newTask.elderlyName === name && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{marginLeft: 'auto'}} />}
                                        </TouchableOpacity>
                                    ))
                                ) : (
                                    ['medication', 'appointment', 'meal', 'activity', 'checkup'].map(type => (
                                        <TouchableOpacity 
                                            key={type} 
                                            style={[styles.selectionRow, { backgroundColor: newTask.type === type ? theme.colors.secondaryContainer : 'transparent' }]}
                                            onPress={() => {
                                                setNewTask({...newTask, type: type as any});
                                                setSelectionMode('form');
                                            }}
                                        >
                                            <Avatar.Icon size={40} icon={getTypeIcon(type)} style={{marginRight: 16, backgroundColor: theme.colors.secondary}} />
                                            <View>
                                                <Text variant="titleMedium">{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                                                <Text variant="bodySmall" style={{color: theme.colors.outline}}>Select to mark as {type}</Text>
                                            </View>
                                            {newTask.type === type && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{marginLeft: 'auto'}} />}
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>
                        </View>
                    )}
                </Modal>
            </Portal>

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
    modalContent: {
        margin: 20,
        padding: 20,
        borderRadius: 16,
        maxHeight: '80%',
    },
    input: {
        marginBottom: 10,
    },
    monthButton: {
        width: '30%',
        paddingVertical: 10,
        alignItems: 'center',
        marginVertical: 5,
        borderRadius: 8,
    },
    selectionRow: {
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 16, 
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#ccc'
    },
});
