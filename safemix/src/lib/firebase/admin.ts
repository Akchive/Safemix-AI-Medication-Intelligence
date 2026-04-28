import "server-only";
import { getApps, cert, initializeApp, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let adminApp: App | null = null;

function parsePrivateKey(key?: string): string | undefined {
  if (!key) return undefined;
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export function getAdminAuth() {
  if (!adminApp) {
    if (getApps().length) {
      adminApp = getApps()[0]!;
    } else {
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = parsePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.");
      }

      adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    }
  }

  return getAuth(adminApp);
}
