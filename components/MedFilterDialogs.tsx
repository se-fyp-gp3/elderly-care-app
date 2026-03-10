import { MedicationItem } from "@/components/MedicationCard";
import { Elderly } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import {
    Avatar,
    Button,
    Dialog,
    Searchbar,
    Text,
    useTheme,
} from "react-native-paper";

/* ─── Elderly Filter Dialog ─── */

interface ElderlyFilterDialogProps {
  visible: boolean;
  onDismiss: () => void;
  linkedElderly: Elderly[];
  selectedElderlyId: string;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ElderlyFilterDialog({
  visible,
  onDismiss,
  linkedElderly,
  selectedElderlyId,
  onSelect,
  searchQuery,
  onSearchChange,
}: ElderlyFilterDialogProps) {
  const theme = useTheme();

  return (
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
            onPress={() => onSelect("All")}
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
            .map((item) => (
              <TouchableOpacity
                key={item.$id}
                style={[
                  styles.selectionRow,
                  {
                    backgroundColor:
                      selectedElderlyId === item.$id
                        ? theme.colors.secondaryContainer
                        : "transparent",
                  },
                ]}
                onPress={() => onSelect(item.$id)}
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
                {selectedElderlyId === item.$id && (
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
  );
}

/* ─── Status Filter Dialog ─── */

interface StatusFilterDialogProps {
  visible: boolean;
  onDismiss: () => void;
  statusFilter: string;
  onSelect: (status: string) => void;
}

export function StatusFilterDialog({
  visible,
  onDismiss,
  statusFilter,
  onSelect,
}: StatusFilterDialogProps) {
  const theme = useTheme();

  return (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      style={{ backgroundColor: theme.colors.surface }}
    >
      <Dialog.Title>Filter Status</Dialog.Title>
      <Dialog.Content>
        {["all", "pending", "completed", "missed"].map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.selectionRow,
              {
                backgroundColor:
                  statusFilter === status
                    ? theme.colors.secondaryContainer
                    : "transparent",
              },
            ]}
            onPress={() => onSelect(status)}
          >
            <MaterialCommunityIcons
              name={
                status === "all"
                  ? "filter-variant"
                  : status === "pending"
                    ? "clock-outline"
                    : status === "completed"
                      ? "check-circle-outline"
                      : "alert-circle-outline"
              }
              size={24}
              color={theme.colors.onSurface}
              style={{ marginRight: 16 }}
            />
            <Text variant="titleMedium">
              {status === "all"
                ? "All Status"
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
            {statusFilter === status && (
              <MaterialCommunityIcons
                name="check"
                size={24}
                color={theme.colors.onSecondaryContainer}
                style={{ marginLeft: "auto" }}
              />
            )}
          </TouchableOpacity>
        ))}
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

/* ─── Confirm Medication Dialog ─── */

interface ConfirmMedicationDialogProps {
  medItem: MedicationItem | null;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function ConfirmMedicationDialog({
  medItem,
  onDismiss,
  onConfirm,
}: ConfirmMedicationDialogProps) {
  return (
    <Dialog visible={medItem !== null} onDismiss={onDismiss}>
      <Dialog.Title>Confirm Medication</Dialog.Title>
      <Dialog.Content>
        <Text>
          Confirm {medItem?.name} for {medItem?.elderly}?
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button onPress={onConfirm}>Confirm</Button>
      </Dialog.Actions>
    </Dialog>
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
