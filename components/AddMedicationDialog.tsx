import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, TouchableOpacity, View, Platform, Modal as RNModal } from "react-native";
import {
    Avatar,
    Button,
    Chip,
    Dialog,
    Divider,
    IconButton,
    Searchbar,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";

export interface MedicationFormData {
  elderlyId: string;
  elderlyName: string;
  name: string;
  unit: string;
  dosage: string;
  frequency: string;
  times: Date[];
}

interface AddMedicationDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: () => void;
  step: "form" | "elderly" | "frequency";
  onStepChange: (step: "form" | "elderly" | "frequency") => void;
  formData: MedicationFormData;
  onFormDataChange: (updater: (prev: MedicationFormData) => MedicationFormData) => void;
  linkedElderly: Elderly[];
  elderlySearch: string;
  onElderlySearchChange: (q: string) => void;
  showTimePicker: boolean;
  onShowTimePicker: (show: boolean) => void;
  editingTimeIndex: number | null;
  onEditingTimeIndexChange: (idx: number | null) => void;
}

export function AddMedicationDialog({
  visible,
  onDismiss,
  onSave,
  step,
  onStepChange,
  formData,
  onFormDataChange,
  linkedElderly,
  elderlySearch,
  onElderlySearchChange,
  showTimePicker,
  onShowTimePicker,
  editingTimeIndex,
  onEditingTimeIndexChange,
}: AddMedicationDialogProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  // Local state for text inputs to prevent IME composition interruption
  const [localName, setLocalName] = React.useState(formData.name);
  const [localUnit, setLocalUnit] = React.useState(formData.unit);

  // Sync local state when dialog opens or formData resets externally
  React.useEffect(() => {
    if (visible) {
      setLocalName(formData.name);
      setLocalUnit(formData.unit);
    }
  }, [visible]);

  // Temp state for iOS spinner picker
  const [tempTime, setTempTime] = React.useState<Date>(new Date());

  // Initialize temp time when picker opens
  React.useEffect(() => {
    if (showTimePicker) {
      setTempTime(
        editingTimeIndex !== null && editingTimeIndex >= 0
          ? formData.times[editingTimeIndex]
          : new Date()
      );
    }
  }, [showTimePicker]);

  const applyTimeSelection = (selectedDate: Date) => {
    if (editingTimeIndex === -1) {
      onFormDataChange((prev) => ({
        ...prev,
        times: [...prev.times, selectedDate],
      }));
    } else if (editingTimeIndex !== null) {
      onFormDataChange((prev) => {
        const newTimes = [...prev.times];
        newTimes[editingTimeIndex] = selectedDate;
        return { ...prev, times: newTimes };
      });
    }
    onEditingTimeIndexChange(null);
  };

  const handleTimePickerChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "ios") {
      if (selectedDate) setTempTime(selectedDate);
      return;
    }
    onShowTimePicker(false);
    if (selectedDate) applyTimeSelection(selectedDate);
  };

  const handleTimePickerDone = () => {
    onShowTimePicker(false);
    applyTimeSelection(tempTime);
  };

  const handleSave = () => {
    // Sync local text state to parent before saving
    onFormDataChange((prev) => ({ ...prev, name: localName, unit: localUnit }));
    // Use setTimeout to ensure state update is applied before save callback
    setTimeout(onSave, 0);
  };

  return (
    <>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ maxHeight: "80%" }}
      >
        {step === "form" ? (
          <View>
            <Dialog.Title>{t('medication.addNewMedication')}</Dialog.Title>
            <Dialog.ScrollArea>
              <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                <TouchableOpacity onPress={() => onStepChange("elderly")}>
                  <TextInput
                    label={t('medication.selectElderly')}
                    value={
                      formData.elderlyName ||
                      linkedElderly.find((e) => e.$id === formData.elderlyId)
                        ?.name ||
                      ""
                    }
                    editable={false}
                    right={
                      <TextInput.Icon
                        icon="chevron-right"
                        onPress={() => onStepChange("elderly")}
                      />
                    }
                    mode="outlined"
                    style={{ marginBottom: 10 }}
                  />
                </TouchableOpacity>

                <TextInput
                  label={t('medication.medicationName')}
                  value={localName}
                  onChangeText={setLocalName}
                  onBlur={() => onFormDataChange((prev) => ({ ...prev, name: localName }))}
                  style={{ marginBottom: 10 }}
                  mode="outlined"
                />
                <View
                  style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}
                >
                  <TextInput
                    label={t('medication.dosage')}
                    value={formData.dosage}
                    keyboardType="numeric"
                    onChangeText={(val) =>
                      onFormDataChange((prev) => ({ ...prev, dosage: val }))
                    }
                    style={{ flex: 1 }}
                    mode="outlined"
                  />
                  <TextInput
                    label={t('medication.unit')}
                    value={localUnit}
                    onChangeText={setLocalUnit}
                    onBlur={() => onFormDataChange((prev) => ({ ...prev, unit: localUnit }))}
                    style={{ flex: 1 }}
                    mode="outlined"
                  />
                </View>

                <TouchableOpacity onPress={() => onStepChange("frequency")}>
                  <TextInput
                    label={t('medication.frequency')}
                    value={formData.frequency}
                    editable={false}
                    right={
                      <TextInput.Icon
                        icon="chevron-right"
                        onPress={() => onStepChange("frequency")}
                      />
                    }
                    mode="outlined"
                    style={{ marginBottom: 10 }}
                  />
                </TouchableOpacity>

                <Text style={{ marginBottom: 5 }}>{t('medication.reminderTimesLabel')}</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {formData.times.map((t, idx) => (
                    <Chip
                      key={idx}
                      icon="clock"
                      onClose={() =>
                        onFormDataChange((prev) => ({
                          ...prev,
                          times: prev.times.filter((_, i) => i !== idx),
                        }))
                      }
                      onPress={() => {
                        onEditingTimeIndexChange(idx);
                        onShowTimePicker(true);
                      }}
                    >
                      {t.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Chip>
                  ))}
                  <Chip
                    icon="plus"
                    onPress={() => {
                      onEditingTimeIndexChange(-1);
                      onShowTimePicker(true);
                    }}
                  >
                    {t('medication.addTime')}
                  </Chip>
                </View>
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={onDismiss}>{t('common.cancel')}</Button>
              <Button onPress={handleSave}>{t('common.save')}</Button>
            </Dialog.Actions>
          </View>
        ) : (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 10,
              }}
            >
              <IconButton
                icon="arrow-left"
                onPress={() => onStepChange("form")}
              />
              <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                {step === "elderly" ? t('medication.selectElderly') : t('medication.selectFrequency')}
              </Text>
            </View>
            <Divider />
            {step === "elderly" && (
              <View style={{ padding: 10 }}>
                <Searchbar
                  placeholder={t('common.search')}
                  onChangeText={onElderlySearchChange}
                  value={elderlySearch}
                  style={{
                    backgroundColor: theme.colors.surfaceVariant,
                    height: 40,
                  }}
                  inputStyle={{ minHeight: 0 }}
                />
              </View>
            )}
            <Dialog.ScrollArea>
              <ScrollView style={{ maxHeight: 300 }}>
                {step === "elderly"
                  ? linkedElderly
                      .filter((e) =>
                        e.name
                          .toLowerCase()
                          .includes(elderlySearch.toLowerCase()),
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.$id}
                          style={[
                            styles.selectionRow,
                            {
                              backgroundColor:
                                formData.elderlyId === item.$id
                                  ? theme.colors.secondaryContainer
                                  : "transparent",
                            },
                          ]}
                          onPress={() => {
                            onFormDataChange((prev) => ({
                              ...prev,
                              elderlyId: item.$id,
                              elderlyName: item.name,
                            }));
                            onStepChange("form");
                          }}
                        >
                          <Avatar.Text
                            size={40}
                            label={item.name.substring(0, 2)}
                            style={{
                              marginRight: 16,
                              backgroundColor: theme.colors.secondary,
                            }}
                          />
                          <Text variant="titleMedium">{item.name}</Text>
                          {formData.elderlyId === item.$id && (
                            <MaterialCommunityIcons
                              name="check"
                              size={24}
                              color={theme.colors.onSecondaryContainer}
                              style={{ marginLeft: "auto" }}
                            />
                          )}
                        </TouchableOpacity>
                      ))
                  : [t('medication.daily'), t('medication.twiceADay'), t('medication.threeTimesDay'), t('medication.weekly')].map(
                      (f) => (
                        <TouchableOpacity
                          key={f}
                          style={[
                            styles.selectionRow,
                            {
                              backgroundColor:
                                formData.frequency === f
                                  ? theme.colors.secondaryContainer
                                  : "transparent",
                            },
                          ]}
                          onPress={() => {
                            onFormDataChange((prev) => ({
                              ...prev,
                              frequency: f,
                            }));
                            onStepChange("form");
                          }}
                        >
                          <Text variant="titleMedium">{f}</Text>
                          {formData.frequency === f && (
                            <MaterialCommunityIcons
                              name="check"
                              size={24}
                              color={theme.colors.onSecondaryContainer}
                              style={{ marginLeft: "auto" }}
                            />
                          )}
                        </TouchableOpacity>
                      ),
                    )}
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={() => onStepChange("form")}>{t('common.back')}</Button>
            </Dialog.Actions>
          </View>
        )}
      </Dialog>

      {showTimePicker && Platform.OS === "ios" ? (
        <RNModal visible transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Button onPress={() => { onShowTimePicker(false); onEditingTimeIndexChange(null); }}>{t('common.cancel')}</Button>
                <Button onPress={handleTimePickerDone}>{t('common.done')}</Button>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={handleTimePickerChange}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </RNModal>
      ) : showTimePicker ? (
        <DateTimePicker
          value={
            editingTimeIndex !== null && editingTimeIndex >= 0
              ? formData.times[editingTimeIndex]
              : new Date()
          }
          mode="time"
          display="default"
          onChange={handleTimePickerChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
    alignItems: "center",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    padding: 8,
  },
});
