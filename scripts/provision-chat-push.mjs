import {
    Client,
    Functions,
    TablesDB
} from "node-appwrite";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_ID = "elderly-care-app-db";
const EXPO_PUSH_TOKENS_TABLE_ID = "expo_push_tokens";
const CHAT_PUSH_FUNCTION_ID = "chat_push_notify";
const GROUP_MEMBERS_TABLE_ID = "group_members";
const GROUPS_TABLE_ID = "groups";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env files
  }
}

async function loadEnv() {
  await loadEnvFile(path.join(ROOT_DIR, ".env"));
  await loadEnvFile(path.join(ROOT_DIR, ".env.local"));
}

function createClient() {
  const endpoint =
    process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT;
  const projectId =
    process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
  const apiKey =
    process.env.EXPO_PUBLIC_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY;

  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite endpoint, project ID, or API key in env files.");
  }

  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
}

async function ensureTable(tablesDB) {
  try {
    await tablesDB.getTable({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
    });
    console.log(`[provision] Table already exists: ${EXPO_PUSH_TOKENS_TABLE_ID}`);
  } catch (error) {
    if (error?.code !== 404) throw error;

    await tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      name: "Expo Push Tokens",
      permissions: [
        'create("any")',
        'read("any")',
        'update("any")',
        'delete("any")',
      ],
      rowSecurity: false,
      enabled: true,
    });
    console.log(`[provision] Created table: ${EXPO_PUSH_TOKENS_TABLE_ID}`);
  }
}

async function getColumnMap(tablesDB) {
  const response = await tablesDB.listColumns({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
  });
  return new Map(response.columns.map((column) => [column.key, column]));
}

async function waitForColumn(tablesDB, key) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const columnMap = await getColumnMap(tablesDB);
    const column = columnMap.get(key);
    if (column?.status === "available") return;
    if (column?.status === "failed") {
      throw new Error(`Column ${key} failed: ${column.error || "unknown error"}`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for column ${key}`);
}

async function ensureColumns(tablesDB) {
  const columns = getColumnMap(tablesDB);
  const existing = await columns;

  const ensure = async (key, create) => {
    if (existing.has(key)) {
      console.log(`[provision] Column already exists: ${key}`);
      return;
    }
    await create();
    await waitForColumn(tablesDB, key);
    console.log(`[provision] Created column: ${key}`);
  };

  await ensure("profile_id", () =>
    tablesDB.createStringColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "profile_id",
      size: 36,
      required: true,
    }),
  );

  await ensure("user_id", () =>
    tablesDB.createStringColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "user_id",
      size: 20,
      required: true,
    }),
  );

  await ensure("role", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "role",
      elements: ["elderly", "caregiver"],
      required: true,
    }),
  );

  await ensure("expo_push_token", () =>
    tablesDB.createStringColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "expo_push_token",
      size: 255,
      required: true,
    }),
  );

  await ensure("platform", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "platform",
      elements: ["android", "ios"],
      required: true,
    }),
  );

  await ensure("active", () =>
    tablesDB.createBooleanColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "active",
      required: true,
    }),
  );

  await ensure("last_seen_at", () =>
    tablesDB.createDatetimeColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "last_seen_at",
      required: false,
    }),
  );

  await ensure("updated_at", () =>
    tablesDB.createDatetimeColumn({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "updated_at",
      required: false,
    }),
  );
}

async function getIndexMap(tablesDB) {
  const response = await tablesDB.listIndexes({
    databaseId: DATABASE_ID,
    tableId: EXPO_PUSH_TOKENS_TABLE_ID,
  });
  return new Map(response.indexes.map((index) => [index.key, index]));
}

async function waitForIndex(tablesDB, key) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const indexMap = await getIndexMap(tablesDB);
    const index = indexMap.get(key);
    if (index?.status === "available") return;
    if (index?.status === "failed") {
      throw new Error(`Index ${key} failed: ${index.error || "unknown error"}`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for index ${key}`);
}

async function ensureIndexes(tablesDB) {
  const existing = await getIndexMap(tablesDB);

  const ensure = async (key, create) => {
    if (existing.has(key)) {
      console.log(`[provision] Index already exists: ${key}`);
      return;
    }
    await create();
    await waitForIndex(tablesDB, key);
    console.log(`[provision] Created index: ${key}`);
  };

  await ensure("ux_expo_push_token", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "ux_expo_push_token",
      type: "unique",
      columns: ["expo_push_token"],
      orders: ["ASC"],
    }),
  );

  await ensure("idx_profile_active", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: EXPO_PUSH_TOKENS_TABLE_ID,
      key: "idx_profile_active",
      type: "key",
      columns: ["profile_id", "active"],
      orders: ["ASC", "ASC"],
    }),
  );
}

