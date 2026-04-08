import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import i18n, {
    loadPersistedLanguage,
    persistLanguage,
    SupportedLanguage,
} from "./i18n/index";

type LanguageContextType = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const lang = await loadPersistedLanguage();
      setLanguageState(lang);
      await i18n.changeLanguage(lang);
      setIsReady(true);
    })();
  }, []);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    await i18n.changeLanguage(lang);
    await persistLanguage(lang);
  }, []);

  if (!isReady) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
