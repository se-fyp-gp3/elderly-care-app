/**
 * Script to add attributes to existing elderly_medications collection
 * 
 * Run this script with: node scripts/add-missing-attributes.js
 */

const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(process.env.EXPO_PUBLIC_APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID;
const COLLECTION_ID = 'elderly_medications';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function addAttributes() {
  try {
    console.log('Adding attributes to elderly_medications collection...\n');
    
    const attributes = [
      {
        name: 'userId',
        type: 'string',
        fn: () => databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'userId', 255, true)
      },
      {
        name: 'medicineName',
        type: 'string',
        fn: () => databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'medicineName', 255, true)
      },
      {
        name: 'timesPerDay',
        type: 'integer',
        fn: () => databases.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, 'timesPerDay', true, 1, 10)
      },
      {
        name: 'durationDays',
        type: 'integer',
        fn: () => databases.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, 'durationDays', true, 1)
      },
      {
        name: 'followUpCaregiver',
        type: 'string',
        fn: () => databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'followUpCaregiver', 255, false)
      },
      {
        name: 'afterMeal',
        type: 'boolean',
        fn: () => databases.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, 'afterMeal', true)
      },
      {
        name: 'reminderTimes',
        type: 'string',
        fn: () => databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'reminderTimes', 10000, true)
      },
      {
        name: 'startDate',
        type: 'datetime',
        fn: () => databases.createDatetimeAttribute(DATABASE_ID, COLLECTION_ID, 'startDate', true)
      },
      {
        name: 'active',
        type: 'boolean',
        fn: () => databases.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, 'active', true)
      },
      {
        name: 'createdAt',
        type: 'datetime',
        fn: () => databases.createDatetimeAttribute(DATABASE_ID, COLLECTION_ID, 'createdAt', true)
      }
    ];
    
    for (const attr of attributes) {
      try {
        await attr.fn();
        console.log(`✓ Created ${attr.name} (${attr.type})`);
        await sleep(1000);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⊘ ${attr.name} already exists (skipped)`);
        } else {
          console.log(`✗ Failed to create ${attr.name}: ${error.message}`);
        }
      }
    }
    
    console.log('\nWaiting for attributes to be ready...');
    await sleep(5000);
    
    console.log('\nCreating indexes...');
    
    // Index 1: userId
    try {
      await databases.createIndex(DATABASE_ID, COLLECTION_ID, 'userId', 'key', ['userId'], ['ASC']);
      console.log('✓ Created userId index');
    } catch (error) {
      if (error.code === 409) {
        console.log('⊘ userId index already exists (skipped)');
      } else {
        console.log(`✗ Failed to create userId index: ${error.message}`);
      }
    }
    
    await sleep(1000);
    
    // Index 2: createdAt
    try {
      await databases.createIndex(DATABASE_ID, COLLECTION_ID, 'createdAt', 'key', ['createdAt'], ['DESC']);
      console.log('✓ Created createdAt index');
    } catch (error) {
      if (error.code === 409) {
        console.log('⊘ createdAt index already exists (skipped)');
      } else {
        console.log(`✗ Failed to create createdAt index: ${error.message}`);
      }
    }
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Check your Appwrite console to verify all attributes');
    console.log('2. Refresh your app and try using the Reminder feature');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
addAttributes();
