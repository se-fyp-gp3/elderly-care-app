/**
 * Script to create the "direct_messages" collection in Appwrite.
 *
 * Run with:
 *   node scripts/create-direct-messages-collection.js
 *
 * Prerequisites:
 *   - Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_KEY env vars
 *   - Or rely on the .env file loaded by dotenv
 */

require("dotenv").config();
const { Client, Databases, Permission, Role } = require("node-appwrite");

const ENDPOINT =
  process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.EXPO_PRIVATE_APPWRITE_KEY;
const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID;
const COLLECTION_ID =
  process.env.EXPO_PUBLIC_DIRECT_MESSAGES_TABLE_ID || "direct_messages";

async function main() {
  if (!PROJECT_ID || !API_KEY || !DATABASE_ID) {
    console.error(
      "Missing env vars: EXPO_PUBLIC_APPWRITE_PROJECT_ID, EXPO_PRIVATE_APPWRITE_KEY, EXPO_PUBLIC_DB_ID",
    );
    process.exit(1);
  }

  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

  const databases = new Databases(client);

  console.log("Creating direct_messages collection...");

  try {
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      "Direct Messages",
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
      ],
    );
    console.log("✅ Collection created");
  } catch (err) {
    if (err.code === 409) {
      console.log("⚠️  Collection already exists, skipping creation");
    } else {
      throw err;
    }
  }

  // Create attributes
  const attributes = [
    {
      type: "string",
      key: "conversation_id",
      size: 255,
      required: true,
    },
    {
      type: "string",
      key: "sender_id",
      size: 255,
      required: true,
    },
    {
      type: "string",
      key: "sender_name",
      size: 255,
      required: true,
    },
    {
      type: "string",
      key: "sender_role",
      size: 20,
      required: true,
    },
    {
      type: "string",
      key: "receiver_id",
      size: 255,
      required: true,
    },
    {
      type: "string",
      key: "body",
      size: 5000,
      required: true,
    },
    {
      type: "string",
      key: "created_at",
      size: 255,
      required: true,
    },
    {
      type: "boolean",
      key: "is_read",
      required: true,
      default: false,
    },
  ];

  for (const attr of attributes) {
    try {
      if (attr.type === "string") {
        await databases.createStringAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.key,
          attr.size,
          attr.required,
          attr.default,
        );
      } else if (attr.type === "boolean") {
        await databases.createBooleanAttribute(
          DATABASE_ID,
          COLLECTION_ID,
          attr.key,
          attr.required,
          attr.default,
        );
      }
      console.log(`  ✅ Attribute "${attr.key}" created`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`  ⚠️  Attribute "${attr.key}" already exists`);
      } else {
        console.error(`  ❌ Error creating "${attr.key}":`, err.message);
      }
    }
  }

  // Wait for attributes to be available
  console.log("\nWaiting 3 seconds for attributes to be available...");
  await new Promise((r) => setTimeout(r, 3000));

  // Create indexes
  const indexes = [
    {
      key: "idx_conversation_id",
      type: "key",
      attributes: ["conversation_id"],
    },
    {
      key: "idx_conversation_created",
      type: "key",
      attributes: ["conversation_id", "created_at"],
    },
    {
      key: "idx_receiver_read",
      type: "key",
      attributes: ["receiver_id", "is_read"],
    },
    {
      key: "idx_sender_id",
      type: "key",
      attributes: ["sender_id"],
    },
  ];

  for (const idx of indexes) {
    try {
      await databases.createIndex(
        DATABASE_ID,
        COLLECTION_ID,
        idx.key,
        idx.type,
        idx.attributes,
      );
      console.log(`  ✅ Index "${idx.key}" created`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`  ⚠️  Index "${idx.key}" already exists`);
      } else {
        console.error(`  ❌ Error creating index "${idx.key}":`, err.message);
      }
    }
  }

  console.log("\n🎉 Done! Add this to your .env file:");
  console.log(`EXPO_PUBLIC_DIRECT_MESSAGES_TABLE_ID=${COLLECTION_ID}`);
}

main().catch(console.error);
