// app/(tabs)/caregiver.tsx
import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
    Avatar,
    Button,
    Card,
    Chip,
    DataTable,
    FAB,
    Text,
    useTheme
} from "react-native-paper";

// 定义图标名称类型
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export default function CaregiverDashboard() {
    const { preferences } = useAuth();
    const theme = useTheme();
    const [refreshing, setRefreshing] = React.useState(false);

    // 模拟数据
    const elderlyList = [
        {
            id: 1,
            name: "Grandpa Zhang",
            age: 78,
            status: "normal",
            lastCheck: "2 hours ago",
            medication: "Completed",
            nextAppointment: "Tomorrow 10:00"
        },
        {
            id: 2,
            name: "Grandma Li",
            age: 82,
            status: "warning",
            lastCheck: "30 minutes ago",
            medication: "Pending",
            nextAppointment: "Today at 2:30 PM"
        },
        {
            id: 3,
            name: "Grandpa Wang",
            age: 75,
            status: "normal",
            lastCheck: "1 hour ago",
            medication: "Completed",
            nextAppointment: "None"
        },
    ];

    const router = useRouter();

    const quickActions = [
        { icon: "pill", label: "Medication Management", color: "#4CAF50", route: "medication" },
        { icon: "heart-pulse", label: "Health Data", color: "#F44336", route: "health-data" },
        { icon: "calendar-clock", label: "Schedule", color: "#2196F3", route: "schedule" },
        { icon: "chat-alert", label: "Emergency Notification", color: "#FF9800", route: "emergency" },
    ];

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 2000);
    }, []);

    // 如果用户不是护理员，显示提示
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
                        onPress={() => {/* 导航到设置 */ }}
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
                {/* 头部统计 */}
                <View style={styles.header}>
                    <Card style={styles.statsCard}>
                        <Card.Content style={styles.statsContent}>
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>3</Text>
                                <Text variant="bodyMedium">Elderly</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>12</Text>
                                <Text variant="bodyMedium">Today's Reminder</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text variant="headlineSmall" style={styles.statNumber}>2</Text>
                                <Text variant="bodyMedium">Pending</Text>
                            </View>
                        </Card.Content>
                    </Card>
                </View>

                {/* 快速操作 */}
                <View style={styles.section}>
                    <Text variant="titleLarge" style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.quickActions}>
                        {quickActions.map((action, index) => (
                            <Card
                                key={index}
                                style={styles.actionCard}
                                onPress={() => router.push(action.route as any)}
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

                {/* 老人列表 */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text variant="titleLarge" style={styles.sectionTitle}>
                            Responsible old man
                        </Text>
                        <Button mode="text" compact>
                            View All
                        </Button>
                    </View>

                    {elderlyList.map((elderly) => (
                        <Card key={elderly.id} style={styles.elderlyCard}>
                            <Card.Content>
                                <View style={styles.elderlyHeader}>
                                    <View style={styles.elderlyInfo}>
                                        <Avatar.Text
                                            size={50}
                                            label={elderly.name.substring(0, 2)}
                                            style={[
                                                styles.avatar,
                                                elderly.status === 'warning' && styles.warningAvatar
                                            ]}
                                        />
                                        <View style={styles.elderlyDetails}>
                                            <Text variant="titleMedium">{elderly.name}</Text>
                                            <Text variant="bodyMedium">{elderly.age} years old</Text>
                                        </View>
                                    </View>
                                    <Chip
                                        mode="outlined"
                                        style={[
                                            styles.statusChip,
                                            elderly.status === 'warning' && styles.warningChip
                                        ]}
                                    >
                                        {elderly.status === 'warning' ? 'Need attention' : 'normal'}
                                    </Chip>
                                </View>

                                <View style={styles.elderlyStats}>
                                    <View style={styles.statRow}>
                                        <MaterialCommunityIcons name="clock-outline" size={16} />
                                        <Text variant="bodySmall">Final Check: {elderly.lastCheck}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <MaterialCommunityIcons name="pill" size={16} />
                                        <Text variant="bodySmall">Medication: {elderly.medication}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <MaterialCommunityIcons name="calendar" size={16} />
                                        <Text variant="bodySmall">Next appointment: {elderly.nextAppointment}</Text>
                                    </View>
                                </View>

                                <View style={styles.actionButtons}>
                                    <Button
                                        mode="outlined"
                                        compact
                                        icon="phone"
                                        style={styles.smallButton}
                                    >
                                        call
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        compact
                                        icon="chat"
                                        style={styles.smallButton}
                                    >
                                        information
                                    </Button>
                                    <Button
                                        mode="contained"
                                        compact
                                        icon="chart-line"
                                        style={styles.smallButton}
                                    >
                                        health data
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    ))}
                </View>

                {/* 今日提醒 */}
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

            {/* 悬浮按钮 */}
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
    elderlyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    elderlyInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    elderlyDetails: {
        marginLeft: 12,
    },
    avatar: {
        backgroundColor: '#2196F3',
    },
    warningAvatar: {
        backgroundColor: '#FF9800',
    },
    statusChip: {
        marginLeft: 8,
    },
    warningChip: {
        backgroundColor: '#FFF3E0',
    },
    elderlyStats: {
        marginBottom: 12,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    smallButton: {
        flex: 1,
        marginHorizontal: 4,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});