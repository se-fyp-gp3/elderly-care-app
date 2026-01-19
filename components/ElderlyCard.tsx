import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, Text } from "react-native-paper";

// Define the interface for the elderly item
export interface ElderlyItem {
    $id: string; // Using $id as the ID field to match Appwrite/database structure
    name: string;
    age: number;
    phone: string;
    status: string; // 'warning' | 'normal'
    lastCheck?: string;
    medication?: string;
    nextAppointment?: string;
}

interface ElderlyCardProps {
    elderly: ElderlyItem;
    onCall: (phone?: string) => void;
    onViewInfo: (elderly: ElderlyItem) => void;
    onViewHealth: (id: string) => void;
}

/**
 * ElderlyCard Component
 * Displays a summary card for an elderly person with quick action buttons.
 */
export default function ElderlyCard({ elderly, onCall, onViewInfo, onViewHealth }: ElderlyCardProps) {
    return (
        <Card style={styles.elderlyCard}>
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
                        <Text variant="bodySmall"> Final Check: {elderly.lastCheck}</Text>
                    </View>
                    <View style={styles.statRow}>
                        <MaterialCommunityIcons name="pill" size={16} />
                        <Text variant="bodySmall"> Medication: {elderly.medication}</Text>
                    </View>
                    <View style={styles.statRow}>
                        <MaterialCommunityIcons name="calendar" size={16} />
                        <Text variant="bodySmall"> Next appointment: {elderly.nextAppointment}</Text>
                    </View>
                </View>

                <View style={styles.actionButtons}>
                    <Button
                        mode="outlined"
                        compact
                        icon="phone"
                        style={styles.smallButton}
                        onPress={() => onCall(elderly.phone)}
                    >
                        Call
                    </Button>
                    <Button
                        mode="outlined"
                        compact
                        icon="chat"
                        style={styles.smallButton}
                        onPress={() => onViewInfo(elderly)}
                    >
                        Info
                    </Button>
                    <Button
                        mode="contained"
                        compact
                        icon="chart-line"
                        style={styles.smallButton}
                        onPress={() => onViewHealth(elderly.$id)} // Ensure we use the correct ID field
                    >
                        HealthData
                    </Button>
                </View>
            </Card.Content>
        </Card>
    );
}

const styles = StyleSheet.create({
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
});
