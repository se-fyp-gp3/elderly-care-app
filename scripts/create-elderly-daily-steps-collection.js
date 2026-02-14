/**
 * Script to create the elderly_daily_steps collection in Appwrite
 *
 * Table: elderly_daily_steps (elderly daily steps)
 *
 * Core rules:
 * - One elderly user per day = one row (no duplicates)
 * - Updates modify existing row's steps + lastUpdated, never create new rows for same day
 * - Composite unique index on (elderlyId + date) prevents duplicate rows
 *
 * Fields:
 * - elderlyId (string, required) - References the elderly user's $id from the elderly table
 * - date (string, required) - Date string in YYYY-MM-DD format for the day
 * - steps (integer, required) - Total step count for the day (cumulative)
 * - lastUpdated (string, required) - ISO 8601 timestamp of last sync
 * - source (string, required) - Data source: "google_fit" | "apple_healthkit" | "manual"
 *
 * Indexes:
 * - Unique composite index on (elderlyId + date) to prevent duplicate rows
 * - Key index on elderlyId for history queries
 * - Key index on date for date-based queries
 *
 * Run: node scripts/create-elderly-daily-steps-collection.js
 */

const { Client, Databases, Permission, Role } = require("node-appwrite");

// Load env: try .env.local first, then fall back to .env
require("dotenv").config({ path: ".env.local" });
if (!process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT) {
  require("dotenv").config({ path: ".env" });
}

const API_KEY =
  process.env.EXPO_PUBLIC_APPWRITE_API_KEY ||
  process.env.EXPO_PRIVATE_APPWRITE_KEY;

if (!API_KEY) {
  console.error(
    "❌ No API key found. Set EXPO_PUBLIC_APPWRITE_API_KEY or EXPO_PRIVATE_APPWRITE_KEY in .env / .env.local"
  );
  process.exit(1);
}

const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID;
const COLLECTION_ID = "elderly_daily_steps";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createCollection() {
  try {
    console.log("=== Creating elderly_daily_steps collection ===\n");

    // 1. Create the collection
    console.log("Creating collection...");
    const collection = await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      "Elderly Daily Steps",
      [
        Permission.create(Role.users()),
        Permission.read(Role.users()),
        Permission.update(Role.users()),
      ],
      false // rowSecurity disabled - consistent with other tables
    );
    console.log("✓ Collection created:", collection.$id);

    // 2. Create attributes
    console.log("\nCreating attributes...");

    // elderlyId - Links to elderly table's $id
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "elderlyId",
      36, // Appwrite ID length
      true // required
    );
    console.log("✓ Created elderlyId (string, required, size=36)");
    await sleep(1500);

    // date - YYYY-MM-DD format string
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "date",
      10, // YYYY-MM-DD = 10 chars
      true // required
    );
    console.log("✓ Created date (string, required, size=10)");
    await sleep(1500);

    // steps - integer, cumulative total for the day
    await databases.createIntegerAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "steps",
      true, // required
      0, // min value
      999999 // max value
    );
    console.log("✓ Created steps (integer, required, min=0, max=999999)");
    await sleep(1500);

    // lastUpdated - ISO 8601 timestamp string of last sync
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "lastUpdated",
      30, // ISO 8601 format length
      true // required
    );
    console.log("✓ Created lastUpdated (string, required, size=30)");
    await sleep(1500);

    // source - data source identifier
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "source",
      20, // "apple_healthkit" = 16 chars, leaving room
      true // required
    );
    console.log("✓ Created source (string, required, size=20)");

    // 3. Wait for all attributes to be indexed
    console.log("\nWaiting for attributes to be ready...");
    await sleep(5000);

    // 4. Create indexes
    console.log("\nCreating indexes...");

    // CRITICAL: Unique composite index on (elderlyId + date) - prevents duplicate rows per user per day
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "ux_elderlyId_date",
      "unique",
      ["elderlyId", "date"],
      ["ASC", "ASC"]
    );
    console.log(
      "✓ Created UNIQUE composite index: ux_elderlyId_date (elderlyId + date)"
    );
    await sleep(1500);

    // Key index on elderlyId - for history queries by user
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_elderlyId",
      "key",
      ["elderlyId"],
      ["ASC"]
    );
    console.log("✓ Created KEY index: idx_elderlyId");
    await sleep(1500);

    // Key index on date - for date-based queries
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_date",
      "key",
      ["date"],
      ["DESC"]
    );
    console.log("✓ Created KEY index: idx_date");
    await sleep(1500);

    // Composite key index for fast lookups
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_elderlyId_date",
      "key",
      ["elderlyId", "date"],
      ["ASC", "DESC"]
    );
    console.log("✓ Created KEY composite index: idx_elderlyId_date");

    console.log("\n=== ✅ Collection setup complete! ===");
    console.log("\nCollection ID: elderly_daily_steps");
    console.log("Database ID:", DATABASE_ID);
    console.log("\nAdd this to your .env file:");
    console.log(
      "EXPO_PUBLIC_ELDERLY_DAILY_STEPS_TABLE_ID=elderly_daily_steps"
    );
    console.log("\nSchema Summary:");
    console.log("┌──────────────┬──────────┬──────────┬───────────────────────┐");
    console.log("│ Field        │ Type     │ Required │ Notes                 │");
    console.log("├──────────────┼──────────┼──────────┼───────────────────────┤");
    console.log("│ $id          │ string   │ auto     │ Appwrite auto PK      │");
    console.log("│ elderlyId    │ string   │ ✓        │ FK → elderly.$id      │");
    console.log("│ date         │ string   │ ✓        │ YYYY-MM-DD format     │");
    console.log("│ steps        │ integer  │ ✓        │ 0-999999, cumulative  │");
    console.log("│ lastUpdated  │ string   │ ✓        │ ISO 8601 timestamp    │");
    console.log("│ source       │ string   │ ✓        │ google_fit/apple_...  │");
    console.log("│ $createdAt   │ datetime │ auto     │ Row creation time     │");
    console.log("│ $updatedAt   │ datetime │ auto     │ Row update time       │");
    console.log("└──────────────┴──────────┴──────────┴───────────────────────┘");
    console.log("\nIndexes:");
    console.log("  • UNIQUE(elderlyId, date) - One row per user per day");
    console.log("  • KEY(elderlyId) - Query user history");
    console.log("  • KEY(date) - Query by date");
    console.log("  • KEY(elderlyId, date) - Fast composite lookup");
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === 409) {
      console.log(
        "\nCollection might already exist. Check your Appwrite console."
      );
      console.log(
        "If you want to recreate, delete the collection first in the Appwrite dashboard."
      );
    }
    process.exit(1);
  }
}

createCollection();
