import { Client, Query, TablesDB } from "node-appwrite";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
const DATABASE_ID = (process.env.DATABASE_ID || "").trim();
const EXPO_PUSH_TOKENS_TABLE_ID =
  (process.env.EXPO_PUSH_TOKENS_TABLE_ID || "").trim();
const GROUP_MEMBERS_TABLE_ID = (process.env.GROUP_MEMBERS_TABLE_ID || "").trim();
const GROUPS_TABLE_ID = (process.env.GROUPS_TABLE_ID || "").trim();

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

function createTablesService() {
  const endpoint =
    (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "").trim();
  const projectId =
    (process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "").trim();
  const apiKey = (process.env.APPWRITE_API_KEY || "").trim();

  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite function runtime credentials.");
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new TablesDB(client);
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

function buildPushEnvelope(payload, tokenRows, groupName) {
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

async function sendExpoPushMessages(tablesDB, envelopes) {
  const invalidRowIds = [];
  let sent = 0;

  for (const batch of chunk(envelopes, 100)) {
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

    const results = Array.isArray(payload?.data) ? payload.data : [];
    results.forEach((result, index) => {
      if (result?.status === "ok") {
        sent += 1;
        return;
      }

      if (result?.details?.error === "DeviceNotRegistered") {
        invalidRowIds.push(batch[index]?.rowId);
      }
    });
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
    if (mode !== "direct" && mode !== "group") {
      return res.json({ success: false, error: "Unsupported mode" }, 400);
    }

    const tablesDB = createTablesService();
    const tokenRows = await resolveTargetTokenRows(tablesDB, payload);
    if (!tokenRows.length) {
      return res.json({ success: true, sent: 0, invalidated: 0 }, 200);
    }

    const groupName = mode === "group"
      ? await getGroupName(tablesDB, payload.groupId)
      : null;
    const envelopes = buildPushEnvelope(payload, tokenRows, groupName);
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