import { Client, Query, TablesDB, Users } from "node-appwrite";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const DATABASE_ID = (process.env.DATABASE_ID || "").trim();
const EXPO_PUSH_TOKENS_TABLE_ID =
  (process.env.EXPO_PUSH_TOKENS_TABLE_ID || "").trim();
const GROUP_MEMBERS_TABLE_ID = (process.env.GROUP_MEMBERS_TABLE_ID || "").trim();
const GROUPS_TABLE_ID = (process.env.GROUPS_TABLE_ID || "").trim();
const DEFAULT_FALL_DESCRIPTION_EN =
  "Fall detected by device sensors. No response from elderly within 15 seconds.";
const FALL_ALERT_TRANSLATIONS = {
  en: {
    title: (elderlyName) =>
      elderlyName ? `${elderlyName} may have fallen` : "Possible fall detected",
    body: DEFAULT_FALL_DESCRIPTION_EN,
    locationLabel: "Location",
  },
  zh: {
    title: (elderlyName) =>
      elderlyName ? `${elderlyName} 可能跌倒了` : "可能发生跌倒",
    body: "设备检测到跌倒，长者在 15 秒内未有回应。",
    locationLabel: "地点",
  },
  "zh-Hant": {
    title: (elderlyName) =>
      elderlyName ? `${elderlyName} 可能跌倒了` : "可能發生跌倒",
    body: "裝置偵測到跌倒，長者在 15 秒內未有回應。",
    locationLabel: "地點",
  },
};
const HONG_KONG_LOCATION_TRANSLATIONS = {
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
  "大埔区": { en: "Tai Po District", zh: "大埔区", "zh-Hant": "大埔區" },
  "大埔區": { en: "Tai Po District", zh: "大埔区", "zh-Hant": "大埔區" },
  "sai kung": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "西贡区": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "西貢區": { en: "Sai Kung District", zh: "西贡区", "zh-Hant": "西貢區" },
  "sha tin": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "沙田区": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "沙田區": { en: "Sha Tin District", zh: "沙田区", "zh-Hant": "沙田區" },
  "kwai tsing": {
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
const TRADITIONAL_TO_SIMPLIFIED_CHAR_MAP = {
  灣: "湾",
  區: "区",
  園: "园",
  島: "岛",
  龍: "龙",
  門: "门",
  東: "东",
  觀: "观",
  黃: "黄",
  貢: "贡",
  離: "离",
  國: "国",
  際: "际",
  號: "号",
  樓: "楼",
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
);
const SYSTEM_NOTIFICATION_TRANSLATIONS = {
  en: {
    notificationTitle: "Notification",
    someone: "Someone",
    elderlyUser: "Elderly user",
    friendRequestTitle: "New friend request",
    friendAcceptedTitle: "Friend request accepted",
    groupInvitationTitle: "Group invitation",
    medicationAddedTitle: "Medication added",
    medicationTakenTitle: "Medication taken",
    medicationUpdatedTitle: "Medication updated",
    medicationRemovedTitle: "Medication removed",
    scheduleAddedTitle: "Schedule added",
    momentPostFallback: "Shared a new moment",
    momentCommentFallback: "New comment on your moment",
    friendRequestKind: "friend request",
    chatRequestKind: "chat request",
    locationLabel: "Location",
  },
  zh: {
    notificationTitle: "通知",
    someone: "有人",
    elderlyUser: "长者",
    friendRequestTitle: "新的好友请求",
    friendAcceptedTitle: "好友请求已接受",
    groupInvitationTitle: "群组邀请",
    medicationAddedTitle: "已新增药物",
    medicationTakenTitle: "已记录服药",
    medicationUpdatedTitle: "药物已更新",
    medicationRemovedTitle: "药物已移除",
    scheduleAddedTitle: "日程已新增",
    momentPostFallback: "分享了新动态",
    momentCommentFallback: "你的动态有新评论",
    friendRequestKind: "好友请求",
    chatRequestKind: "聊天请求",
    locationLabel: "地点",
  },
  "zh-Hant": {
    notificationTitle: "通知",
    someone: "有人",
    elderlyUser: "長者",
    friendRequestTitle: "新的好友請求",
    friendAcceptedTitle: "好友請求已接受",
    groupInvitationTitle: "群組邀請",
    medicationAddedTitle: "已新增藥物",
    medicationTakenTitle: "已記錄服藥",
    medicationUpdatedTitle: "藥物已更新",
    medicationRemovedTitle: "藥物已移除",
    scheduleAddedTitle: "日程已新增",
    momentPostFallback: "分享了新動態",
    momentCommentFallback: "你的動態有新評論",
    friendRequestKind: "好友請求",
    chatRequestKind: "聊天請求",
    locationLabel: "地點",
  },
};

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err?.stack || String(err));
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason?.stack || String(reason));
});

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

