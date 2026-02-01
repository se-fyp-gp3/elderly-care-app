const { Client, Account, Databases, Query } = require('node-appwrite');

console.log("Script starting...");

const ENDPOINT = 'https://elderly-care-app.southeastasia.cloudapp.azure.com/v1';
const PROJECT_ID = 'elderly-care-app';
const DATABASE_ID = 'elderly-care-app-db';
const MEDICATION_LOGS_TABLE_ID = 'medication_logs';
const ELDERLY_TABLE_ID = 'elderly';

const EMAIL = '240003936@stu.vtc.edu.hk';
const PASSWORD = 'james168';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID); // logic: do NOT setKey, act as client

const account = new Account(client);
const databases = new Databases(client);

async function checkDB() {
    try {
        console.log(`Logging in as ${EMAIL}...`);
        const session = await account.createEmailPasswordSession(EMAIL, PASSWORD);
        console.log('Login successful.');
        console.log('Session ID:', session.$id);
        
        const secret = session.secret;
        console.log('Secret value:', secret);
        
        if (secret) {
            client.setSession(secret);
            console.log("Set session secret.");
        } else {
            console.log("Secret is empty/null which is unexpected for Server SDK usage.");
        }

        const user = await account.get();
        console.log(`User ID: ${user.$id} (Verified Auth)`);

        console.log(`Fetching Elderly Profile...`);
        const elderlyResponse = await databases.listDocuments(
            DATABASE_ID,
            ELDERLY_TABLE_ID,
            [
                Query.equal('user_id', user.$id)
            ]
        );

        if (elderlyResponse.documents.length === 0) {
            console.error('No Elderly profile found for this user.');
            return;
        }

        const elderlyId = elderlyResponse.documents[0].$id;
        console.log(`Elderly Profile ID: ${elderlyId}`);
        
        // Fetch Logs
        const response = await databases.listDocuments(
            DATABASE_ID,
            MEDICATION_LOGS_TABLE_ID,
            [
                Query.equal('elderly', elderlyId),
                Query.orderDesc('$createdAt'),
                Query.limit(5)
            ]
        );

        console.log(`Found ${response.total} logs.`);
        response.documents.forEach(doc => {
             // Redact detailed info but show status
            console.log(`Log ${doc.$id}: Status=${doc.status}, Scheduled=${doc.scheduled_at}`);
        });

    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.log(e.response);
    }
}

checkDB();
