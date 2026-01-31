import { DATABASE_ID, SCHEDULE_CATEGORY_TABLE_ID, SCHEDULE_TABLE_ID, tablesDB } from '@/lib/appwrite';
import { useAuth } from '@/lib/auth-context';
import { getCaregiverByUserId, getLinkedElderly } from '@/lib/caregiver';
import { Elderly, Schedule, ScheduleCategory, ScheduleStatus } from '@/types/appwrite';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ID, Query } from 'react-native-appwrite';
import { Avatar, Button, Chip, Dialog, Divider, FAB, IconButton, Modal, Portal, Searchbar, Surface, Text, TextInput, useTheme } from 'react-native-paper';

type ScheduleEvent = {
  id: string;
  time: string;
  title: string;
  description: string;
  type: string;
  status: ScheduleStatus;
  elderlyName: string;
  elderlyId: string;
  rawDate: string;
};

export default function SchedulePage() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();

  // Data State
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [linkedElderly, setLinkedElderly] = useState<Elderly[]>([]);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
  const [selectedElderlyId, setSelectedElderlyId] = useState<string>('All'); // Store ID instead of name

  // New Task Management
  const [newTaskVisible, setNewTaskVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [newTaskDatePickerVisible, setNewTaskDatePickerVisible] = useState(false);
  const [newTask, setNewTask] = useState<{
    title: string;
    description: string;
    date: Date;
    time: string;
    type: string; // Category ID or Name? Let's use Category Name for UI, ID for save
    typeId?: string;
    elderlyName: string;
    elderlyId: string;
    status: ScheduleStatus;
  }>({
    title: '',
    description: '',
    date: new Date(),
    time: '',
    type: 'Activity',
    elderlyName: 'Select Elderly', 
    elderlyId: '',
    status: ScheduleStatus.PENDING
  });

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
      try {
          const response = await tablesDB.listRows<ScheduleCategory>({
              databaseId: DATABASE_ID,
              tableId: SCHEDULE_CATEGORY_TABLE_ID
          });
          setCategories(response.rows);
      } catch (err) {
          console.error("Error fetching categories", err);
      }
  }, []);

  // Fetch Data
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
        
        const elderly = await getLinkedElderly(caregiver.$id);
        setLinkedElderly(elderly);
        
        if (elderly.length === 0) {
            setEvents([]);
            setLoading(false);
            return;
        }

        const elderlyIds = elderly.map(e => e.$id);

        // 2. Fetch Schedules for selected Date
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23,59,59,999);

        // Chunk queries if too many elderly? Appwrite query limit is usually high enough for IDs.
        // Assuming not too many.
        const response = await tablesDB.listRows<Schedule>({
            databaseId: DATABASE_ID,
            tableId: SCHEDULE_TABLE_ID,
            queries: [
                Query.greaterThanEqual('time', startOfDay.toISOString()),
                Query.lessThanEqual('time', endOfDay.toISOString()),
                Query.equal('elderly', elderlyIds), // Filter by ANY of these elderly
                Query.limit(100),
                Query.orderAsc('time')
            ]
        });

        const fetchedEvents: ScheduleEvent[] = response.rows.map(row => {
            // Find elderly name
            let eName = 'Unknown';
            let eId = '';
            
            // Normalize elderly relationship (can be array or single, object or ID)
            let elderlyRef: any = null;
            if (Array.isArray(row.elderly)) {
                if (row.elderly.length > 0) elderlyRef = row.elderly[0];
            } else {
                elderlyRef = row.elderly;
            }

            if (elderlyRef) {
                 if (typeof elderlyRef === 'object' && '$id' in elderlyRef) {
                     // It is an expanded object from Appwrite
                     eName = (elderlyRef as any).name || 'Unknown';
                     eId = elderlyRef.$id;
                 } else if (typeof elderlyRef === 'string') {
                     // It is an ID string
                     eId = elderlyRef;
                     const found = elderly.find(e => e.$id === elderlyRef);
                     if (found) eName = found.name;
                     else {
                         // Fallback attempt: if we are filtering by this elderly, we might know the name
                         // But 'elderly' variable contains all linked elderly capable of being viewed
                     }
                 }
            }

            // Find category
            let typeName = 'activity';
            let catRef: any = null;
            if (Array.isArray(row.scheduleCategory)) {
                if (row.scheduleCategory.length > 0) catRef = row.scheduleCategory[0];
            } else {
                catRef = row.scheduleCategory;
            }

            if (catRef) {
                 if (typeof catRef === 'object' && 'name' in catRef) {
                     typeName = (catRef as any).name?.toLowerCase() || 'activity';
                 } else if (typeof catRef === 'string') {
                     const foundCat = categories.find(c => c.$id === catRef);
                     if (foundCat && foundCat.name) {
                         typeName = foundCat.name.toLowerCase();
                     }
                 }
            }

            return {
                id: row.$id,
                time: row.time ? new Date(row.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}) : '--:--',
                title: row.title || '',
                description: row.description || '',
                type: typeName,
                status: row.status || ScheduleStatus.PENDING,
                elderlyName: eName,
                elderlyId: eId,
                rawDate: row.time || ''
            };
        });

        setEvents(fetchedEvents);

    } catch (err) {
        console.error("Error fetching schedule", err);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  }, [user, selectedDate, categories]);

  useEffect(() => {
      fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
      fetchData();
  }, [fetchData]);

  const onRefresh = () => {
      setRefreshing(true);
      fetchData();
  }

  // Filtered view
  const filteredEvents = selectedElderlyId === 'All'
    ? events
    : events.filter(item => item.elderlyId === selectedElderlyId);

  // ... (Keep existing Helper Functions: dates, onConfirmDate etc)


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
    if (status === ScheduleStatus.COMPLETED) return theme.colors.primary; // '#4CAF50';
    if (status === ScheduleStatus.MISSED) return theme.colors.error;
    return theme.colors.secondary;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'medication': return 'pill';
      case 'appointment': return 'doctor';
      case 'meal': return 'food';
      case 'activity': return 'walk';
      case 'checkup': return 'heart-pulse';
      default: return 'calendar-check';
    }
  };

  const handleMarkDone = async (taskId: string) => {
      try {
          await tablesDB.updateRow({
              databaseId: DATABASE_ID,
              tableId: SCHEDULE_TABLE_ID,
              rowId: taskId,
              data: {
                  status: ScheduleStatus.COMPLETED
              }
          });
          
          // Optimistically update local state
          setEvents(currentEvents => 
              currentEvents.map(event => 
                  event.id === taskId 
                      ? { ...event, status: ScheduleStatus.COMPLETED } 
                      : event
              )
          );
      } catch (err) {
          console.error("Error updating task status", err);
          Alert.alert("Error", "Could not mark task as completed.");
      }
  };

  const renderEvent = ({ item }: { item: ScheduleEvent }) => (
    <View style={styles.timelineRow}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{item.time}</Text>
        {item.status === ScheduleStatus.COMPLETED && <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} style={{ marginTop: 4 }} />}
        {item.status === ScheduleStatus.MISSED && <MaterialCommunityIcons name="alert-circle" size={16} color={theme.colors.error} style={{ marginTop: 4 }} />}
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
          {(item.status === ScheduleStatus.PENDING || item.status === ScheduleStatus.MISSED) && (
            <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
              <Button mode="contained-tonal" compact uppercase={false} onPress={() => handleMarkDone(item.id)}>Mark Done</Button>
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
              {selectedElderlyId === 'All' ? 'Everyone' : (linkedElderly.find(e => e.$id === selectedElderlyId)?.name || 'Unknown')}
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
                    <TouchableOpacity
                          style={[
                            styles.selectionRow,
                            { backgroundColor: selectedElderlyId === 'All' ? theme.colors.secondaryContainer : 'transparent' }
                          ]}
                          onPress={() => {
                            setSelectedElderlyId('All');
                            setFilterVisible(false);
                          }}
                        >
                          <Avatar.Icon size={40} icon="account-group" style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                          <Text variant="titleMedium">Everyone</Text>
                          {selectedElderlyId === 'All' && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                    {linkedElderly
                      .filter(e => e.name.toLowerCase().includes(filterSearchQuery.toLowerCase()))
                      .map((elderly) => (
                        <TouchableOpacity
                          key={elderly.$id}
                          style={[
                            styles.selectionRow,
                            { backgroundColor: selectedElderlyId === elderly.$id ? theme.colors.secondaryContainer : 'transparent' }
                          ]}
                          onPress={() => {
                            setSelectedElderlyId(elderly.$id);
                            setFilterVisible(false);
                          }}
                        >
                          <Avatar.Text size={40} label={elderly.name.substring(0,2)} style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                          <Text variant="titleMedium">{elderly.name}</Text>
                          {selectedElderlyId === elderly.$id && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
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
          <Chip compact>{filteredEvents.length} Tasks</Chip>
        </View>
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
          renderItem={renderEvent}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            !loading ? (
                <View style={{ alignItems: 'center', marginTop: 50 }}>
                   <Text style={{ color: theme.colors.outline }}>No tasks found for this day.</Text>
                </View>
            ) : null
          }
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
          value={new Date()} // Ideally should use current time from newTask.time parse
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
              <Button icon="chevron-right" contentStyle={{ flexDirection: 'row-reverse' }} onPress={() => setPickerYear(pickerYear + 1)} compact>Next</Button>
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
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          {selectionMode === 'form' ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text variant="headlineSmall" style={{ marginBottom: 20, fontWeight: 'bold' }}>New Task</Text>

              <TextInput
                mode="outlined"
                label="Title"
                value={newTask.title}
                onChangeText={t => setNewTask({ ...newTask, title: t })}
                style={styles.input}
              />

              <TextInput
                mode="outlined"
                label="Description"
                value={newTask.description}
                onChangeText={t => setNewTask({ ...newTask, description: t })}
                style={styles.input}
                multiline
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setNewTaskDatePickerVisible(true)} style={{ flex: 1, marginRight: 8 }}>
                  <TextInput
                    mode="outlined"
                    label="Date"
                    value={newTask.date.toLocaleDateString()}
                    editable={false}
                    style={styles.input}
                    right={<TextInput.Icon icon="calendar" onPress={() => setNewTaskDatePickerVisible(true)} />}
                  />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setTimePickerVisible(true)} style={{ flex: 1 }}>
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
                  value={newTask.type}
                  editable={false}
                  style={styles.input}
                  right={<TextInput.Icon icon="chevron-right" onPress={() => setSelectionMode('type')} />}
                />
              </TouchableOpacity>

              <Button mode="contained" onPress={async () => {
                  if (!newTask.title || !newTask.elderlyId || !newTask.time) {
                      Alert.alert("Missing Information", "Please enter a title, select a time, and choose an elderly person.");
                      return;
                  }
                  
                  try {
                      setLoading(true);
                      // Combine date and time
                      const combinedDate = new Date(newTask.date);
                      const [hours, minutes] = newTask.time.split(':').map(Number);
                      combinedDate.setHours(hours, minutes, 0, 0);
                      
                      const data: any = {
                          title: newTask.title,
                          description: newTask.description,
                          time: combinedDate.toISOString(),
                          elderly: newTask.elderlyId, // Relationship expects single ID
                          status: ScheduleStatus.PENDING,
                          type: newTask.type.toLowerCase() // Add type enum value
                      };

                      if (newTask.typeId) {
                          data.scheduleCategory = newTask.typeId; 
                      }

                      await tablesDB.createRow({
                          databaseId: DATABASE_ID,
                          tableId: SCHEDULE_TABLE_ID, 
                          rowId: ID.unique(),
                          data: data
                      });
                      
                      setNewTaskVisible(false);
                      // Reset form
                      setNewTask({
                        title: '',
                        description: '',
                        date: new Date(),
                        time: '',
                        type: 'Activity',
                        elderlyName: 'All', 
                        elderlyId: '',
                        status: ScheduleStatus.PENDING
                      });
                      
                      // Refresh list
                      fetchData();

                  } catch (err) {
                      console.error("Error creating task", err);
                  } finally {
                      setLoading(false);
                  }
              }} style={{ marginTop: 10, paddingVertical: 5 }} loading={loading} disabled={loading}>
                Save Task
              </Button>
            </ScrollView>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <IconButton icon="arrow-left" onPress={() => setSelectionMode('form')} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
                  {selectionMode === 'elderly' ? 'Select Elderly' : 'Select Type'}
                </Text>
              </View>
              <Divider />
              {selectionMode === 'elderly' && (
                <View style={{ paddingVertical: 10 }}>
                  <Searchbar
                    placeholder="Search"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: theme.colors.surfaceVariant, height: 40 }}
                    inputStyle={{ minHeight: 0 }}
                  />
                </View>
              )}
              <ScrollView style={{ maxHeight: 300 }}>
                {selectionMode === 'elderly' ? (
                  linkedElderly
                    .filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(item => (
                      <TouchableOpacity
                        key={item.$id}
                        style={[styles.selectionRow, { backgroundColor: newTask.elderlyId === item.$id ? theme.colors.secondaryContainer : 'transparent' }]}
                        onPress={() => {
                          setNewTask({ ...newTask, elderlyName: item.name, elderlyId: item.$id });
                          setSelectionMode('form');
                        }}
                      >
                        <Avatar.Text size={40} label={item.name.substring(0,2)} style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                        <Text variant="titleMedium">{item.name}</Text>
                        {newTask.elderlyId === item.$id && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    ))
                ) : (
                  categories.length > 0 ? (
                    categories.map(cat => (
                      <TouchableOpacity
                        key={cat.$id}
                        style={[styles.selectionRow, { backgroundColor: newTask.typeId === cat.$id ? theme.colors.secondaryContainer : 'transparent' }]}
                        onPress={() => {
                          setNewTask({ ...newTask, type: cat.name || 'Activity', typeId: cat.$id });
                          setSelectionMode('form');
                        }}
                      >
                        {/* TODO: Icon mapping for categories if needed */}
                        <Avatar.Icon size={40} icon={'calendar-check'} style={{ marginRight: 16, backgroundColor: theme.colors.secondary }} />
                        <View>
                          <Text variant="titleMedium">{cat.name || 'Activity'}</Text>
                        </View>
                        {newTask.typeId === cat.$id && <MaterialCommunityIcons name="check" size={24} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ marginBottom: 10, color: theme.colors.secondary }}>No categories found.</Text>
                      <Button mode="outlined" onPress={fetchCategories}>Retry Loading</Button>
                    </View>
                  )
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
    borderBottomColor: '#ccc',
    borderRadius: 12,
  },
});
