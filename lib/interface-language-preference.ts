import { UserPreferences } from "@/types/user";
import { Platform } from "react-native";
import type { SupportedLanguage } from "./i18n";
import { account, accountWeb } from "./appwrite";

export async function syncUserInterfaceLanguagePreference(
  language: SupportedLanguage,
  existingPrefs?: UserPreferences | null,
): Promise<void> {
  try {
    const appwriteAccount = Platform.OS === "web" ? accountWeb : account;
    const prefs =
      existingPrefs ??
      (((await appwriteAccount.get()).prefs as UserPreferences | undefined) ?? {});

    if (prefs.interfaceLanguage === language) {
      return;
    }

    await appwriteAccount.updatePrefs({
      prefs: {
        ...prefs,
        interfaceLanguage: language,
      },
    });
  } catch {
    // Ignore when there is no active session or prefs cannot be updated.
  }
}