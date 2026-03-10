import { Elderly, ScheduleCategory, ScheduleStatus } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import {
    Avatar,
    Button,
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
  onRetryCategories,
}: NewTaskModalProps) {
  const theme = useTheme();

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
              New Task
            </Text>

            <TextInput
              mode="outlined"
              label="Title"
              value={newTask.title}
              onChangeText={(text) =>
                onNewTaskChange({ ...newTask, title: text })
              }
              style={styles.input}
            />

            <TextInput
              mode="outlined"
              label="Description"
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
                  label="Date"
                  value={newTask.date.toLocaleDateString()}
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

              <TouchableOpacity
                onPress={onOpenTimePicker}
                style={{ flex: 1 }}
              >
                <TextInput
                  mode="outlined"
                  label="Time"
                  value={newTask.time}
                  editable={false}
                  style={styles.input}
                  right={
                    <TextInput.Icon
                      icon="clock"
                      onPress={onOpenTimePicker}
                    />
                  }
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => onSelectionModeChange("elderly")}
            >
              <TextInput
                mode="outlined"
                label="Who is this for?"
                value={newTask.elderlyName}
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
                label="Type"
                value={newTask.type}
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

            <Button
              mode="contained"
              onPress={onSave}
              style={{ marginTop: 10, paddingVertical: 5 }}
              loading={loading}
              disabled={loading}
            >
              Save Task
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
                  ? "Select Elderly"
                  : "Select Type"}
              </Text>
            </View>
            <Divider />
            {selectionMode === "elderly" && (
              <View style={{ paddingVertical: 10 }}>
                <Searchbar
                  placeholder="Search"
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
                    e.name
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase()),
                  )
                  .map((item) => (
                    <TouchableOpacity
                      key={item.$id}
                      style={[
                        styles.selectionRow,
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
                        type: cat.name || "Activity",
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
                        {cat.name || "Activity"}
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
                    No categories found.
                  </Text>
                  <Button mode="outlined" onPress={onRetryCategories}>
                    Retry Loading
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
