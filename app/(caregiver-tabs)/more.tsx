import { useAuth } from "@/lib/auth-context";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function More() {
  const { signOut } = useAuth();
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          More
        </Text>
      </View>
      <Button mode="contained" onPress={signOut} style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </Button>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#ff3b30",
    marginTop: 8,
  },
  logoutButtonText: { color: "#fff", fontSize: 18 },
  text: { fontSize: 18 },
});
