/**
 * Script to create the elderly_medications collection in Appwrite
 * 
 * Run this script with: node scripts/create-elderly-medications-collection.js
 */

const { Client, Databases, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(process.env.EXPO_PUBLIC_APPWRITE_API_KEY); // You need an API key with proper permissions

const databases = new Databases(client);
const DATABASE_ID = process.env.EXPO_PUBLIC_DB_ID;
const COLLECTION_ID = 'elderly_medications';

async function createCollection() {
  try {
    console.log('Creating collection: elderly_medications...');
    
    // Create the collection
    const collection = await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'Elderly Medications',
      [
        Permission.create(Role.users()),
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      true // documentSecurity
    );
    
    console.log('✓ Collection created successfully!');
    console.log('Collection ID:', collection.$id);
    
    // Create attributes
    console.log('\nCreating attributes...');
    
    // 1. userId - String
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'userId',
      255,
      true // required
    );
    console.log('✓ Created userId attribute');
    
    // Wait a bit between attribute creations
    await sleep(1000);
    
    // 2. medicineName - String
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'medicineName',
      255,
      true
    );
    console.log('✓ Created medicineName attribute');
    
    await sleep(1000);
    
    // 3. timesPerDay - Integer
    await databases.createIntegerAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'timesPerDay',
      true,
      1, // min
      10 // max
    );
    console.log('✓ Created timesPerDay attribute');
    
    await sleep(1000);
    
    // 4. durationDays - Integer
    await databases.createIntegerAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'durationDays',
      true,
      1 // min
    );
    console.log('✓ Created durationDays attribute');
    
    await sleep(1000);
    
    // 5. followUpCaregiver - String (optional)
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'followUpCaregiver',
      255,
      false // not required
    );
    console.log('✓ Created followUpCaregiver attribute');
    
    await sleep(1000);
    
    // 6. afterMeal - Boolean
    await databases.createBooleanAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'afterMeal',
      true // required
    );
    console.log('✓ Created afterMeal attribute');
    
    await sleep(1000);
    
    // 7. reminderTimes - String (JSON array)
    await databases.createStringAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'reminderTimes',
      10000,
      true
    );
    console.log('✓ Created reminderTimes attribute');
    
    await sleep(1000);
    
    // 8. startDate - DateTime
    await databases.createDatetimeAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'startDate',
      true
    );
    console.log('✓ Created startDate attribute');
    
    await sleep(1000);
    
    // 9. active - Boolean
    await databases.createBooleanAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'active',
      true // required
    );
    console.log('✓ Created active attribute');
    
    await sleep(1000);
    
    // 10. createdAt - DateTime
    await databases.createDatetimeAttribute(
      DATABASE_ID,
      COLLECTION_ID,
      'createdAt',
      true
    );
    console.log('✓ Created createdAt attribute');
    
    // Wait for attributes to be ready
    console.log('\nWaiting for attributes to be ready...');
    await sleep(5000);
    
    // Create indexes
    console.log('\nCreating indexes...');
    
    // Index 1: userId
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      'userId',
      'key',
      ['userId'],
      ['ASC']
    );
    console.log('✓ Created userId index');
    
    await sleep(1000);
    
    // Index 2: createdAt
    await databases.createIndex(
      DATABASE_ID,
      COLLECTION_ID,
      'createdAt',
      'key',
      ['createdAt'],
      ['DESC']
    );
    console.log('✓ Created createdAt index');
    
    console.log('\n✅ Collection setup complete!');
    console.log('You can now use the elderly_medications collection in your app.');
    
  } catch (error) {
    console.error('❌ Error creating collection:', error.message);
    if (error.code === 409) {
      console.log('\nCollection might already exist. Check your Appwrite console.');
    }
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the script
createCollection();