async function ensureFunction(functions) {
  try {
    const existing = await functions.get({ functionId: CHAT_PUSH_FUNCTION_ID });
    console.log(`[provision] Function already exists: ${CHAT_PUSH_FUNCTION_ID}`);
    return existing;
  } catch (error) {
    if (error?.code !== 404) throw error;
  }

  const created = await functions.create({
    functionId: CHAT_PUSH_FUNCTION_ID,
    name: "chat-push-notify",
    runtime: "node-22",
    execute: ["any"],
    enabled: true,
    logging: true,
    timeout: 60,
    entrypoint: "src/main.js",
    commands: "npm install",
    specification: "s-1vcpu-512mb",
  });
  console.log(`[provision] Created function: ${CHAT_PUSH_FUNCTION_ID}`);
  return created;
}

async function ensureFunctionVariables(functions) {
  const appwriteEndpoint =
    process.env.APPWRITE_ENDPOINT || process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
  const appwriteProjectId =
    process.env.APPWRITE_PROJECT_ID || process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;
  const appwriteApiKey =
    process.env.APPWRITE_API_KEY || process.env.EXPO_PUBLIC_APPWRITE_API_KEY;

  if (!appwriteEndpoint || !appwriteProjectId || !appwriteApiKey) {
    throw new Error(
      "Missing Appwrite runtime credentials in env files for function variables.",
    );
  }

  const desiredVariables = {
    DATABASE_ID,
    EXPO_PUSH_TOKENS_TABLE_ID,
    GROUP_MEMBERS_TABLE_ID,
    GROUPS_TABLE_ID,
    APPWRITE_ENDPOINT: appwriteEndpoint,
    APPWRITE_PROJECT_ID: appwriteProjectId,
    APPWRITE_API_KEY: appwriteApiKey,
  };

  const existing = await functions.listVariables({
    functionId: CHAT_PUSH_FUNCTION_ID,
  });
  const variableMap = new Map(existing.variables.map((variable) => [variable.key, variable]));

  for (const [key, value] of Object.entries(desiredVariables)) {
    const current = variableMap.get(key);
    const desiredSecret = key === "APPWRITE_API_KEY";
    if (!current) {
      await functions.createVariable({
        functionId: CHAT_PUSH_FUNCTION_ID,
        key,
        value,
        secret: desiredSecret,
      });
      console.log(`[provision] Created function variable: ${key}`);
      continue;
    }

    if (current.value !== value) {
      await functions.updateVariable({
        functionId: CHAT_PUSH_FUNCTION_ID,
        variableId: current.$id,
        key,
        value,
        secret: current.secret || desiredSecret,
      });
      console.log(`[provision] Updated function variable: ${key}`);
    }
  }
}

async function createTarGzArchive(sourceDirectory, archivePath) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-czf", archivePath, "-C", sourceDirectory, "."],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tar failed (${code}): ${stderr}`));
    });
  });
}

async function waitForDeployment(functions, deploymentId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const deployment = await functions.getDeployment({
      functionId: CHAT_PUSH_FUNCTION_ID,
      deploymentId,
    });
    if (deployment.status === "ready") {
      return deployment;
    }
    if (deployment.status === "failed") {
      throw new Error(`Deployment failed: ${deployment.buildLogs || deployment.status}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for deployment ${deploymentId}`);
}

async function deployFunction(functions) {
  const functionDirectory = path.join(ROOT_DIR, "appwrite-functions", "chat-push-notify");
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "chat-push-"));
  const archivePath = path.join(tempDirectory, "chat-push-notify.tar.gz");

  try {
    await createTarGzArchive(functionDirectory, archivePath);
    const archiveBuffer = await fs.readFile(archivePath);
    const code = new File([archiveBuffer], "chat-push-notify.tar.gz", {
      type: "application/gzip",
    });

    const deployment = await functions.createDeployment({
      functionId: CHAT_PUSH_FUNCTION_ID,
      code,
      activate: true,
      entrypoint: "src/main.js",
      commands: "npm install",
    });
    console.log(`[provision] Created deployment: ${deployment.$id}`);

    await waitForDeployment(functions, deployment.$id);
    console.log(`[provision] Deployment ready: ${deployment.$id}`);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

async function main() {
  await loadEnv();
  const client = createClient();
  const tablesDB = new TablesDB(client);
  const functions = new Functions(client);

  await ensureTable(tablesDB);
  await ensureColumns(tablesDB);
  await ensureIndexes(tablesDB);
  await ensureFunction(functions);
  await ensureFunctionVariables(functions);
  await deployFunction(functions);

  console.log("[provision] Chat push provisioning complete.");
}

main().catch((error) => {
  console.error("[provision] Failed:", error?.stack || String(error));
  process.exitCode = 1;
});