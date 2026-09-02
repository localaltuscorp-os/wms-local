"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
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
  // Default "stay signed in" persistence: closing the browser no longer logs you
  // out (this is Firebase's normal behaviour). Paired with a persistent session
  // cookie (maxAge in middleware.ts + the session-mint route). Users stay signed
  // in until they explicitly sign out or the cookie expires.
  setPersistence(cachedAuth, browserLocalPersistence).catch((err) => {
    console.warn("[firebase] setPersistence failed", err);
  });
  return cachedAuth;
}
