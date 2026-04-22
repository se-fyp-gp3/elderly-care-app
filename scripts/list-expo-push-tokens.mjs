#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { Client, Query, TablesDB } from "node-appwrite";
import { dirname, resolve } from "path";
import process from "process";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(resolve(projectRoot, ".env"));
loadEnvFile(resolve(projectRoot, ".env.local"));

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || process.env.EXPO_PUBLIC_APPWRITE_API_KEY;
const databaseId = process.env.EXPO_PUBLIC_DB_ID || "elderly-care-app-db";
const tableId = process.env.EXPO_PUBLIC_EXPO_PUSH_TOKENS_TABLE_ID || "expo_push_tokens";
const profileId = process.env.TEST_RECEIVER_PROFILE_ID || "";
const activeOnly = process.env.TEST_ACTIVE_ONLY === "1";

if (!endpoint || !projectId || !apiKey) {
  console.error("Missing Appwrite endpoint, project ID, or API key.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

function redactToken(token) {
  if (typeof token !== "string" || token.length < 16) return token;
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

async function main() {
  const queries = [Query.limit(100), Query.orderDesc("$createdAt")];
  if (profileId) {
    queries.unshift(Query.equal("profile_id", [profileId]));
  }
  if (activeOnly) {
    queries.unshift(Query.equal("active", true));
  }

  const response = await tablesDB.listRows({
    databaseId,
    tableId,
    queries,
  });

  console.log(`Found ${response.rows.length} push token row(s).`);
  console.log(
    response.rows.map((row) => ({
      id: row.$id,
      profile_id: row.profile_id,
      user_id: row.user_id,
      role: row.role,
      platform: row.platform,
      active: row.active,
      last_seen_at: row.last_seen_at,
      expo_push_token: redactToken(row.expo_push_token),
    })),
  );
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});