import {
    DATABASE_ID,
    EMERGENCY_ALERTS_TABLE_ID,
    safeSubscribe,
} from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";
import {
    fetchEmergencyAlerts,
    resolveEmergencyAlert,
    updateAlertStatus,
} from "@/lib/emergency";
import i18n from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import type { EmergencyAlert } from "@/types/appwrite";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useColorScheme,
    View,
} from "react-native";
import {
    Button,
    Chip,
    Dialog,
    Divider,
    Menu,
    Portal,
    Searchbar,
    Surface,
    Text,
    useTheme,
} from "react-native-paper";

/* ── Helpers ────────────────────────────────────────────── */

type AppLanguage = "en" | "zh" | "zh-Hant";

type LocalizedPlaceName = Record<AppLanguage, string>;

const HONG_KONG_LOCATION_TRANSLATIONS: Record<string, LocalizedPlaceName> = {
  "hong kong": { en: "Hong Kong", zh: "香港", "zh-Hant": "香港" },
  "香港": { en: "Hong Kong", zh: "香港", "zh-Hant": "香港" },
  "香港特别行政区": { en: "Hong Kong", zh: "香港", "zh-Hant": "香港" },
  "香港特別行政區": { en: "Hong Kong", zh: "香港", "zh-Hant": "香港" },
  "hong kong island": {
    en: "Hong Kong Island",
    zh: "香港岛",
    "zh-Hant": "香港島",
  },
  "香港岛": { en: "Hong Kong Island", zh: "香港岛", "zh-Hant": "香港島" },
  "香港島": { en: "Hong Kong Island", zh: "香港岛", "zh-Hant": "香港島" },
  kowloon: { en: "Kowloon", zh: "九龙", "zh-Hant": "九龍" },
  "九龙": { en: "Kowloon", zh: "九龙", "zh-Hant": "九龍" },
  "九龍": { en: "Kowloon", zh: "九龙", "zh-Hant": "九龍" },
  "new territories": {
    en: "New Territories",
    zh: "新界",
    "zh-Hant": "新界",
  },
  "中西区": {
    en: "Central and Western District",
    zh: "中西区",
    "zh-Hant": "中西區",
  },
  "中西區": {
    en: "Central and Western District",
    zh: "中西区",
    "zh-Hant": "中西區",
  },
  "central and western": {
    en: "Central and Western District",
    zh: "中西区",
    "zh-Hant": "中西區",
  },
  "central and western district": {
    en: "Central and Western District",
    zh: "中西区",
    "zh-Hant": "中西區",
  },
  "central & western": {
    en: "Central and Western District",
    zh: "中西区",
    "zh-Hant": "中西區",
  },
  "wan chai": { en: "Wan Chai District", zh: "湾仔区", "zh-Hant": "灣仔區" },
  "wan chai district": {
    en: "Wan Chai District",
    zh: "湾仔区",
    "zh-Hant": "灣仔區",
  },
  "湾仔区": { en: "Wan Chai District", zh: "湾仔区", "zh-Hant": "灣仔區" },
  "灣仔區": { en: "Wan Chai District", zh: "湾仔区", "zh-Hant": "灣仔區" },
  eastern: { en: "Eastern District", zh: "东区", "zh-Hant": "東區" },
  "eastern district": { en: "Eastern District", zh: "东区", "zh-Hant": "東區" },
  "东区": { en: "Eastern District", zh: "东区", "zh-Hant": "東區" },
  "東區": { en: "Eastern District", zh: "东区", "zh-Hant": "東區" },
  southern: { en: "Southern District", zh: "南区", "zh-Hant": "南區" },
  "southern district": {
    en: "Southern District",
    zh: "南区",
    "zh-Hant": "南區",
  },
  "南区": { en: "Southern District", zh: "南区", "zh-Hant": "南區" },
  "南區": { en: "Southern District", zh: "南区", "zh-Hant": "南區" },
  "yau tsim mong": {
    en: "Yau Tsim Mong District",
    zh: "油尖旺区",
    "zh-Hant": "油尖旺區",
  },
  "yau tsim mong district": {
    en: "Yau Tsim Mong District",
    zh: "油尖旺区",
    "zh-Hant": "油尖旺區",
  },
  "油尖旺区": {
    en: "Yau Tsim Mong District",
    zh: "油尖旺区",
    "zh-Hant": "油尖旺區",
  },
  "油尖旺區": {
    en: "Yau Tsim Mong District",
    zh: "油尖旺区",
    "zh-Hant": "油尖旺區",
  },
  "sham shui po": {
    en: "Sham Shui Po District",
    zh: "深水埗区",
    "zh-Hant": "深水埗區",
  },
  "sham shui po district": {
    en: "Sham Shui Po District",
    zh: "深水埗区",
    "zh-Hant": "深水埗區",
  },
  "深水埗区": {
    en: "Sham Shui Po District",
    zh: "深水埗区",
    "zh-Hant": "深水埗區",
  },
  "深水埗區": {
    en: "Sham Shui Po District",
    zh: "深水埗区",
    "zh-Hant": "深水埗區",
  },
  "kowloon city": {
    en: "Kowloon City District",
    zh: "九龙城区",
    "zh-Hant": "九龍城區",
  },
  "kowloon city district": {
    en: "Kowloon City District",
    zh: "九龙城区",
    "zh-Hant": "九龍城區",
  },
  "九龙城区": {
    en: "Kowloon City District",
    zh: "九龙城区",
    "zh-Hant": "九龍城區",
  },
  "九龍城區": {
    en: "Kowloon City District",
    zh: "九龙城区",
    "zh-Hant": "九龍城區",
  },
  "wong tai sin": {
    en: "Wong Tai Sin District",
    zh: "黄大仙区",
    "zh-Hant": "黃大仙區",
  },
  "wong tai sin district": {
    en: "Wong Tai Sin District",
    zh: "黄大仙区",
    "zh-Hant": "黃大仙區",
  },
  "黄大仙区": {
    en: "Wong Tai Sin District",
    zh: "黄大仙区",
    "zh-Hant": "黃大仙區",
  },
  "黃大仙區": {
    en: "Wong Tai Sin District",
    zh: "黄大仙区",
    "zh-Hant": "黃大仙區",
  },
  "kwun tong": {
    en: "Kwun Tong District",
    zh: "观塘区",
    "zh-Hant": "觀塘區",
  },
  "kwun tong district": {
    en: "Kwun Tong District",
    zh: "观塘区",
    "zh-Hant": "觀塘區",
  },
  "观塘区": {
    en: "Kwun Tong District",
    zh: "观塘区",
    "zh-Hant": "觀塘區",
  },
  "觀塘區": {
    en: "Kwun Tong District",
    zh: "观塘区",
    "zh-Hant": "觀塘區",
  },
  "tsuen wan": {
    en: "Tsuen Wan District",
    zh: "荃湾区",
    "zh-Hant": "荃灣區",
  },
  "tsuen wan district": {
    en: "Tsuen Wan District",
    zh: "荃湾区",
    "zh-Hant": "荃灣區",
  },
  "荃湾区": {
    en: "Tsuen Wan District",
    zh: "荃湾区",
    "zh-Hant": "荃灣區",
  },
  "荃灣區": {
    en: "Tsuen Wan District",
    zh: "荃湾区",
    "zh-Hant": "荃灣區",
  },
  "tuen mun": {
    en: "Tuen Mun District",
    zh: "屯门区",
    "zh-Hant": "屯門區",
  },
  "tuen mun district": {
    en: "Tuen Mun District",
    zh: "屯门区",
    "zh-Hant": "屯門區",
  },
  "屯门区": {
    en: "Tuen Mun District",
    zh: "屯门区",
    "zh-Hant": "屯門區",
  },
  "屯門區": {
    en: "Tuen Mun District",
    zh: "屯门区",
    "zh-Hant": "屯門區",
  },
  "yuen long": {
    en: "Yuen Long District",
    zh: "元朗区",
    "zh-Hant": "元朗區",
  },
  "yuen long district": {
    en: "Yuen Long District",
    zh: "元朗区",
    "zh-Hant": "元朗區",
  },
  "元朗区": {
    en: "Yuen Long District",
    zh: "元朗区",
    "zh-Hant": "元朗區",
  },
  "元朗區": {
    en: "Yuen Long District",
    zh: "元朗区",
    "zh-Hant": "元朗區",
  },
  north: { en: "North District", zh: "北区", "zh-Hant": "北區" },
  "north district": { en: "North District", zh: "北区", "zh-Hant": "北區" },
  "北区": { en: "North District", zh: "北区", "zh-Hant": "北區" },
  "北區": { en: "North District", zh: "北区", "zh-Hant": "北區" },
  "tai po": { en: "Tai Po District", zh: "大埔区", "zh-Hant": "大埔區" },
  "tai po district": {
    en: "Tai Po District",
    zh: "大埔区",
    "zh-Hant": "大埔區",
  },
  "大埔区": { en: "Tai Po District", zh: "大埔区", "zh-Hant": "大埔區" },
  "大埔區": { en: "Tai Po District", zh: "大埔区", "zh-Hant": "大埔區" },
  "sai kung": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "sai kung district": {
    en: "Sai Kung District",
    zh: "西贡区",
    "zh-Hant": "西貢區",
  },
  "西贡区": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "西貢區": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "sha tin": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "sha tin district": {
    en: "Sha Tin District",
    zh: "沙田区",
    "zh-Hant": "沙田區",
  },
  "沙田区": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "沙田區": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "kwai tsing": {
    en: "Kwai Tsing District",
    zh: "葵青区",
    "zh-Hant": "葵青區",
  },
  "kwai tsing district": {
    en: "Kwai Tsing District",
    zh: "葵青区",
    "zh-Hant": "葵青區",
  },
  "葵青区": {
    en: "Kwai Tsing District",
    zh: "葵青区",
    "zh-Hant": "葵青區",
  },
  "葵青區": {
    en: "Kwai Tsing District",
    zh: "葵青区",
    "zh-Hant": "葵青區",
  },
  islands: { en: "Islands District", zh: "离岛区", "zh-Hant": "離島區" },
  "islands district": {
    en: "Islands District",
    zh: "离岛区",
    "zh-Hant": "離島區",
  },
  "离岛区": { en: "Islands District", zh: "离岛区", "zh-Hant": "離島區" },
  "離島區": { en: "Islands District", zh: "离岛区", "zh-Hant": "離島區" },
  "garden road": { en: "Garden Road", zh: "花园道", "zh-Hant": "花園道" },
  "花园道": { en: "Garden Road", zh: "花园道", "zh-Hant": "花園道" },
  "花園道": { en: "Garden Road", zh: "花园道", "zh-Hant": "花園道" },
  "waterfall bay road": {
    en: "Waterfall Bay Road",
    zh: "瀑布湾道",
    "zh-Hant": "瀑布灣道",
  },
  "瀑布湾道": {
    en: "Waterfall Bay Road",
    zh: "瀑布湾道",
    "zh-Hant": "瀑布灣道",
  },
  "瀑布灣道": {
    en: "Waterfall Bay Road",
    zh: "瀑布湾道",
    "zh-Hant": "瀑布灣道",
  },
};

