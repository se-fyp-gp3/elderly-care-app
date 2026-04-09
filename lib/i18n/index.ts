import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhHant from "./zh-Hant.json";
import zh from "./zh.json";

const LANGUAGE_STORAGE_KEY = "@app_language";

export const SUPPORTED_LANGUAGES = ["en", "zh", "zh-Hant"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Detect device language, falling back to English */
function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const loc = locales[0];
      if (loc.languageCode === "zh") {
        // Detect Traditional Chinese via language tag or region
        if (
          loc.languageTag?.includes("TW") ||
          loc.languageTag?.includes("HK") ||
          loc.languageTag?.includes("Hant")
        ) {
          return "zh-Hant";
        }
        return "zh";
      }
    }
  } catch {
    // ignore
  }
  return "en";
}

/** Load persisted language from AsyncStorage */
export async function loadPersistedLanguage(): Promise<SupportedLanguage> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage;
    }
  } catch {
    // ignore
  }
  return getDeviceLanguage();
}

/** Persist language choice */
export async function persistLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    "zh-Hant": { translation: zhHant },
  },
  lng: "en", // overridden at runtime by LanguageProvider
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

/** Map i18n language code to a BCP-47 locale for date formatting. */
export function getDateLocale(lang?: string): string {
  const l = lang || i18n.language;
  switch (l) {
    case "zh":
      return "zh-CN";
    case "zh-Hant":
      return "zh-TW";
    default:
      return "en-US";
  }
}

export default i18n;
