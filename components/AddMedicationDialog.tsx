import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
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

  const handleTimePickerChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    onShowTimePicker(false);
    if (selectedDate) {
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
    }
    onEditingTimeIndexChange(null);
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
            <Dialog.Title>Add New Medication</Dialog.Title>
            <Dialog.ScrollArea>
              <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                <TouchableOpacity onPress={() => onStepChange("elderly")}>
                  <TextInput
                    label="Select Elderly"
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
                  label="Medication Name"
                  value={formData.name}
                  onChangeText={(val) =>
                    onFormDataChange((prev) => ({ ...prev, name: val }))
                  }
                  style={{ marginBottom: 10 }}
                  mode="outlined"
                />
                <View
                  style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}
                >
                  <TextInput
                    label="Dosage"
                    value={formData.dosage}
                    keyboardType="numeric"
                    onChangeText={(val) =>
                      onFormDataChange((prev) => ({ ...prev, dosage: val }))
                    }
                    style={{ flex: 1 }}
                    mode="outlined"
                  />
                  <TextInput
                    label="Unit"
                    value={formData.unit}
                    onChangeText={(val) =>
                      onFormDataChange((prev) => ({ ...prev, unit: val }))
                    }
                    style={{ flex: 1 }}
                    mode="outlined"
                  />
                </View>

                <TouchableOpacity onPress={() => onStepChange("frequency")}>
                  <TextInput
                    label="Frequency"
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

                <Text style={{ marginBottom: 5 }}>Reminder Times:</Text>
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
                    Add Time
                  </Chip>
                </View>
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={onDismiss}>Cancel</Button>
              <Button onPress={onSave}>Save</Button>
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
                {step === "elderly" ? "Select Elderly" : "Select Frequency"}
              </Text>
            </View>
            <Divider />
            {step === "elderly" && (
              <View style={{ padding: 10 }}>
                <Searchbar
                  placeholder="Search"
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
                  : ["Daily", "Twice a day", "3 times/day", "Weekly"].map(
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
              <Button onPress={() => onStepChange("form")}>Back</Button>
            </Dialog.Actions>
          </View>
        )}
      </Dialog>

      {showTimePicker && (
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
      )}
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
});