const TRADITIONAL_TO_SIMPLIFIED_CHAR_MAP: Record<string, string> = {
  灣: "湾",
  區: "区",
  園: "园",
  島: "岛",
  龍: "龙",
  門: "门",
  東: "东",
  觀: "观",
  黃: "黄",
  荃: "荃",
  貢: "贡",
  離: "离",
  頭: "头",
  馬: "马",
  廣: "广",
  華: "华",
  樂: "乐",
  麗: "丽",
  寶: "宝",
  將: "将",
  軍: "军",
  業: "业",
  環: "环",
  徑: "径",
  國: "国",
  際: "际",
  號: "号",
  樓: "楼",
  臺: "台",
  滙: "汇",
  豐: "丰",
  鳳: "凤",
  務: "务",
  廈: "厦",
  寧: "宁",
  醫: "医",
  專: "专",
  綫: "线",
  莊: "庄",
  錦: "锦",
  銅: "铜",
  鑼: "锣",
  體: "体",
  會: "会",
  亞: "亚",
  鄉: "乡",
  廠: "厂",
  舖: "铺",
};

const SIMPLIFIED_TO_TRADITIONAL_CHAR_MAP = Object.fromEntries(
  Object.entries(TRADITIONAL_TO_SIMPLIFIED_CHAR_MAP).map(
    ([traditional, simplified]) => [simplified, traditional],
  ),
) as Record<string, string>;