function assertConfig() {
  if (!DATABASE_ID || !EXPO_PUSH_TOKENS_TABLE_ID) {
    throw new Error("Missing DATABASE_ID or EXPO_PUSH_TOKENS_TABLE_ID.");
  }
  if (!GROUP_MEMBERS_TABLE_ID || !GROUPS_TABLE_ID) {
    throw new Error("Missing GROUP_MEMBERS_TABLE_ID or GROUPS_TABLE_ID.");
  }
}

function createRuntimeClient() {
  const endpoint =
    (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "").trim();
  const projectId =
    (process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();

  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite function runtime credentials.");
  }

  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
}

function createTablesService(client) {
  return new TablesDB(client);
}

function createUsersService(client) {
  return new Users(client);
}

function uniqueBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isExpoPushToken(token) {
  return typeof token === "string" && /^ExponentPushToken\[|^ExpoPushToken\[/.test(token);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getNotificationCopy(language) {
  return SYSTEM_NOTIFICATION_TRANSLATIONS[normalizeLanguage(language)];
}

function getLocaleForLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizedLanguage === "zh") return "zh-CN";
  if (normalizedLanguage === "zh-Hant") return "zh-HK";
  return "en-HK";
}

function getNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function joinLocalizedList(items, language) {
  const filteredItems = items.filter(Boolean);
  if (filteredItems.length === 0) return "";
  return filteredItems.join(normalizeLanguage(language) === "en" ? ", " : "、");
}

function formatDateTimeForLanguage(value, language, timeZone) {
  const isoDate = getNonEmptyString(value);
  if (!isoDate) return null;

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const formatterOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    const normalizedTimeZone = getNonEmptyString(timeZone);
    if (normalizedTimeZone) {
      formatterOptions.timeZone = normalizedTimeZone;
    }

    return new Intl.DateTimeFormat(getLocaleForLanguage(language), {
      ...formatterOptions,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function normalizeLanguage(language) {
  return language === "zh" || language === "zh-Hant" ? language : "en";
}

function normalizePlaceKey(value) {
  return String(value || "")
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

function hasCjkCharacters(value) {
  return /[\u3400-\u9FFF]/.test(value);
}

function hasLatinCharacters(value) {
  return /[A-Za-z]/.test(value);
}

function convertByCharacterMap(value, characterMap) {
  return Array.from(value)
    .map((character) => characterMap[character] || character)
    .join("");
}

function convertChineseScript(value, language) {
  if (language === "zh") {
    return convertByCharacterMap(value, TRADITIONAL_TO_SIMPLIFIED_CHAR_MAP);
  }

  if (language === "zh-Hant") {
    return convertByCharacterMap(value, SIMPLIFIED_TO_TRADITIONAL_CHAR_MAP);
  }

  return value;
}

function dedupeLocationParts(parts) {
  const seen = new Set();

  return parts.filter((part) => {
    const trimmed = typeof part === "string" ? part.trim() : "";
    if (!trimmed) return false;

    const key = normalizePlaceKey(trimmed);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function translatePlacePart(value, language) {
  const trimmed = typeof value === "string" ? value.trim() : "";
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

function localizeStoredLocationName(locationName, language) {
  const trimmed = typeof locationName === "string" ? locationName.trim() : "";
  if (!trimmed) {
    return null;
  }

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

function isLocalizableSystemPayload(payload) {
  return (
    (payload.mode === "users" || payload.mode === "profiles") &&
    [
      "fall_alert",
      "friend_request",
      "group_invitation",
      "medication_action",
      "schedule_action",
      "moment_post",
      "moment_comment",
      "caregiver_activity",
    ].includes(payload?.data?.type)
  );
}

function buildLocalizedFallAlertMessage(payload, language) {
  const localized = FALL_ALERT_TRANSLATIONS[normalizeLanguage(language)];
  const elderlyName =
    typeof payload?.data?.elderlyName === "string" && payload.data.elderlyName.trim()
      ? payload.data.elderlyName.trim()
      : "";
  const rawDescription =
    typeof payload?.data?.description === "string" ? payload.data.description.trim() : "";
  const description =
    language === "en" && rawDescription && rawDescription !== DEFAULT_FALL_DESCRIPTION_EN
      ? rawDescription
      : localized.body;
  const explicitLocalizedLocation = payload?.data?.locationLocalizations?.[language];
  const localizedLocation =
    (typeof explicitLocalizedLocation === "string" && explicitLocalizedLocation.trim()) ||
    localizeStoredLocationName(payload?.data?.locationName, normalizeLanguage(language));

  return {
    title: localized.title(elderlyName),
    body: localizedLocation
      ? `${description} ${localized.locationLabel}: ${localizedLocation}`
      : description,
  };
}

function buildLocalizedFriendRequestMessage(data, language) {
  const copy = getNotificationCopy(language);
  const actorName = getNonEmptyString(data?.actorName) || copy.someone;
  const requestKind = data?.requestKind === "chat"
    ? copy.chatRequestKind
    : copy.friendRequestKind;

  if (data?.requestAction === "accepted") {
    if (normalizeLanguage(language) === "en") {
      return {
        title: copy.friendAcceptedTitle,
        body: `${actorName} accepted your ${requestKind}`,
      };
    }

    return {
      title: copy.friendAcceptedTitle,
      body: normalizeLanguage(language) === "zh"
        ? `${actorName} 接受了你的${requestKind}`
        : `${actorName} 接受了你的${requestKind}`,
    };
  }

  if (normalizeLanguage(language) === "en") {
    return {
      title: copy.friendRequestTitle,
      body: `${actorName} sent you a ${requestKind}`,
    };
  }

  return {
    title: copy.friendRequestTitle,
    body: normalizeLanguage(language) === "zh"
      ? `${actorName} 向你发送了${requestKind}`
      : `${actorName} 向你傳送了${requestKind}`,
  };
}

function buildLocalizedGroupInvitationMessage(data, language) {
  const copy = getNotificationCopy(language);
  const actorName = getNonEmptyString(data?.actorName) || copy.someone;
  const groupName = getNonEmptyString(data?.groupName) || "Group";

  if (normalizeLanguage(language) === "en") {
    return {
      title: copy.groupInvitationTitle,
      body: `${actorName} invited you to join ${groupName}`,
    };
  }

  return {
    title: copy.groupInvitationTitle,
    body: normalizeLanguage(language) === "zh"
      ? `${actorName} 邀请你加入 ${groupName}`
      : `${actorName} 邀請你加入 ${groupName}`,
  };
}

function buildLocalizedMedicationActionMessage(data, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = getNotificationCopy(language);
  const action = getNonEmptyString(data?.action);
  const medicationName = getNonEmptyString(data?.medicationName);
  const reminderTimesText = joinLocalizedList(getStringArray(data?.reminderTimes), language);
  const actorName = getNonEmptyString(data?.actorName);

  if (action === "added") {
    if (normalizedLanguage === "en") {
      return {
        title: copy.medicationAddedTitle,
        body: medicationName
          ? `${medicationName} was added${reminderTimesText ? ` with reminders at ${reminderTimesText}` : "."}`
          : "A medication was added.",
      };
    }

    return {
      title: copy.medicationAddedTitle,
      body: medicationName
        ? `${medicationName} 已新增${reminderTimesText ? `，${normalizedLanguage === "zh" ? "提醒时间" : "提醒時間"}：${reminderTimesText}` : "。"}`
        : normalizedLanguage === "zh"
          ? "已新增一个药物。"
          : "已新增一個藥物。",
    };
  }

  if (action === "taken") {
    if (normalizedLanguage === "en") {
      return {
        title: actorName ? `${actorName} took medication` : copy.medicationTakenTitle,
        body: medicationName
          ? `${medicationName} was marked as taken.`
          : "A medication was marked as taken.",
      };
    }

    return {
      title: actorName
        ? `${actorName} ${normalizedLanguage === "zh" ? "已服药" : "已服藥"}`
        : copy.medicationTakenTitle,
      body: medicationName
        ? `${medicationName} ${normalizedLanguage === "zh" ? "已标记为已服。" : "已標記為已服。"}`
        : normalizedLanguage === "zh"
          ? "已记录服药。"
          : "已記錄服藥。",
    };
  }

  if (action === "removed") {
    if (normalizedLanguage === "en") {
      return {
        title: copy.medicationRemovedTitle,
        body: medicationName
          ? `${medicationName} was removed.`
          : "A cancelled medication was confirmed and removed.",
      };
    }

    return {
      title: copy.medicationRemovedTitle,
      body: medicationName
        ? `${medicationName} ${normalizedLanguage === "zh" ? "已移除。" : "已移除。"}`
        : normalizedLanguage === "zh"
          ? "已确认并移除已取消的药物。"
          : "已確認並移除已取消的藥物。",
    };
  }

  if (normalizedLanguage === "en") {
    return {
      title: copy.medicationUpdatedTitle,
      body: "A medication entry was updated.",
    };
  }

  return {
    title: copy.medicationUpdatedTitle,
    body: normalizedLanguage === "zh"
      ? "已更新药物记录。"
      : "已更新藥物記錄。",
  };
}

function buildLocalizedScheduleActionMessage(data, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = getNotificationCopy(language);
  const scheduleTitle = getNonEmptyString(data?.scheduleTitle);
  const scheduledAt = formatDateTimeForLanguage(
    data?.scheduledAt,
    language,
    data?.scheduledTimeZone,
  );

  if (normalizedLanguage === "en") {
    return {
      title: copy.scheduleAddedTitle,
      body: scheduleTitle && scheduledAt
        ? `${scheduleTitle} at ${scheduledAt}`
        : scheduleTitle || "A schedule was added.",
    };
  }

  return {
    title: copy.scheduleAddedTitle,
    body: scheduleTitle && scheduledAt
      ? `${scheduleTitle}，${normalizedLanguage === "zh" ? "时间" : "時間"}：${scheduledAt}`
      : normalizedLanguage === "zh"
        ? "已新增一个日程。"
        : "已新增一個日程。",
  };
}

function buildLocalizedMomentPostMessage(data, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = getNotificationCopy(language);
  const actorName = getNonEmptyString(data?.actorName) || copy.someone;
  const previewText = getNonEmptyString(data?.previewText);

  if (normalizedLanguage === "en") {
    return {
      title: `${actorName} posted a new moment`,
      body: previewText || copy.momentPostFallback,
    };
  }

  return {
    title: `${actorName} ${normalizedLanguage === "zh" ? "发布了新动态" : "發佈了新動態"}`,
    body: previewText || copy.momentPostFallback,
  };
}

function buildLocalizedMomentCommentMessage(data, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = getNotificationCopy(language);
  const actorName = getNonEmptyString(data?.actorName) || copy.someone;
  const previewText = getNonEmptyString(data?.previewText);
  const isReply = data?.isReply === true;

  if (normalizedLanguage === "en") {
    return {
      title: isReply
        ? `${actorName} replied to your comment`
        : `${actorName} commented on your moment`,
      body: previewText || copy.momentCommentFallback,
    };
  }

  return {
    title: isReply
      ? `${actorName} ${normalizedLanguage === "zh" ? "回复了你的评论" : "回覆了你的評論"}`
      : `${actorName} ${normalizedLanguage === "zh" ? "评论了你的动态" : "評論了你的動態"}`,
    body: previewText || copy.momentCommentFallback,
  };
}

function buildLocalizedCaregiverActivityMessage(data, language) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = getNotificationCopy(language);
  const elderlyName = getNonEmptyString(data?.elderlyName) || copy.elderlyUser;
  const activityType = getNonEmptyString(data?.activityType);
  const medicationName = getNonEmptyString(data?.medicationName);
  const reminderTimesText = joinLocalizedList(getStringArray(data?.reminderTimes), language);
  const scheduleTitle = getNonEmptyString(data?.scheduleTitle);
  const scheduledAt = formatDateTimeForLanguage(
    data?.scheduledAt,
    language,
    data?.scheduledTimeZone,
  );

  if (activityType === "cg_sched_add") {
    if (normalizedLanguage === "en") {
      return {
        title: `${elderlyName} added a schedule`,
        body: scheduleTitle && scheduledAt
          ? `${scheduleTitle} at ${scheduledAt}`
          : "A new schedule was added.",
      };
    }

    return {
      title: `${elderlyName} ${normalizedLanguage === "zh" ? "新增了日程" : "新增了日程"}`,
      body: scheduleTitle && scheduledAt
        ? `${scheduleTitle}，${normalizedLanguage === "zh" ? "时间" : "時間"}：${scheduledAt}`
        : normalizedLanguage === "zh"
          ? "已新增一个日程。"
          : "已新增一個日程。",
    };
  }

  if (activityType === "cg_med_cancel") {
    if (normalizedLanguage === "en") {
      return {
        title: `${elderlyName} cancelled a medication`,
        body: medicationName
          ? `${medicationName} reminder was cancelled.`
          : "A medication reminder was cancelled.",
      };
    }

    return {
      title: `${elderlyName} ${normalizedLanguage === "zh" ? "取消了药物提醒" : "取消了藥物提醒"}`,
      body: medicationName
        ? normalizedLanguage === "zh"
          ? `已取消 ${medicationName} 的提醒。`
          : `已取消 ${medicationName} 的提醒。`
        : normalizedLanguage === "zh"
          ? "已取消一个药物提醒。"
          : "已取消一個藥物提醒。",
    };
  }

  if (normalizedLanguage === "en") {
    return {
      title: `${elderlyName} added a medication`,
      body: medicationName
        ? `${medicationName}${reminderTimesText ? ` at ${reminderTimesText}` : ""}`
        : "A new medication was added.",
    };
  }

  return {
    title: `${elderlyName} ${normalizedLanguage === "zh" ? "新增了药物" : "新增了藥物"}`,
    body: medicationName
      ? `${medicationName}${reminderTimesText ? `，${normalizedLanguage === "zh" ? "提醒时间" : "提醒時間"}：${reminderTimesText}` : ""}`
      : normalizedLanguage === "zh"
        ? "已新增一个药物。"
        : "已新增一個藥物。",
  };
}

function buildLocalizedSystemMessage(payload, language) {
  const type = payload?.data?.type;
  if (type === "fall_alert") {
    return buildLocalizedFallAlertMessage(payload, language);
  }

  if (type === "friend_request") {
    return buildLocalizedFriendRequestMessage(payload.data, language);
  }

  if (type === "group_invitation") {
    return buildLocalizedGroupInvitationMessage(payload.data, language);
  }

  if (type === "medication_action") {
    return buildLocalizedMedicationActionMessage(payload.data, language);
  }

  if (type === "schedule_action") {
    return buildLocalizedScheduleActionMessage(payload.data, language);
  }

  if (type === "moment_post") {
    return buildLocalizedMomentPostMessage(payload.data, language);
  }

  if (type === "moment_comment") {
    return buildLocalizedMomentCommentMessage(payload.data, language);
  }

  if (type === "caregiver_activity") {
    return buildLocalizedCaregiverActivityMessage(payload.data, language);
  }

  return null;
}

async function getUserLanguageMap(users, userIds) {
  const uniqueUserIds = uniqueBy(userIds.filter(Boolean), (userId) => userId);
  const entries = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      try {
        const user = await users.get(userId);
        return [userId, normalizeLanguage(user?.prefs?.interfaceLanguage)];
      } catch {
        return [userId, "en"];
      }
    }),
  );

  return new Map(entries);
}

async function listPushTokenRows(tablesDB, profileIds) {
  if (!profileIds.length) return [];
  const response = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    queries: [
      Query.equal("profile_id", profileIds),
      Query.equal("active", true),
      Query.limit(500),
    ],
  });

  return uniqueBy(
    response.rows.filter((row) => isExpoPushToken(row.expo_push_token)),
    (row) => row.expo_push_token,
  );
}

async function listPushTokenRowsByUserIds(tablesDB, userIds) {
  if (!userIds.length) return [];
  const response = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    queries: [
      Query.equal("user_id", userIds),
      Query.equal("active", true),
      Query.limit(500),
    ],
  });

  return uniqueBy(
    response.rows.filter((row) => isExpoPushToken(row.expo_push_token)),
    (row) => row.expo_push_token,
  );
}

async function getGroupRecipientProfileIds(tablesDB, groupId, senderId) {
  const response = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: GROUP_MEMBERS_TABLE_ID,
    queries: [
      Query.equal("group_id", [groupId]),
      Query.equal("status", ["active"]),
      Query.limit(500),
    ],
  });

  return response.rows
    .map((row) => row.user_profile_id)
    .filter((profileId) => profileId && profileId !== senderId);
}

