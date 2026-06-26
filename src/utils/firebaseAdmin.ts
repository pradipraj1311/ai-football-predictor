import * as admin from 'firebase-admin';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

// A module-level singleton to hold the initialized Firebase app.
let firebaseAppInstance: admin.app.App | null = null;

function initializeFirebaseApp(): admin.app.App | null {
    // On warm Vercel invocations, this singleton will be populated.
    if (firebaseAppInstance) {
        return firebaseAppInstance;
    }

    try {
        const projectId = process.env.project_id || '';
        const clientEmail = process.env.client_email || '';
        const privateKey = (process.env.private_key || '').replace(/\\n/g, '\n');

        if (projectId && clientEmail && privateKey) {
            firebaseAppInstance = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log("🔥 Firebase Admin Initialized (Lazy)");
            return firebaseAppInstance;
        } else {
            console.error("🚨 CRITICAL ERROR: Firebase Environment Variables are missing or empty in Vercel!");
            console.log(`Debug -> projectId: ${!!projectId}, clientEmail: ${!!clientEmail}, privateKey: ${!!privateKey}`);
            return null;
        }
    } catch (error: any) {
        if (error.code === 'app/duplicate-app') {
            console.log("🔥 Firebase Admin already exists (Warm Start)");
            firebaseAppInstance = admin.app(); // Get the existing default app
            return firebaseAppInstance;
        }
        console.error("🚨 CRITICAL: Firebase Admin Initialization Failed:", error);
        return null;
    }
}

// A safe getter for the messaging service that uses the initialized app.
const getSafeMessaging = (): Messaging | null => {
    if (!firebaseAppInstance) {
        initializeFirebaseApp();
    }
    return firebaseAppInstance ? getMessaging(firebaseAppInstance) : null;
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
        const messaging = getSafeMessaging();
        if (!messaging) {
            console.error("Aborting notification send: Firebase Messaging is not available.");
            // Throw an error so the calling function knows about the failure.
            throw new Error("Firebase Messaging service is not initialized.");
        }
        const response = await messaging.send(message);
        console.log(`Successfully sent message to topic ${topic}:`, response);
    } catch (error) {
        console.error(`Error sending message to topic ${topic}:`, error);
        // Re-throw the error to allow for upstream error handling.
        throw error;
    }
};