# Setup Instructions for Elderly Medications Collection

## Prerequisites

You need an **Appwrite API Key** with database permissions to run the automated setup script.

### How to Get an API Key:

1. Open your Appwrite Console: http://elderly-care-app.southeastasia.cloudapp.azure.com
2. Go to **Settings** (left sidebar at the bottom)
3. Click on **API Keys** tab
4. Click **"Create API Key"** button
5. Configure the key:
   - **Name**: `Database Setup Key`
   - **Expiration**: Never (or set a date)
   - **Scopes**: Check these permissions:
     - ✓ `databases.read`
     - ✓ `databases.write`
     - ✓ `collections.read`
     - ✓ `collections.write`
     - ✓ `attributes.read`
     - ✓ `attributes.write`
     - ✓ `indexes.read`
     - ✓ `indexes.write`
6. Click **"Create"**
7. **Copy the API key** (you won't be able to see it again!)

## Setup Steps

### Step 1: Add API Key to .env.local

1. Open `.env.local` file
2. Replace `YOUR_API_KEY_HERE` with your actual API key:
   ```
   EXPO_PUBLIC_APPWRITE_API_KEY=your_actual_api_key_here
   ```
3. Save the file

### Step 2: Run the Setup Script

In your terminal, run:

```bash
node scripts/create-elderly-medications-collection.js
```

The script will:
- ✓ Create the `elderly_medications` collection
- ✓ Add all 10 required attributes
- ✓ Create indexes for userId and createdAt
- ✓ Set proper permissions

### Step 3: Verify Setup

1. Go to your Appwrite Console
2. Navigate to **Databases** → `elderly-care-app-db`
3. You should see the `elderly_medications` collection
4. Check that it has:
   - 10 attributes
   - 2 indexes
   - User permissions (create, read, update, delete)

### Step 4: Test the App

1. Restart your app: `npm run web`
2. Navigate to the Reminder tab
3. Try adding a medication
4. The error should be gone!

## What the Script Creates

### Collection: `elderly_medications`

**Attributes:**
1. `userId` - String (255) - Required
2. `medicineName` - String (255) - Required
3. `timesPerDay` - Integer (1-10) - Required
4. `durationDays` - Integer (min: 1) - Required
5. `followUpCaregiver` - String (255) - Optional
6. `afterMeal` - Boolean - Required (default: false)
7. `reminderTimes` - String (10000) - Required (JSON array)
8. `startDate` - DateTime - Required
9. `active` - Boolean - Required (default: true)
10. `createdAt` - DateTime - Required

**Indexes:**
- `userId` (ASC)
- `createdAt` (DESC)

**Permissions:**
- Users can: Create, Read, Update, Delete

## Troubleshooting

### Error: "Missing API key"
- Make sure you added the API key to `.env.local`
- Restart your terminal after editing `.env.local`

### Error: "Collection already exists"
- The collection is already created! Check your Appwrite console
- If attributes are missing, you can manually add them following the DATABASE_SCHEMA.md guide

### Error: "Invalid scopes"
- Your API key doesn't have enough permissions
- Create a new API key with all the required scopes listed above

### Script hangs or times out
- Attribute creation takes time in Appwrite
- Be patient, it can take 30-60 seconds to complete
- Check your Appwrite console to see progress

## Manual Setup Alternative

If you prefer to set up manually or the script doesn't work, follow the detailed step-by-step guide in `DATABASE_SCHEMA.md`.

## Security Note

**Important**: After running the setup script, you should:
1. Delete or revoke the API key from Appwrite console (for security)
2. Or remove it from `.env.local` file
3. The app doesn't need the API key to run - only users need to authenticate

API keys are powerful - keep them secure and never commit them to version control!