async function getGroupName(tablesDB, groupId) {
  try {
    const group = await tablesDB.getRow({
      databaseId: DATABASE_ID,
      tableId: GROUPS_TABLE_ID,
      rowId: groupId,
    });
    return String(group.name || "Group chat");
  } catch {
    return "Group chat";
  }
}

function buildPushEnvelope(payload, tokenRows, groupName, recipientLanguages = new Map()) {
  if (payload.mode === "direct") {
    const messageBody =
      payload.messageType === "voice"
        ? "Sent a voice message"
        : payload.messageType === "image"
          ? "Sent an image"
          : payload.body || "Sent a message";

    return tokenRows.map((row) => ({
      rowId: row.$id,
      token: row.expo_push_token,
      message: {
        to: row.expo_push_token,
        sound: "default",
        title: payload.senderName || "New Message",
        body: messageBody,
        data: {
          type: "direct_message",
          contactId: payload.senderId,
          contactName: payload.senderName,
          contactRole: payload.senderRole,
        },
      },
    }));
  }

  if (payload.mode === "profiles" || payload.mode === "users") {
    return tokenRows.map((row) => ({
      rowId: row.$id,
      token: row.expo_push_token,
      message: (() => {
        const recipientLanguage = recipientLanguages.get(row.user_id) || "en";
        const localizedMessage = buildLocalizedSystemMessage(
          payload,
          recipientLanguage,
        );

        return {
          to: row.expo_push_token,
          sound: "default",
          title:
            localizedMessage?.title ||
            payload.title ||
            getNotificationCopy(recipientLanguage).notificationTitle,
          body:
            localizedMessage?.body ||
            payload.body ||
            "You have a new notification",
          data: payload.data || { type: "generic_notification" },
        };
      })(),
    }));
  }

  const resolvedGroupName = groupName || "Group chat";
  const messageBody =
    payload.messageType === "voice"
      ? `${payload.senderName}: Sent a voice message`
      : payload.messageType === "image"
        ? `${payload.senderName}: Sent an image`
        : payload.messageType === "system"
          ? payload.body || "Group updated"
          : `${payload.senderName}: ${payload.body || "Sent a message"}`;

  return tokenRows.map((row) => ({
    rowId: row.$id,
    token: row.expo_push_token,
    message: {
      to: row.expo_push_token,
      sound: "default",
      title: resolvedGroupName,
      body: messageBody,
      data: {
        type: "group_message",
        groupId: payload.groupId,
        groupName: resolvedGroupName,
      },
    },
  }));
}

