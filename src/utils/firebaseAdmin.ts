import * as admin from 'firebase-admin';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

// A module-level singleton to hold the initialized Firebase app.
let firebaseAppInstance: admin.app.App | null = null;

function initializeFirebaseApp(): admin.app.App {
    // This function now either returns a valid app or throws a detailed error.

    // 1. Use the cached instance if available (for subsequent requests in a warm container).
    if (firebaseAppInstance) {
        return firebaseAppInstance;
    }

    // 2. Check the global admin namespace for existing apps (for the first request in a warm container).
    // This is the most reliable serverless pattern, avoiding the unreliable admin.app() in some environments.
    if (admin.apps && admin.apps.length > 0) {
        console.log("🔥 Firebase Admin already initialized (Warm Start). Reusing instance.");
        firebaseAppInstance = admin.apps[0]!; // Use the existing default app.
        return firebaseAppInstance;
    }

    // 3. If no app exists, this is a cold start. Initialize a new app.
    console.log("No existing app found. Initializing Firebase Admin (Cold Start)...");

    const projectId = process.env.project_id;
    const clientEmail = process.env.client_email;
    const privateKey = process.env.private_key?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.error("🚨 CRITICAL ERROR: Firebase Environment Variables are missing.");
        console.error(`Debug -> Has projectId: ${!!projectId}, Has clientEmail: ${!!clientEmail}, Has privateKey: ${!!process.env.private_key}`);
        throw new Error("Firebase credentials are not configured in environment variables.");
    }

    try {
        firebaseAppInstance = admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
        console.log("✅ Firebase Admin Initialized Successfully!");
        return firebaseAppInstance;
    } catch (initError: any) {
        console.error("🚨 CRITICAL: Firebase admin.initializeApp() failed during cold start:", initError);
        throw new Error(`Firebase initialization failed: ${initError.message}`);
    }
}

// A safe getter for the messaging service that uses the initialized app.
const getSafeMessaging = (): Messaging => {
    // initializeFirebaseApp() is idempotent (it only runs once) and handles all caching
    // and initialization logic. We can call it directly to get the app instance.
    const app = initializeFirebaseApp();
    return getMessaging(app);
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