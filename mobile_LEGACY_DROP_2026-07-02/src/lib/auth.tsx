import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

import { api, ApiError } from './api';
import { firebaseAuth } from './firebase';

export interface Profile {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  department: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  /** True until the persisted Firebase session has been restored on launch. */
  initializing: boolean;
  user: User | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Restore a persisted session on launch + react to sign-in / sign-out.
  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (u) => {
      setUser(u);
      if (u) {
        try {
          setProfile(await api.get<Profile>('/api/mobile/me'));
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setInitializing(false);
    });
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    // Confirm the account is enrolled in Altus before we treat them as signed
    // in; if not, sign back out so they don't land in a half-authed state.
    try {
      setProfile(await api.get<Profile>('/api/mobile/me'));
    } catch (err) {
      await signOut(firebaseAuth);
      if (err instanceof ApiError && err.status === 403) {
        throw new Error("This email isn't enrolled in Altus Corp. Ask your admin to invite you.");
      }
      throw new Error('Signed in, but we could not reach Altus. Check your connection and try again.');
    }
  }

  async function signOutUser() {
    await signOut(firebaseAuth);
  }

  return (
    <AuthContext.Provider value={{ initializing, user, profile, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
