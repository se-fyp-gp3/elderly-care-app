/**
 * Script to create the custom_voice collection in Appwrite
 *
 * Table: custom_voice (doubao custom voice records)
 *
 * Stores voice cloning records linking caregivers to elderly users.
 * Each record tracks a Doubao Seedance 1.8 voice clone.
 *
 * Fields:
 * - caregiver_id (string, required) - References the caregiver's $id
 * - caregiver_name (string, required) - Display name of the caregiver
 * - elderly_id (string, required) - References the elderly user's $id
 * - voice_id (string, required) - Doubao voice clone ID returned by Seedance API
 * - status (enum, required) - Voice status: pending | training | ready | failed
 * - created_at (string, optional) - ISO 8601 timestamp of creation
 * - updated_at (string, optional) - ISO 8601 timestamp of last update
 *
 * Indexes:
 * - Key index on elderly_id for loading voices available to an elderly user
 * - Key index on caregiver_id for caregiver's voice management
 *
 * Run: node scripts/create-custom-voice-collection.js
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
const COLLECTION_ID = "custom_voice";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createCollection() {
  try {
    console.log("=== Creating custom_voice collection ===\n");

    // 1. Create the collection
    console.log("Creating collection...");
    const collection = await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      "Custom Voice",
      [
        Permission.create(Role.users()),
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      false // rowSecurity disabled - consistent with other tables
    );
    console.log("✓ Collection created:", collection.$id);

    // 2. Create attributes
    console.log("\nCreating attributes...");

    // caregiver_id - Links to caregiver table's $id
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "caregiver_id",
      36, // Appwrite ID length
      true // required
    );
    console.log("✓ Created caregiver_id (string, required, size=36)");
    await sleep(1500);

    // caregiver_name - Display name of the caregiver
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "caregiver_name",
      100,
      true // required
    );
    console.log("✓ Created caregiver_name (string, required, size=100)");
    await sleep(1500);

    // elderly_id - Links to elderly table's $id
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "elderly_id",
      36, // Appwrite ID length
      true // required
    );
    console.log("✓ Created elderly_id (string, required, size=36)");
    await sleep(1500);

    // voice_id - Doubao voice clone ID
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "voice_id",
      128,
      true // required
    );
    console.log("✓ Created voice_id (string, required, size=128)");
    await sleep(1500);

    // status - enum: pending | training | ready | failed
    await databases.createEnumAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "status",
      ["pending", "training", "ready", "failed"],
      true // required (no default allowed for required attributes)
    );
    console.log(
      "✓ Created status (enum: pending|training|ready|failed, required)"
    );
    await sleep(1500);

    // created_at - ISO 8601 timestamp
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "created_at",
      30,
      false // optional
    );
    console.log("✓ Created created_at (string, optional, size=30)");
    await sleep(1500);

    // updated_at - ISO 8601 timestamp
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      "updated_at",
      30,
      false // optional
    );
    console.log("✓ Created updated_at (string, optional, size=30)");

    // 3. Wait for all attributes to be indexed
    console.log("\nWaiting for attributes to be ready...");
    await sleep(5000);

    // 4. Create indexes
    console.log("\nCreating indexes...");

    // Key index on elderly_id - for loading voices for an elderly user
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_elderly_id",
      "key",
      ["elderly_id"],
      ["ASC"]
    );
    console.log("✓ Created KEY index: idx_elderly_id");
    await sleep(1500);

    // Key index on caregiver_id - for caregiver voice management
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_caregiver_id",
      "key",
      ["caregiver_id"],
      ["ASC"]
    );
    console.log("✓ Created KEY index: idx_caregiver_id");
    await sleep(1500);

    // Composite index on (elderly_id + caregiver_id) for lookup
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      "idx_elderly_caregiver",
      "key",
      ["elderly_id", "caregiver_id"],
      ["ASC", "ASC"]
    );
    console.log("✓ Created KEY composite index: idx_elderly_caregiver");

    console.log("\n=== ✅ Collection setup complete! ===");
    console.log("\nCollection ID: custom_voice");
    console.log("Database ID:", DATABASE_ID);
    console.log("\nSchema Summary:");
    console.log(
      "┌────────────────┬──────────┬──────────┬───────────────────────────────┐"
    );
    console.log(
      "│ Field          │ Type     │ Required │ Notes                         │"
    );
    console.log(
      "├────────────────┼──────────┼──────────┼───────────────────────────────┤"
    );
    console.log(
      "│ $id            │ string   │ auto     │ Appwrite auto PK              │"
    );
    console.log(
      "│ caregiver_id   │ string   │ ✓        │ FK → caregiver.$id            │"
    );
    console.log(
      "│ caregiver_name │ string   │ ✓        │ Display name                  │"
    );
    console.log(
      "│ elderly_id     │ string   │ ✓        │ FK → elderly.$id              │"
    );
    console.log(
      "│ voice_id       │ string   │ ✓        │ Doubao Seedance voice clone ID│"
    );
    console.log(
      "│ status         │ enum     │ ✓        │ pending|training|ready|failed │"
    );
    console.log(
      "│ created_at     │ string   │          │ ISO 8601 timestamp            │"
    );
    console.log(
      "│ updated_at     │ string   │          │ ISO 8601 timestamp            │"
    );
    console.log(
      "│ $createdAt     │ datetime │ auto     │ Row creation time             │"
    );
    console.log(
      "│ $updatedAt     │ datetime │ auto     │ Row update time               │"
    );
    console.log(
      "└────────────────┴──────────┴──────────┴───────────────────────────────┘"
    );
    console.log("\nIndexes:");
    console.log("  • KEY(elderly_id) - Load voices for elderly user");
    console.log("  • KEY(caregiver_id) - Caregiver voice management");
    console.log(
      "  • KEY(elderly_id, caregiver_id) - Fast composite lookup"
    );
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
