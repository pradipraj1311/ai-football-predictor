import * as admin from 'firebase-admin';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

// A module-level singleton to hold the initialized Firebase app.
let firebaseAppInstance: admin.app.App | null = null;

function initializeFirebaseApp(): admin.app.App {
    // This function now either returns a valid app or throws a detailed error.
    // It no longer returns null.
    try {
        // The official and most reliable way to get the instance is admin.app().
        // This will throw if no app is initialized.
        console.log("Attempting to get existing Firebase app instance...");
        const existingApp = admin.app();
        console.log("🔥 Firebase Admin already initialized (Warm Start). Reusing instance.");
        return existingApp;
    } catch (error: any) {
        // Error "app/no-app" is expected on a cold start.
        if (error.code === 'app/no-app') {
            console.log("No existing app found. Initializing Firebase Admin (Cold Start)...");

            const projectId = process.env.project_id;
            const clientEmail = process.env.client_email;
            // Use optional chaining for safety
            const privateKey = process.env.private_key?.replace(/\\n/g, '\n');

            if (!projectId || !clientEmail || !privateKey) {
                console.error("🚨 CRITICAL ERROR: Firebase Environment Variables are missing.");
                console.error(`Debug -> Has projectId: ${!!projectId}, Has clientEmail: ${!!clientEmail}, Has privateKey: ${!!process.env.private_key}`);
                throw new Error("Firebase credentials are not configured in environment variables.");
            }

            try {
                const newApp = admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
                console.log("✅ Firebase Admin Initialized Successfully!");
                return newApp;
            } catch (initError: any) {
                console.error("🚨 CRITICAL: Firebase admin.initializeApp() failed during cold start:", initError);
                throw new Error(`Firebase initialization failed: ${initError.message}`);
            }
        } else {
            // Some other unexpected error occurred when calling admin.app()
            console.error("🚨 CRITICAL: Unexpected error during Firebase app retrieval:", error);
            throw new Error(`Firebase app retrieval failed: ${error.message}`);
        }
    }
}

// A safe getter for the messaging service that uses the initialized app.
const getSafeMessaging = (): Messaging => {
    // This function now either returns a valid Messaging service or throws.
    if (!firebaseAppInstance) {
        // On the first call, initialize and cache the instance.
        firebaseAppInstance = initializeFirebaseApp();
    }
    return getMessaging(firebaseAppInstance);
};

export const sendFirebaseTopicNotification = async (topic: string, title: string, body: string) => {
    const message = {
        notification: {
            title: title,
            body: body
        },
        topic: topic,
        android: {
            priority: 'high' as const,
            notification: {
                sound: 'default',
                channelId: 'default',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                },
            },
        },
    };

    try {
        // getSafeMessaging now throws on failure, so we don't need to check for null.
        const messaging = getSafeMessaging();
        const response = await messaging.send(message);
        console.log(`Successfully sent message to topic ${topic}:`, response);
    } catch (error) {
        console.error(`Error sending message to topic ${topic}:`, error);
        // Re-throw the error to allow for upstream error handling.
        throw error;
    }
};