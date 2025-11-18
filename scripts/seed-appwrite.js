/**
 * Server-side seed script for Appwrite.
 * Usage:
 * 1. npm install node-appwrite dotenv
 * 2. Create a .env file with APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID, and APPWRITE_API_KEY (recommended)
 * 3. node scripts/seed-appwrite.js
 */

require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID || process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.EXPO_PUBLIC_DB_ID;
const collectionId = process.env.APPWRITE_COLLECTION_ID || process.env.EXPO_PUBLIC_ELDERLY_COLLECTION_ID || 'elderly_t1_test';
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !project || !databaseId) {
  console.error('Missing configuration. Please set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_DATABASE_ID in your environment.');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(project);

if (apiKey) {
  client.setKey(apiKey);
} else {
  console.warn('No APPWRITE_API_KEY provided. The script will try to operate without a key — this requires the collection to allow public writes.');
}

const databases = new Databases(client);

const elderlyList = [
  { id: 1, name: 'Grandpa Zhang', phone: '+8613812345678', age: 78, status: 'normal' },
  { id: 2, name: 'Grandma Li', phone: '+8613912345678', age: 82, status: 'warning' },
  { id: 3, name: 'Grandpa Wang', phone: '+8615012345678', age: 75, status: 'normal' },
];

async function seed() {
  console.log('Endpoint:', endpoint);
  console.log('Project:', project);
  console.log('Database ID:', databaseId);
  console.log('Collection ID:', collectionId);

  try {
    // Ensure required attributes (columns) exist for the Table/Collection
    const ensureAttributes = async () => {
      // Desired attributes: name (string), phone (string), age (int), status (string), originalId (int)
      const attrOps = [
        { method: 'createStringAttribute', args: [databaseId, collectionId, 'name', 255, true] },
        { method: 'createStringAttribute', args: [databaseId, collectionId, 'phone', 64, false] },
        { method: 'createIntegerAttribute', args: [databaseId, collectionId, 'age', true] },
        { method: 'createStringAttribute', args: [databaseId, collectionId, 'status', 50, false] },
        { method: 'createIntegerAttribute', args: [databaseId, collectionId, 'originalId', true] },
      ];

      for (const op of attrOps) {
        try {
          if (typeof databases[op.method] === 'function') {
            await databases[op.method](...op.args);
            console.log('Attribute created:', op.args[2]);
          } else {
            console.log('SDK does not expose', op.method, '- skipping attribute creation for', op.args[2]);
          }
        } catch (err) {
          // Many reasons to fail: attribute already exists, or API differences. Log and continue.
          console.log('Could not create attribute', op.args[2], '-', err.response || err.message || err);
        }
      }
    };

    await ensureAttributes();

    // Try creating documents
    for (const e of elderlyList) {
      const docId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const payload = { name: e.name, phone: e.phone, age: e.age, status: e.status, originalId: e.id };
      try {
        const res = await databases.createDocument(databaseId, collectionId, docId, payload);
        console.log('Created', res.$id, e.name);
      } catch (err) {
        console.error('Error creating', e.name, err.response || err.message || err);
      }
    }

    console.log('Seeding finished.');
  } catch (err) {
    console.error('Fatal error', err.response || err.message || err);
  }
}

seed();
