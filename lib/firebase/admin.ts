import "server-only";

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

// Node-runtime only. Never import this from a Client Component or middleware.

let cachedApp: App | null = null;

function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length && existing[0]) {
    cachedApp = existing[0];
    return existing[0];
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Missing Firebase Admin env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)",
    );
  }

  // .env files store the PEM as a single-line literal with \n escapes — unescape:
  const privateKey = rawKey.replace(/\\n/g, "\n");

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
  return cachedApp;
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
