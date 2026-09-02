"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserSessionPersistence,
  type Auth,
} from "firebase/auth";

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const config = {
    apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    appId:      process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  };
  cachedApp = getApps().length ? getApp() : initializeApp(config);
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost) {
    connectAuthEmulator(cachedAuth, `http://${emulatorHost}`, {
      disableWarnings: true,
    });
  }
  // IMPORTANT: keep this in sync with the cookie config in middleware.ts.
  // Both must be session-scoped so closing the browser ends the session.
  // If you want to extend session lifetime, change BOTH places at once.
  setPersistence(cachedAuth, browserSessionPersistence).catch((err) => {
    // Non-fatal — fall back to default (local) persistence rather than
    // bricking the app if IndexedDB is unavailable (private windows, etc.).
    console.warn("[firebase] setPersistence failed", err);
  });
  return cachedAuth;
}
