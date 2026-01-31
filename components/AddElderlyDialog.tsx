import { useAuth } from '@/lib/auth-context';
import { getCaregiverByUserId, linkCaregiverToElderly } from '@/lib/caregiver';
import { createElderlyProfile } from '@/lib/elderly';
import { Elderly, ElderlyStatus } from '@/types/appwrite';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ID } from 'react-native-appwrite';
import { Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

interface AddElderlyDialogProps {
    visible: boolean;
    onDismiss: () => void;
    onSuccess: () => void;
}

export default function AddElderlyDialog({ visible, onDismiss, onSuccess }: AddElderlyDialogProps) {
    const theme = useTheme();
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [birthDate, setBirthDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!name.trim()) {
            setError('Please enter a name');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (!user) throw new Error("No user logged in");
            
            // 1. Get Caregiver ID (assuming 1:1 map with user for now or fetching profile)
            const caregiver = await getCaregiverByUserId(user.$id);
            if (!caregiver) throw new Error("Caregiver profile not found. Please complete your profile first.");

            // 2. Create Elderly
            // Use ID.unique() for user_id as a placeholder for now
            const newElderlyData = {
                user_id: ID.unique(), 
                name: name.trim(),
                phone: phone.trim() || null,
                birth: birthDate.toISOString(),
                status: ElderlyStatus.NORMAL,
            };

            // Cast to any to bypass strict Row type requirements like $id for creation payload
            const newElderly = await createElderlyProfile(newElderlyData as unknown as Elderly);

            // 3. Link Caregiver and Elderly
            await linkCaregiverToElderly(caregiver.$id, newElderly.$id);

            onSuccess();
            handleDismiss();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to add elderly");
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = () => {
        // Reset form
        setName('');
        setPhone('');
        setBirthDate(new Date());
        setError(null);
        onDismiss();
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        const currentDate = selectedDate || birthDate;
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        setBirthDate(currentDate);
    };

    return (
        <Portal>
            <Dialog visible={visible} onDismiss={handleDismiss} style={{ backgroundColor: theme.colors.background }}>
                <Dialog.Title style={{ textAlign: 'center' }}>Add Elderly</Dialog.Title>
                <Dialog.Content>
                    <Text variant="bodyMedium" style={{ marginBottom: 16, textAlign: 'center', color: theme.colors.secondary }}>
                        Add a new elderly person to your care list.
                    </Text>

                    <TextInput
                        label="Name *"
                        value={name}
                        onChangeText={setName}
                        mode="outlined"
                        style={styles.input}
                        error={!!error && !name}
                        left={<TextInput.Icon icon="account" />}
                    />

                    <TextInput
                        label="Phone Number"
                        value={phone}
                        onChangeText={setPhone}
                        mode="outlined"
                        keyboardType="phone-pad"
                        style={styles.input}
                        left={<TextInput.Icon icon="phone" />}
                    />

                    <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                        <View pointerEvents="none">
                            <TextInput
                                label="Date of Birth"
                                value={birthDate.toLocaleDateString()}
                                mode="outlined"
                                style={styles.input}
                                editable={false} // Make it readonly, clicks are handled by TouchableOpacity
                                left={<TextInput.Icon icon="calendar" />}
                                right={<TextInput.Icon icon="chevron-down" />}
                            />
                        </View>
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            testID="dateTimePicker"
                            value={birthDate}
                            mode="date"
                            display="default"
                            onChange={onDateChange}
                            maximumDate={new Date()}
                        />
                    )}

                    {error && (
                        <HelperText type="error" visible={!!error}>
                            {error}
                        </HelperText>
                    )}
                </Dialog.Content>
                <Dialog.Actions style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                    <Button onPress={handleDismiss} style={{ marginRight: 8 }}>Cancel</Button>
                    <Button 
                        mode="contained" 
                        onPress={handleSubmit} 
                        loading={loading} 
                        disabled={loading}
                    >
                        Add Person
                    </Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    input: {
        marginBottom: 12,
        backgroundColor: 'transparent',
    },
});
