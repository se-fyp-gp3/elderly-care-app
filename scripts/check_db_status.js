const { Client, Account, Databases, Query } = require('node-appwrite');

// Configuration from .env context
const ENDPOINT = 'https://elderly-care-app.southeastasia.cloudapp.azure.com/v1';
const PROJECT_ID = 'elderly-care-app';
const DATABASE_ID = 'elderly-care-app-db';
const MEDICATION_LOGS_TABLE_ID = 'medication_logs';
const ELDERLY_TABLE_ID = 'elderly';

// User credentials
const EMAIL = '240003936@stu.vtc.edu.hk';
const PASSWORD = 'james168';

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);

async function checkDB() {
    try {
        console.log(`Logging in as ${EMAIL}...`);
        let session;
        try {
            session = await account.createEmailPasswordSession(EMAIL, PASSWORD);
            console.log('Login successful.');
            // console.log('Session keys:', Object.keys(session));
            
            // Try to set session. Note: For node-appwrite, session token might be in 'secret' or we use '$id' or parse cookie.
            // If session has secret, use it.
            if (session.secret) {
                console.log('Using session secret for auth.');
                client.setSession(session.secret);
            } else if (session.$id) {
                console.log('Using session ID for auth (might fail if secret required).');
                client.setSession(session.$id);
            }

        } catch (e) {
            console.log('Login failed (maybe active?):', e.message);
            // If failed, we assume we might need to rely on existing state? But node-appwrite has no state.
            // If we can't login, we can't proceed really.
            return;
        }

        const user = await account.get();
        console.log(`User ID: ${user.$id} (Verified Auth)`);

        // Get Elderly Profile
        console.log(`Fetching Elderly Profile for User ID: ${user.$id}...`);
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

        console.log(`Fetching logs from ${MEDICATION_LOGS_TABLE_ID} for elderly ${elderlyId}...`);
        // Get logs for today/recent
        const response = await databases.listDocuments(
            DATABASE_ID,
            MEDICATION_LOGS_TABLE_ID,
            [
                Query.equal('elderly', elderlyId),
                Query.orderDesc('$createdAt'),
                Query.limit(10)
            ]
        );

        console.log(`Found ${response.total} logs. Showing last 10 created:`);
        
        if (response.documents.length === 0) {
            console.log("No logs found.");
        }

        response.documents.forEach(doc => {
            console.log('------------------------------------------------');
            console.log(`Log ID:       ${doc.$id}`);
            console.log(`Created At:   ${doc.$createdAt}`);
            console.log(`Scheduled At: ${doc.scheduled_at}`);
            console.log(`Updated At:   ${doc.$updatedAt}`);
            console.log(`Status:       ${doc.status}`);
            console.log(`Taken At:     ${doc.taken_at}`);
            
            const reminder = doc.elderly_medication_reminder;
            const reminderId = (reminder && typeof reminder === 'object') ? reminder.$id : reminder;
            console.log(`Reminder ID:  ${reminderId}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

checkDB();
