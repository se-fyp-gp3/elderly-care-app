import { useAuth } from "@/lib/auth-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Role } from "@/types/user";

export default function StartScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut, setPreference } = useAuth();

  const handleRoleSelect = (role: Role) => {
    if (!user) {
      router.push(`/signup?role=${role}`);
    } else {
      setPreference("role", role);
      router.push("/profile-setup");
    }
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
            onPress={() => handleRoleSelect(Role.Elderly)}
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
            onPress={() => handleRoleSelect(Role.Caregiver)}
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

        <View style={[styles.footer, user && styles.footerLoggedIn]}>
          {user ? (
            <>
              <Text variant="bodyMedium" style={styles.footerText}>
                Logged in as {user.email}
              </Text>
              <View style={styles.signOutRow}>
                <Text variant="bodyMedium" style={styles.footerText}>
                  Not you?
                </Text>
                <Button mode="text" onPress={signOut}>
                  Sign Out
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text variant="bodyMedium" style={styles.footerText}>
                Already have an account?
              </Text>
              <Button mode="text" onPress={handleSignIn}>
                Sign In
              </Button>
            </>
          )}
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
    flexWrap: "wrap",
  },
  footerLoggedIn: {
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
  },
  footerText: {
    opacity: 0.7,
    textAlign: "center",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
});
