import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

export default function StartScreen() {
  const theme = useTheme();
  const router = useRouter();

  const handleRoleSelect = (role: "elderly" | "caregiver") => {
    router.push(`/signup?role=${role}`);
  };

  const handleSignIn = () => {
    router.push("/auth");
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <Text variant="headlineLarge" style={styles.title}>
          Welcome to{"\n"}Elderly Care
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Choose your role to get started
        </Text>

        <View style={styles.cardsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.roleCard,
              { backgroundColor: "#2196F3", opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => handleRoleSelect("elderly")}
          >
            <MaterialCommunityIcons name="human-cane" size={64} color="white" />
            <Text variant="headlineSmall" style={styles.roleTitle}>
              Elderly
            </Text>
            <Text variant="bodyMedium" style={styles.roleDescription}>
              I need care and assistance
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.roleCard,
              { backgroundColor: "#4CAF50", opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => handleRoleSelect("caregiver")}
          >
            <MaterialCommunityIcons name="hand-heart" size={64} color="white" />
            <Text variant="headlineSmall" style={styles.roleTitle}>
              Caregiver
            </Text>
            <Text variant="bodyMedium" style={styles.roleDescription}>
              I provide care and support
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text variant="bodyMedium" style={styles.footerText}>
            Already have an account?
          </Text>
          <Button mode="text" onPress={handleSignIn}>
            Sign In
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 48,
  },
  cardsContainer: {
    gap: 20,
  },
  roleCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  roleTitle: {
    color: "white",
    fontWeight: "bold",
    marginTop: 16,
  },
  roleDescription: {
    color: "white",
    opacity: 0.9,
    marginTop: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 48,
  },
  footerText: {
    opacity: 0.7,
  },
});
