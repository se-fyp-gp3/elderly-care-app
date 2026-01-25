import { Elderly, ElderlyStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, Text } from "react-native-paper";

// Define the interface for the elderly item
export interface ElderlyItem extends Elderly {
    lastCheck?: string;
    medication?: string;
    nextAppointment?: string;
    // age is removed as we will calculate it from birth if needed, or define it as optional if passed
    age?: number; 
}

interface ElderlyCardProps {
    elderly: ElderlyItem;
    onCall: (phone?: string) => void;
    onViewInfo: (elderly: ElderlyItem) => void;
    onViewHealth: (id: string) => void;
}

const calculateAge = (birthDateString?: string | null): number | string => {
    if (!birthDateString) return '??';
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};


/**
 * ElderlyCard Component
 * Displays a summary card for an elderly person with quick action buttons.
 */
export default function ElderlyCard({ elderly, onCall, onViewInfo, onViewHealth }: ElderlyCardProps) {
    const displayAge = elderly.age ?? calculateAge(elderly.birth);

    return (
        <Card style={styles.elderlyCard}>
            <Card.Content>
                <View style={styles.elderlyHeader}>
                    <View style={styles.elderlyInfo}>
                        <Avatar.Text
                            size={50}
                            label={elderly.name ? elderly.name.substring(0, 2) : "??"}
                            style={[
                                styles.avatar,
                                elderly.status === ElderlyStatus.WARNING && styles.warningAvatar
                            ]}
                        />
                        <View style={styles.elderlyDetails}>
                            <Text variant="titleMedium">{elderly.name}</Text>
                            <Text variant="bodyMedium">{displayAge} years old</Text>
                        </View>
                    </View>
                    <Chip
                        mode="outlined"
                        style={[
                            styles.statusChip,
                            elderly.status === ElderlyStatus.WARNING && styles.warningChip
                        ]}
                    >
                        {elderly.status === ElderlyStatus.WARNING ? 'Need attention' : 'Normal'}
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
                        onPress={() => onCall(elderly.phone || undefined)}
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
