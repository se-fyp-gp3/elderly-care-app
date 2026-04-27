import { Elderly, ScheduleCategory, ScheduleStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
    Avatar,
    Button,
    Chip,
    Divider,
    IconButton,
    Modal,
    Portal,
    Searchbar,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";

export interface NewTaskData {
  title: string;
  description: string;
  date: Date;
  time: string;
  remindAt?: Date | null;
  type: string;
  typeId?: string;
  elderlyName: string;
  elderlyId: string;
  status: ScheduleStatus;
}

interface NewTaskModalProps {
  visible: boolean;
  onDismiss: () => void;
  selectionMode: "form" | "elderly" | "type";
  onSelectionModeChange: (mode: "form" | "elderly" | "type") => void;
  newTask: NewTaskData;
  onNewTaskChange: (task: NewTaskData) => void;
  linkedElderly: Elderly[];
  categories: ScheduleCategory[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading: boolean;
  onSave: () => void;
  onOpenDatePicker: () => void;
  onOpenTimePicker: () => void;
  onToggleReminder?: () => void;
  onOpenReminderPicker?: () => void;
  dateLocale?: string;
  onRetryCategories: () => void;
}

export default function NewTaskModal({
  visible,
  onDismiss,
  selectionMode,
  onSelectionModeChange,
  newTask,
  onNewTaskChange,
  linkedElderly,
  categories,
  searchQuery,
  onSearchChange,
  loading,
  onSave,
  onOpenDatePicker,
  onOpenTimePicker,
  onToggleReminder,
  onOpenReminderPicker,
  dateLocale,
  onRetryCategories,
}: NewTaskModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const formattedDate = newTask.date.toLocaleDateString(dateLocale);
  const selectedElderlyLabel = newTask.elderlyId
    ? newTask.elderlyName
    : t("schedule.selectElderly");
  const selectedTypeLabel = newTask.typeId
    ? newTask.type
    : t("schedule.typeActivity");

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        {selectionMode === "form" ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text
              variant="headlineSmall"
              style={{ marginBottom: 20, fontWeight: "bold" }}
            >
              {t("schedule.newTask")}
            </Text>

            <TextInput
              mode="outlined"
              label={t("schedule.title")}
              value={newTask.title}
              onChangeText={(text) =>
                onNewTaskChange({ ...newTask, title: text })
              }
              style={styles.input}
            />

            <TextInput
              mode="outlined"
              label={t("schedule.descriptionLabel")}
              value={newTask.description}
              onChangeText={(text) =>
                onNewTaskChange({ ...newTask, description: text })
              }
              style={styles.input}
              multiline
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <TouchableOpacity
                onPress={onOpenDatePicker}
                style={{ flex: 1, marginRight: 8 }}
              >
                <TextInput
                  mode="outlined"
                  label={t("schedule.date")}
                  value={formattedDate}
                  editable={false}
                  style={styles.input}
                  right={
                    <TextInput.Icon
                      icon="calendar"
                      onPress={onOpenDatePicker}
                    />
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={onOpenTimePicker} style={{ flex: 1 }}>
                <TextInput
                  mode="outlined"
                  label={t("schedule.time")}
                  value={newTask.time}
                  editable={false}
                  style={styles.input}
                  right={
                    <TextInput.Icon icon="clock" onPress={onOpenTimePicker} />
                  }
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => onSelectionModeChange("elderly")}>
              <TextInput
                mode="outlined"
                label={t("schedule.whoIsThisFor")}
                value={selectedElderlyLabel}
                editable={false}
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon="chevron-right"
                    onPress={() => onSelectionModeChange("elderly")}
                  />
                }
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onSelectionModeChange("type")}>
              <TextInput
                mode="outlined"
                label={t("schedule.typeLabel")}
                value={selectedTypeLabel}
                editable={false}
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon="chevron-right"
                    onPress={() => onSelectionModeChange("type")}
                  />
                }
              />
            </TouchableOpacity>

            {typeof onToggleReminder === "function" &&
            typeof onOpenReminderPicker === "function" ? (
              <>
                <Text variant="labelLarge" style={{ marginBottom: 8 }}>
                  {t("schedule.setReminder")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Chip
                    selected={newTask.remindAt != null}
                    onPress={onToggleReminder}
                    style={{
                      backgroundColor: newTask.remindAt
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceVariant,
                    }}
                    icon={newTask.remindAt ? "bell" : "bell-off"}
                  >
                    {newTask.remindAt
                      ? t("schedule.reminderOn")
                      : t("schedule.noReminder")}
                  </Chip>
                </View>
                {newTask.remindAt ? (
                  <TouchableOpacity
                    onPress={onOpenReminderPicker}
                    style={{ marginBottom: 16 }}
                  >
                    <TextInput
                      mode="outlined"
                      label={t("schedule.reminderTime")}
                      value={newTask.remindAt.toLocaleString(dateLocale, {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      editable={false}
                      style={styles.input}
                      right={
                        <TextInput.Icon
                          icon="bell-ring"
                          onPress={onOpenReminderPicker}
                        />
                      }
                    />
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            <Button
              mode="contained"
              onPress={onSave}
              style={{ marginTop: 10, paddingVertical: 5 }}
              loading={loading}
              disabled={loading}
            >
              {t("schedule.saveTask")}
            </Button>
          </ScrollView>
        ) : (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <IconButton
                icon="arrow-left"
                onPress={() => onSelectionModeChange("form")}
              />
              <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                {selectionMode === "elderly"
                  ? t("schedule.selectElderly")
                  : t("schedule.selectType")}
              </Text>
            </View>
            <Divider />
            {selectionMode === "elderly" && (
              <View style={{ paddingVertical: 10 }}>
                <Searchbar
                  placeholder={t("common.search")}
                  onChangeText={onSearchChange}
                  value={searchQuery}
                  style={{
                    backgroundColor: theme.colors.surfaceVariant,
                    height: 40,
                  }}
                  inputStyle={{ minHeight: 0 }}
                />
              </View>
            )}
            <ScrollView style={{ maxHeight: 300 }}>
              {selectionMode === "elderly" ? (
                linkedElderly
                  .filter((e) =>
                    e.name.toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                  .map((item) => (
                    <TouchableOpacity
                      key={item.$id}
                      style={[
                        styles.selectionRow,
                        { borderBottomColor: theme.colors.outlineVariant },
                        {
                          backgroundColor:
                            newTask.elderlyId === item.$id
                              ? theme.colors.secondaryContainer
                              : "transparent",
                        },
                      ]}
                      onPress={() => {
                        onNewTaskChange({
                          ...newTask,
                          elderlyName: item.name,
                          elderlyId: item.$id,
                        });
                        onSelectionModeChange("form");
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
                      {newTask.elderlyId === item.$id && (
                        <MaterialCommunityIcons
                          name="check"
                          size={24}
                          color={theme.colors.onSecondaryContainer}
                          style={{ marginLeft: "auto" }}
                        />
                      )}
                    </TouchableOpacity>
                  ))
              ) : categories.length > 0 ? (
                categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.$id}
                    style={[
                      styles.selectionRow,
                      { borderBottomColor: theme.colors.outlineVariant },
                      {
                        backgroundColor:
                          newTask.typeId === cat.$id
                            ? theme.colors.secondaryContainer
                            : "transparent",
                      },
                    ]}
                    onPress={() => {
                      onNewTaskChange({
                        ...newTask,
                        type: cat.name || t("schedule.typeActivity"),
                        typeId: cat.$id,
                      });
                      onSelectionModeChange("form");
                    }}
                  >
                    <Avatar.Icon
                      size={40}
                      icon={"calendar-check"}
                      style={{
                        marginRight: 16,
                        backgroundColor: theme.colors.secondary,
                      }}
                    />
                    <View>
                      <Text variant="titleMedium">
                        {cat.name || t("schedule.typeActivity")}
                      </Text>
                    </View>
                    {newTask.typeId === cat.$id && (
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={theme.colors.onSecondaryContainer}
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text
                    style={{
                      marginBottom: 10,
                      color: theme.colors.secondary,
                    }}
                  >
                    {t("schedule.noCategoriesFound")}
                  </Text>
                  <Button mode="outlined" onPress={onRetryCategories}>
                    {t("schedule.retryLoading")}
                  </Button>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: "80%",
  },
  input: {
    marginBottom: 10,
  },
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    borderRadius: 12,
  },
});