async function deactivateTokenRows(tablesDB, rowIds) {
  await Promise.all(
    rowIds.map((rowId) =>
      tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: EXPO_PUSH_TOKENS_TABLE_ID,
        rowId,
        data: {
          active: false,
          updated_at: new Date().toISOString(),
        },
      }).catch((error) => {
        console.warn("[chat-push] Failed to deactivate token row", rowId, error?.message || error);
      }),
    ),
  );
}

function isMixedProjectBatchErrorMessage(message) {
  return typeof message === "string"
    && /same request must be for the same project/i.test(message);
}

async function postExpoPushBatch(batch) {
  const response = await fetch(EXPO_PUSH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
    },
    body: JSON.stringify(batch.map((entry) => entry.message)),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || `Expo push request failed (${response.status})`);
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}

async function sendExpoPushMessages(tablesDB, envelopes) {
  const invalidRowIds = [];
  let sent = 0;

  const handleResults = (batch, results) => {
    results.forEach((result, index) => {
      if (result?.status === "ok") {
        sent += 1;
        return;
      }

      if (result?.details?.error === "DeviceNotRegistered") {
        invalidRowIds.push(batch[index]?.rowId);
      }
    });
  };

  for (const batch of chunk(envelopes, 100)) {
    try {
      const results = await postExpoPushBatch(batch);
      handleResults(batch, results);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (batch.length > 1 && isMixedProjectBatchErrorMessage(message)) {
        console.warn(
          `[chat-push] Mixed Expo project tokens detected in a batch of ${batch.length}; retrying individually.`,
        );

        for (const entry of batch) {
          const singleResults = await postExpoPushBatch([entry]);
          handleResults([entry], singleResults);
        }

        continue;
      }

      throw error;
    }
  }

  if (invalidRowIds.length > 0) {
    await deactivateTokenRows(tablesDB, uniqueBy(invalidRowIds, (rowId) => rowId));
  }

  return { sent, invalidated: invalidRowIds.length };
}