const caregiverReverseGeocodeCache = new Map<
  string,
  Promise<Location.LocationGeocodedAddress | null>
>();

function normalizeLocationLanguage(language: string): AppLanguage {
  return language === "zh" || language === "zh-Hant" ? language : "en";
}

function normalizePlaceKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[，、]/g, ",")
    .replace(/\s+/g, " ")
    .replace(/hong kong special administrative region/g, "hong kong")
    .replace(/hong kong sar/g, "hong kong")
    .replace(/香港特别行政区/g, "香港")
    .replace(/香港特別行政區/g, "香港");
}

function hasCjkCharacters(value: string): boolean {
  return /[\u3400-\u9FFF]/.test(value);
}

function hasLatinCharacters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function convertByCharacterMap(
  value: string,
  characterMap: Record<string, string>,
): string {
  return Array.from(value)
    .map((character) => characterMap[character] ?? character)
    .join("");
}

function convertChineseScript(value: string, language: AppLanguage): string {
  if (language === "zh") {
    return convertByCharacterMap(value, TRADITIONAL_TO_SIMPLIFIED_CHAR_MAP);
  }

  if (language === "zh-Hant") {
    return convertByCharacterMap(value, SIMPLIFIED_TO_TRADITIONAL_CHAR_MAP);
  }

  return value;
}

function dedupeLocationParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();

  return parts.filter((part): part is string => {
    const trimmed = part?.trim();
    if (!trimmed) return false;

    const key = normalizePlaceKey(trimmed);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function translatePlacePart(
  value: string | null | undefined,
  language: AppLanguage,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const translated = HONG_KONG_LOCATION_TRANSLATIONS[normalizePlaceKey(trimmed)];
  if (translated) {
    return translated[language];
  }

  if (hasCjkCharacters(trimmed)) {
    return language === "en" ? null : convertChineseScript(trimmed, language);
  }

  if (hasLatinCharacters(trimmed)) {
    return language === "en" ? trimmed : null;
  }

  return trimmed;
}

function translateStreetPart(
  value: string | null | undefined,
  language: AppLanguage,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const translated = HONG_KONG_LOCATION_TRANSLATIONS[normalizePlaceKey(trimmed)];
  if (translated) {
    return translated[language];
  }

  if (hasCjkCharacters(trimmed)) {
    return language === "en" ? null : convertChineseScript(trimmed, language);
  }

  if (hasLatinCharacters(trimmed)) {
    return language === "en" ? trimmed : null;
  }

  return language === "en" ? trimmed : null;
}

function formatAlertCoordinates(alert: EmergencyAlert): string | null {
  if (alert.latitude != null && alert.longitude != null) {
    return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
  }

  return null;
}

function localizeStoredLocationName(
  locationName: string | null | undefined,
  language: AppLanguage,
): string | null {
  const trimmed = locationName?.trim();
  if (!trimmed) return null;

  const localizedParts = dedupeLocationParts(
    trimmed.split(/[，,]/).map((part) => translatePlacePart(part, language)),
  );

  if (localizedParts.length > 0) {
    return localizedParts.join(", ");
  }

  if (language === "en") {
    return hasLatinCharacters(trimmed) ? trimmed : null;
  }

  return convertChineseScript(trimmed, language);
}

function buildLocalizedLocationFromAddress(
  address: Location.LocationGeocodedAddress,
  alert: EmergencyAlert,
  language: AppLanguage,
): string | null {
  const streetBase = address.street?.trim() || address.name?.trim() || null;
  const streetPart = streetBase
    ? address.streetNumber?.trim()
      ? translateStreetPart(`${address.streetNumber.trim()} ${streetBase}`, language)
      : translateStreetPart(streetBase, language)
    : null;

  const parts = dedupeLocationParts([
    streetPart,
    translatePlacePart(address.district, language),
    translatePlacePart(address.subregion, language),
    translatePlacePart(address.city, language),
    translatePlacePart(address.region, language),
    translatePlacePart(
      address.country ?? (address.isoCountryCode === "HK" ? "Hong Kong" : null),
      language,
    ),
  ]);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return localizeStoredLocationName(alert.location_name, language) ?? formatAlertCoordinates(alert);
}

async function reverseGeocodeForAlert(
  alert: EmergencyAlert,
): Promise<Location.LocationGeocodedAddress | null> {
  if (alert.latitude == null || alert.longitude == null) {
    return null;
  }

  const cacheKey = `${alert.latitude.toFixed(6)},${alert.longitude.toFixed(6)}`;
  const cachedPromise = caregiverReverseGeocodeCache.get(cacheKey);
  if (cachedPromise) {
    return cachedPromise;
  }

  const lookupPromise = Location.reverseGeocodeAsync({
    latitude: alert.latitude,
    longitude: alert.longitude,
  })
    .then((results) => results[0] ?? null)
    .catch(() => null);

  caregiverReverseGeocodeCache.set(cacheKey, lookupPromise);
  return lookupPromise;
}

async function resolveLocalizedAlertLocation(
  alert: EmergencyAlert,
  language: AppLanguage,
): Promise<string | null> {
  const fallbackLocation =
    localizeStoredLocationName(alert.location_name, language) ??
    formatAlertCoordinates(alert);

  if (alert.latitude == null || alert.longitude == null) {
    return fallbackLocation;
  }

  const address = await reverseGeocodeForAlert(alert);
  if (!address) {
    return fallbackLocation;
  }

  return buildLocalizedLocationFromAddress(address, alert, language);
}

function getLocationFallback(
  alert: EmergencyAlert,
  language: AppLanguage,
): string | null {
  return (
    localizeStoredLocationName(alert.location_name, language) ??
    formatAlertCoordinates(alert)
  );
}

function getTypeConfig(type: string) {
  switch (type) {
    case "fall":
      return {
        icon: "alert-decagram",
        color: "#D32F2F",
        label: "Fall Detected",
      };
    case "sos":
      return { icon: "bell-alert", color: "#C62828", label: "SOS Alert" };
    case "hr_warning":
      return {
        icon: "heart-broken",
        color: "#E64A19",
        label: "Health Warning",
      };
    case "geo_fence":
      return { icon: "map-marker-alert", color: "#F57C00", label: "Geo-Fence" };
    default:
      return { icon: "alert", color: "#757575", label: "Alert" };
  }
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const t = i18n.t.bind(i18n);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common.justNow");
  if (mins < 60) return t("common.minutesAgo", { minutes: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("common.hoursAgo", { hours: hrs });
  const days = Math.floor(hrs / 24);
  return t("common.daysAgo", { days });
}

type FilterStatus = "all" | "active" | "investigating" | "resolved";

/* ── Component ──────────────────────────────────────────── */

export default function EmergencyPage() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const locationLanguage = useMemo(
    () => normalizeLocationLanguage(language),
    [language],
  );

  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [localizedAlertLocations, setLocalizedAlertLocations] = useState<
    Record<string, string | null>
  >({});
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);

  /* ── Data fetching ── */
  const loadAlerts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchEmergencyAlerts(user.$id);
      setAlerts(data);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = `databases.${DATABASE_ID}.collections.${EMERGENCY_ALERTS_TABLE_ID}.documents`;
    const unsub = safeSubscribe(channel, () => {
      loadAlerts();
    });
    return () => unsub?.();
  }, [user, loadAlerts]);

  useEffect(() => {
    let cancelled = false;

    const fallbackLocations = Object.fromEntries(
      alerts.map((alert) => [alert.$id, getLocationFallback(alert, locationLanguage)]),
    ) as Record<string, string | null>;

    setLocalizedAlertLocations(fallbackLocations);

    const alertsWithCoordinates = alerts.filter(
      (alert) => alert.latitude != null && alert.longitude != null,
    );

    if (alertsWithCoordinates.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const resolvedEntries = await Promise.all(
        alertsWithCoordinates.map(async (alert) => [
          alert.$id,
          await resolveLocalizedAlertLocation(alert, locationLanguage),
        ] as const),
      );

      if (cancelled) {
        return;
      }

      setLocalizedAlertLocations((current) => {
        const next = { ...fallbackLocations, ...current };
        for (const [alertId, locationText] of resolvedEntries) {
          next[alertId] = locationText;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [alerts, locationLanguage]);

  const getAlertLocationText = useCallback(
    (alert: EmergencyAlert) =>
      localizedAlertLocations[alert.$id] ??
      getLocationFallback(alert, locationLanguage),
    [localizedAlertLocations, locationLanguage],
  );

  /* ── Header ── */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.navigate("/caregiver")}
          style={{ marginLeft: 10, flexDirection: "row", alignItems: "center" }}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={28}
            color={theme.colors.onSurface}
          />
          <Text style={{ marginLeft: 5, fontSize: 16 }}>
            {t("common.back")}
          </Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ marginRight: 10 }}>
          <Chip
            icon="bell-ring"
            mode="outlined"
            style={{ borderColor: theme.colors.error }}
            textStyle={{ color: theme.colors.error }}
          >
            {t("emergency.live")}
          </Chip>
        </View>
      ),
    });
  }, [navigation, router, t, theme]);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = alerts;
    if (filterStatus !== "all") {
      list = list.filter((a) => a.status === filterStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) => {
          const locationText = getAlertLocationText(a)?.toLowerCase() ?? "";
          return (
            a.elderly_name.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q) ||
            locationText.includes(q) ||
            (a.location_name ?? "").toLowerCase().includes(q) ||
            (a.description ?? "").toLowerCase().includes(q)
          );
        },
      );
    }
    return list;
  }, [alerts, filterStatus, getAlertLocationText, search]);

  const activeCount = useMemo(
    () =>
      alerts.filter(
        (a) => a.status === "active" || a.status === "investigating",
      ).length,
    [alerts],
  );

  /* ── Actions ── */
  const handleCallEmergency = (number: string) => {
    Linking.openURL(`tel:${number}`);
  };

  const handleResolve = async (alert: EmergencyAlert) => {
    if (!user) return;
    try {
      await resolveEmergencyAlert(alert.$id, user.$id);
      setSelectedAlert(null);
      loadAlerts();
    } catch (err) {
      Alert.alert(t("common.error"), t("emergency.failedResolveAlert"));
    }
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case "fall":
        return {
          icon: "alert-decagram",
          color: "#D32F2F",
          label: t("emergency.fallDetected"),
        };
      case "sos":
        return {
          icon: "bell-alert",
          color: "#C62828",
          label: t("emergency.sosAlert"),
        };
      case "hr_warning":
        return {
          icon: "heart-broken",
          color: "#E64A19",
          label: t("emergency.healthWarning"),
        };
      case "geo_fence":
        return {
          icon: "map-marker-alert",
          color: "#F57C00",
          label: t("emergency.geoFence"),
        };
      default:
        return { icon: "alert", color: "#757575", label: t("emergency.alert") };
    }
  };

  const handleInvestigate = async (alert: EmergencyAlert) => {
    try {
      await updateAlertStatus(alert.$id, "investigating");
      setSelectedAlert(null);
      loadAlerts();
    } catch (err) {
      Alert.alert(
        t("common.error"),
        t("emergency.failedUpdateAlertStatus"),
      );
    }
  };

  /* ── Sub-components ── */
  const StatusBadge = ({ status }: { status: string }) => {
    let textColor = theme.colors.primary;
    let bgColor = theme.colors.primaryContainer;
    let label = t("common.resolved");
    let icon = "check-circle";

    if (status === "active") {
      textColor = theme.colors.error;
      bgColor = theme.colors.errorContainer;
      label = t("common.active");
      icon = "alert-circle";
    } else if (status === "investigating") {
      textColor = "#FB8C00";
      bgColor = isDark ? "rgba(251,140,0,0.15)" : "#FFF3E0";
      label = t("emergency.inProgress");
      icon = "progress-clock";
    }

    return (
      <Chip
        icon={icon}
        style={{ backgroundColor: bgColor }}
        textStyle={{ color: textColor, fontSize: 12 }}
        compact
      >
        {label}
      </Chip>
    );
  };

  const renderLogItem = ({ item }: { item: EmergencyAlert }) => {
    const config = getTypeConfig(item.type);
    const locationText = getAlertLocationText(item);
    return (
      <Surface
        style={[styles.logCard, { borderLeftColor: config.color }]}
        elevation={1}
      >
        <TouchableOpacity
          onPress={() => setSelectedAlert(item)}
          style={{ flexDirection: "row", alignItems: "center", padding: 12 }}
        >
          <View
            style={[styles.iconBox, { backgroundColor: config.color + "15" }]}
          >
            <MaterialCommunityIcons
              name={config.icon as any}
              size={28}
              color={config.color}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
                {config.label}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text variant="bodyMedium" style={{ marginTop: 2 }}>
              {item.elderly_name}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginLeft: 4,
                  marginRight: 12,
                }}
              >
                {formatRelativeTime(item.$createdAt)}
              </Text>
              {locationText && (
                <>
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={14}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      marginLeft: 4,
                    }}
                  >
                    {locationText}
                  </Text>
                </>
              )}
            </View>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
      </Surface>
    );
  };

  /* ── Render ── */
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAlerts();
            }}
          />
        }
      >
        {/* Status Banner */}
        <Surface
          style={[
            styles.banner,
            {
              backgroundColor:
                activeCount > 0
                  ? theme.colors.errorContainer
                  : theme.colors.primaryContainer,
            },
          ]}
          elevation={2}
        >
          <View style={styles.bannerContent}>
            <MaterialCommunityIcons
              name={activeCount > 0 ? "shield-alert" : "shield-check"}
              size={48}
              color={
                activeCount > 0 ? theme.colors.error : theme.colors.primary
              }
            />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text
                variant="headlineSmall"
                style={{
                  color:
                    activeCount > 0
                      ? theme.colors.onErrorContainer
                      : theme.colors.onPrimaryContainer,
                  fontWeight: "bold",
                }}
              >
                {activeCount > 0
                  ? t("emergency.alertSystemActive")
                  : t("emergency.allClear")}
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color:
                    activeCount > 0
                      ? theme.colors.onErrorContainer
                      : theme.colors.onPrimaryContainer,
                }}
              >
                {activeCount > 0
                  ? t("emergency.unresolvedAlerts", { count: activeCount })
                  : t("emergency.noActiveAlerts")}
              </Text>
            </View>
          </View>
          {activeCount > 0 && (
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor="white"
              style={{ marginTop: 12 }}
              onPress={() => {
                const first = alerts.find((a) => a.status === "active");
                if (first) setSelectedAlert(first);
              }}
            >
              {t("emergency.viewLatestAlert")}
            </Button>
          )}
        </Surface>

        {/* Search & Filter */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Searchbar
            placeholder={t("emergency.searchAlerts")}
            value={search}
            onChangeText={setSearch}
            style={{ borderRadius: 12, elevation: 1 }}
          />
        </View>
        <View style={[styles.sectionHeader, { marginTop: 4 }]}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {t("emergency.recentLogs")} ({filtered.length})
          </Text>
          <Menu
            visible={filterMenuVisible}
            onDismiss={() => setFilterMenuVisible(false)}
            anchor={
              <Button
                mode="text"
                compact
                onPress={() => setFilterMenuVisible(true)}
                icon="filter-variant"
              >
                {filterStatus === "all"
                  ? t("common.all")
                  : filterStatus === "active"
                    ? t("emergency.statusActive")
                    : filterStatus === "investigating"
                      ? t("emergency.statusInvestigating")
                      : t("emergency.statusResolved")}
              </Button>
            }
          >
            <Menu.Item
              title={t("common.all")}
              onPress={() => {
                setFilterStatus("all");
                setFilterMenuVisible(false);
              }}
            />
            <Menu.Item
              title={t("emergency.statusActive")}
              onPress={() => {
                setFilterStatus("active");
                setFilterMenuVisible(false);
              }}
            />
            <Menu.Item
              title={t("emergency.statusInvestigating")}
              onPress={() => {
                setFilterStatus("investigating");
                setFilterMenuVisible(false);
              }}
            />
            <Menu.Item
              title={t("emergency.statusResolved")}
              onPress={() => {
                setFilterStatus("resolved");
                setFilterMenuVisible(false);
              }}
            />
          </Menu>
        </View>

        {filtered.length === 0 ? (
          <View style={[styles.center, { paddingVertical: 48 }]}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={64}
              color="#ccc"
            />
            <Text variant="bodyLarge" style={{ color: "#999", marginTop: 12 }}>
              {t("emergency.noAlertsFound")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderLogItem}
            keyExtractor={(item) => item.$id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          />
        )}
      </ScrollView>

      {/* Detail Dialog */}
      <Portal>
        <Dialog
          visible={!!selectedAlert}
          onDismiss={() => setSelectedAlert(null)}
          style={{ backgroundColor: theme.colors.background }}
        >
          <Dialog.Title
            style={{ color: theme.colors.error, fontWeight: "bold" }}
          >
            <MaterialCommunityIcons name="alert" size={24} />{" "}
            {t("emergency.incidentDetails")}
          </Dialog.Title>
          <Dialog.Content>
            {selectedAlert && (
              <View>
                {(() => {
                  const locationText = getAlertLocationText(selectedAlert);
                  return (
                <Surface style={styles.detailBox} elevation={0}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.type")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {getTypeConfig(selectedAlert.type).label}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.elderlyLabel")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {selectedAlert.elderly_name}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.location")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {locationText ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {t("emergency.timeLabel")}
                    </Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedAlert.$createdAt).toLocaleString()}
                    </Text>
                  </View>
                  {selectedAlert.latitude != null &&
                    selectedAlert.longitude != null && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                          {t("emergency.gpsLabel")}
                        </Text>
                        <Text style={styles.detailValue}>
                          {selectedAlert.latitude.toFixed(5)},{" "}
                          {selectedAlert.longitude.toFixed(5)}
                        </Text>
                      </View>
                    )}
                </Surface>
                  );
                })()}

                <Text
                  variant="titleMedium"
                  style={{ marginTop: 16, marginBottom: 4 }}
                >
                  {t("emergency.description")}
                </Text>
                <Text variant="bodyMedium" style={{ lineHeight: 20 }}>
                  {selectedAlert.description ??
                    t("emergency.noDescriptionAvailable")}
                </Text>

                <Divider style={{ marginVertical: 16 }} />
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>
                  {t("emergency.suggestedActions")}
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
                >
                  <Chip
                    icon="phone"
                    onPress={() => handleCallEmergency("12345678")}
                  >
                    {t("emergency.callFamily")}
                  </Chip>
                  {selectedAlert.latitude != null &&
                    selectedAlert.longitude != null && (
                      <Chip
                        icon="map-marker"
                        onPress={() =>
                          Linking.openURL(
                            `https://maps.google.com/?q=${selectedAlert.latitude},${selectedAlert.longitude}`,
                          )
                        }
                      >
                        {t("emergency.openMap")}
                      </Chip>
                    )}
                </View>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedAlert(null)}>
              {t("common.close")}
            </Button>
            {selectedAlert?.status === "active" && (
              <Button
                mode="outlined"
                onPress={() => handleInvestigate(selectedAlert!)}
              >
                {t("emergency.statusInvestigating")}
              </Button>
            )}
            {selectedAlert?.status !== "resolved" && (
              <Button
                mode="contained"
                onPress={() => handleResolve(selectedAlert!)}
              >
                {t("emergency.markResolved")}
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  banner: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
  },

  logCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    overflow: "hidden",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBox: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  detailLabel: {
    width: 80,
    color: "#666",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    color: "#000",
  },
});
