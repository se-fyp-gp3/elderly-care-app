import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import {
    Avatar,
    Button,
    Dialog,
    Portal,
    Searchbar,
    Text,
    useTheme,
} from "react-native-paper";

interface ScheduleFilterDialogProps {
  visible: boolean;
  onDismiss: () => void;
  linkedElderly: Elderly[];
  selectedElderlyId: string;
  onSelectElderly: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function ScheduleFilterDialog({
  visible,
  onDismiss,
  linkedElderly,
  selectedElderlyId,
  onSelectElderly,
  searchQuery,
  onSearchChange,
}: ScheduleFilterDialogProps) {
  const theme = useTheme();

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Dialog.Title>Select Elderly</Dialog.Title>
        <Dialog.Content style={{ paddingBottom: 0 }}>
          <Searchbar
            placeholder="Search"
            onChangeText={onSearchChange}
            value={searchQuery}
            style={{
              backgroundColor: theme.colors.surfaceVariant,
              height: 40,
              marginBottom: 10,
            }}
            inputStyle={{ minHeight: 0 }}
          />
          <ScrollView style={{ maxHeight: 300 }}>
            <TouchableOpacity
              style={[
                styles.selectionRow,
                {
                  backgroundColor:
                    selectedElderlyId === "All"
                      ? theme.colors.secondaryContainer
                      : "transparent",
                },
              ]}
              onPress={() => onSelectElderly("All")}
            >
              <Avatar.Icon
                size={40}
                icon="account-group"
                style={{
                  marginRight: 16,
                  backgroundColor: theme.colors.secondary,
                }}
              />
              <Text variant="titleMedium">Everyone</Text>
              {selectedElderlyId === "All" && (
                <MaterialCommunityIcons
                  name="check"
                  size={24}
                  color={theme.colors.onSecondaryContainer}
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>
            {linkedElderly
              .filter((e) =>
                e.name.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((elderly) => (
                <TouchableOpacity
                  key={elderly.$id}
                  style={[
                    styles.selectionRow,
                    {
                      backgroundColor:
                        selectedElderlyId === elderly.$id
                          ? theme.colors.secondaryContainer
                          : "transparent",
                    },
                  ]}
                  onPress={() => onSelectElderly(elderly.$id)}
                >
                  <Avatar.Text
                    size={40}
                    label={elderly.name.substring(0, 2)}
                    style={{
                      marginRight: 16,
                      backgroundColor: theme.colors.secondary,
                    }}
                  />
                  <Text variant="titleMedium">{elderly.name}</Text>
                  {selectedElderlyId === elderly.$id && (
                    <MaterialCommunityIcons
                      name="check"
                      size={24}
                      color={theme.colors.onSecondaryContainer}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              ))}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
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