async function resolveTargetTokenRows(tablesDB, payload) {
  if (payload.mode === "direct") {
    return listPushTokenRows(tablesDB, [payload.receiverProfileId]);
  }

  if (payload.mode === "profiles") {
    return listPushTokenRows(
      tablesDB,
      uniqueBy(payload.recipientProfileIds || [], (profileId) => profileId),
    );
  }

  if (payload.mode === "users") {
    return listPushTokenRowsByUserIds(
      tablesDB,
      uniqueBy(payload.recipientUserIds || [], (userId) => userId),
    );
  }

  const recipientProfileIds = await getGroupRecipientProfileIds(
    tablesDB,
    payload.groupId,
    payload.senderId,
  );
  return listPushTokenRows(tablesDB, recipientProfileIds);
}

export default async ({ req, res }) => {
  if (req.method !== "POST") {
    return res.json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    assertConfig();
    const payload = parseJsonBody(req);
    const mode = String(payload?.mode || "").trim();
    if (
      mode !== "direct" &&
      mode !== "group" &&
      mode !== "profiles" &&
      mode !== "users"
    ) {
      return res.json({ success: false, error: "Unsupported mode" }, 400);
    }

    const runtimeClient = createRuntimeClient();
    const tablesDB = createTablesService(runtimeClient);
    const users = createUsersService(runtimeClient);
    const tokenRows = await resolveTargetTokenRows(tablesDB, payload);
    if (!tokenRows.length) {
      return res.json({ success: true, sent: 0, invalidated: 0 }, 200);
    }

    const groupName = mode === "group"
      ? await getGroupName(tablesDB, payload.groupId)
      : null;
    const recipientLanguages = isLocalizableSystemPayload(payload)
      ? await getUserLanguageMap(
          users,
          tokenRows.map((row) => row.user_id).filter(Boolean),
        )
      : new Map();
    const envelopes = buildPushEnvelope(
      payload,
      tokenRows,
      groupName,
      recipientLanguages,
    );
    const result = await sendExpoPushMessages(tablesDB, envelopes);

    return res.json({ success: true, ...result }, 200);
  } catch (error) {
    return res.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
};