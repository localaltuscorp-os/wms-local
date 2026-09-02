"use client";
import { useCallback } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { IdleTimer } from "@/components/auth/idle-timer";

export function IdleTimerClient({ timeoutMinutes }: { timeoutMinutes: number }) {
  // Stable callback so IdleTimer doesn't tear down listeners every render.
  const onTimeout = useCallback(async () => {
    // Full sign-out on idle — same as the manual exit. Clear the Firebase
    // CLIENT session FIRST so it can't silently re-mint a token (which would
    // spawn a fresh auth_sessions row — the "multiple sessions" problem); the
    // server route then revokes refresh tokens + the DB session and drops the
    // cookie. Best-effort throughout: navigate regardless.
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // ignore — the server revoke below is what matters
    }
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Best-effort; navigate regardless so middleware redirects.
    }
    // HARD nav so the next user on this browser can't be served cached pages.
    window.location.replace("/login?reason=idle");
  }, []);
  return <IdleTimer timeoutMs={timeoutMinutes * 60_000} onTimeout={onTimeout} />;
}
