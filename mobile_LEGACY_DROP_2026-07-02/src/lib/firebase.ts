import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Firebase client for the native app. Uses the SAME public web config as the
 * dashboard (these keys are public by design — they ship in the web bundle).
 *
 * Persistence is version-defensive: `getReactNativePersistence` moved around
 * across Firebase JS SDK versions (and isn't in v12's web entry), so we
 * feature-detect it. With it → the session persists in AsyncStorage across app
 * restarts; without it → default in-memory persistence (still fully signs in,
 * just won't survive a cold restart). Web always uses the browser default.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBNQ9eTGVV3SxX-g0BKxwVcLzNsI1fezlM',
  authDomain: 'altuscorp-e7140.firebaseapp.com',
  projectId: 'altuscorp-e7140',
  appId: '1:96159197030:web:2e00a4f035a6c1872f4aa7',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createAuth(): Auth {
  if (Platform.OS === 'web') return getAuth(app);

  const getRNPersistence = (
    FirebaseAuth as unknown as {
      getReactNativePersistence?: (storage: unknown) => unknown;
    }
  ).getReactNativePersistence;

  if (typeof getRNPersistence === 'function') {
    return initializeAuth(app, { persistence: getRNPersistence(AsyncStorage) as never });
  }
  try {
    return initializeAuth(app);
  } catch {
    return getAuth(app);
  }
}

export const firebaseAuth: Auth = createAuth();
