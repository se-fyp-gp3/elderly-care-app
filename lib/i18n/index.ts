import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "react-native-localize";
import en from "./en.json";
import zh from "./zh.json";

const LANGUAGE_STORAGE_KEY = "@app_language";

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Detect device language, falling back to English */
function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const tag = locales[0].languageCode;
      if (tag === "zh") return "zh";
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
  },
  lng: "en", // overridden at runtime by LanguageProvider
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

export default i18n;
