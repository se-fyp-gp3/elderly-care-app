const fs = require("fs");
const path = require("path");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const functionMainPath = path.join(root, "functions", "voice-clone-convert", "src", "main.js");
const functionPkgPath = path.join(root, "functions", "voice-clone-convert", "package.json");

const requiredEnv = [
  "EXPO_PUBLIC_APPWRITE_ENDPOINT",
  "EXPO_PUBLIC_APPWRITE_PROJECT_ID",
  "EXPO_PUBLIC_APPWRITE_PLATFORM",
  "EXPO_PUBLIC_VOICE_CLONE_FUNCTION_ID",
];

function parseEnv(content) {
  const map = new Map();
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const eq = line.indexOf("=");
      if (eq <= 0) return;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      map.set(key, value);
    });
  return map;
}

function logPass(msg) {
  console.log(`✅ ${msg}`);
}

function logFail(msg) {
  console.log(`❌ ${msg}`);
}

let failed = false;

if (!fs.existsSync(envPath)) {
  logFail(".env.local not found");
  failed = true;
} else {
  logPass(".env.local found");

  const envMap = parseEnv(fs.readFileSync(envPath, "utf8"));

  for (const key of requiredEnv) {
    const value = envMap.get(key);
    if (!value || value.includes("<") || value.includes("your_")) {
      logFail(`${key} is missing or still placeholder`);
      failed = true;
    } else {
      logPass(`${key} configured`);
    }
  }
}

if (!fs.existsSync(functionMainPath)) {
  logFail("Function entrypoint missing: functions/voice-clone-convert/src/main.js");
  failed = true;
} else {
  logPass("Function entrypoint exists");
}

if (!fs.existsSync(functionPkgPath)) {
  logFail("Function package missing: functions/voice-clone-convert/package.json");
  failed = true;
} else {
  logPass("Function package exists");

  try {
    const pkg = JSON.parse(fs.readFileSync(functionPkgPath, "utf8"));
    if (!pkg.dependencies || !pkg.dependencies["ffmpeg-static"]) {
      logFail("Function dependency ffmpeg-static missing");
      failed = true;
    } else {
      logPass("ffmpeg-static dependency configured");
    }
  } catch (e) {
    logFail(`Failed to parse function package.json: ${e.message}`);
    failed = true;
  }
}

if (failed) {
  console.log("\nVoice clone setup validation failed.");
  process.exit(1);
}

console.log("\nVoice clone setup validation passed.");
process.exit(0);
