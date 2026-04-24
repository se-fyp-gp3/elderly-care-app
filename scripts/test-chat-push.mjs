#!/usr/bin/env node
/*
Local test script to invoke the Appwrite `chat_push_notify` function and fetch execution logs.

Usage (set env vars before running):
  APPWRITE_ENDPOINT=https://... \
  APPWRITE_PROJECT_ID=your-project-id \
  APPWRITE_API_KEY=your-admin-key \
  EXPO_PUBLIC_CHAT_PUSH_FUNCTION_ID=chat_push_notify \
  TEST_RECEIVER_PROFILE_ID=<profile> \
  node scripts/test-chat-push.mjs

This script posts an execution request then attempts to fetch logs for the execution.
Do NOT commit your API key to the repo.
*/

import { existsSync, readFileSync } from "fs";
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
const functionId = process.env.EXPO_PUBLIC_CHAT_PUSH_FUNCTION_ID;

if (!endpoint || !projectId || !apiKey || !functionId) {
  console.error(
    "Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or EXPO_PUBLIC_APPWRITE_API_KEY, EXPO_PUBLIC_CHAT_PUSH_FUNCTION_ID",
  );
  process.exit(1);
}

const payload = {
  mode: "direct",
  receiverProfileId: process.env.TEST_RECEIVER_PROFILE_ID || "test-profile",
  senderId: process.env.TEST_SENDER_ID || "test-sender",
  senderName: process.env.TEST_SENDER_NAME || "Test",
  senderRole: "elderly",
  body: "Test message from local test script",
  messageType: "text",
};

async function main() {
  try {
    const resp = await fetch(`${endpoint.replace(/\/+$/, "")}/functions/${functionId}/executions`, {
      method: "POST",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: JSON.stringify(payload),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    });

    const json = await resp.json().catch(() => null);
    console.log("Execution create response:", json || (await resp.text()));

    const execId = json?.$id;
    if (!execId) {
      console.error("No execution id returned — check response above and Appwrite permissions.");
      process.exit(1);
    }

    const executionResp = await fetch(`${endpoint.replace(/\/+$/, "")}/functions/${functionId}/executions/${execId}`, {
      method: "GET",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
    });

    const executionJson = await executionResp.json().catch(() => null);
    console.log(`\n--- Execution details for ${execId} ---`);
    console.log(executionJson || (await executionResp.text()));
    console.log("--- end execution details ---\n");
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

main();
