import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { FontSize } from "../types/user";

const STORAGE_KEY = "@app_font_size";

const SCALE_MAP: Record<FontSize, number> = {
  [FontSize.Small]: 0.85,
  [FontSize.Medium]: 1.0,
  [FontSize.Large]: 1.25,
};

type FontSizeContextType = {
  fontSize: FontSize;
  fontScale: number;
  setFontSize: (size: FontSize) => Promise<void>;
  scaledSize: (base: number) => number;
};

const FontSizeContext = createContext<FontSizeContextType>({
  fontSize: FontSize.Medium,
  fontScale: 1.0,
  setFontSize: async () => {},
  scaledSize: (base: number) => base,
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(FontSize.Medium);
  const [isReady, setIsReady] = useState(false);

  // Load persisted font size on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && Object.values(FontSize).includes(stored as FontSize)) {
          setFontSizeState(stored as FontSize);
        }
      } catch (e) {
        console.error("Error loading font size:", e);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const fontScale = SCALE_MAP[fontSize];

  const setFontSize = useCallback(async (size: FontSize) => {
    setFontSizeState(size);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, size);
    } catch (e) {
      console.error("Error saving font size:", e);
    }
  }, []);

  const scaledSize = useCallback(
    (base: number) => Math.round(base * fontScale),
    [fontScale],
  );

  if (!isReady) return null;

  return (
    <FontSizeContext.Provider value={{ fontSize, fontScale, setFontSize, scaledSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const context = useContext(FontSizeContext);
  if (!context) {
    throw new Error("useFontSize must be used within a FontSizeProvider");
  }
  return context;
}
