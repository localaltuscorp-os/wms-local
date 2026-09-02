"use client";

import * as React from "react";
import { signOut } from "firebase/auth";
import { LogOut, Loader2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * SIGN OUT for a candidate guest-account.
 *
 * The candidate surface lives OUTSIDE the `(app)` route group, so it never
 * inherits the profile menu that carries the app's sign-out — which left a
 * candidate with no way out of their own session at all (they are also forked
 * away from every other route by requireUser, so there was nowhere else to find
 * one). Especially bad on a shared/office machine used to fill the form.
 *
 * Mirrors the same three steps every other sign-out in the app performs:
 *   1. Firebase client sign-out (best-effort — the server revoke is what counts)
 *   2. POST /api/auth/signout to revoke the session cookie server-side
 *   3. A HARD navigation, so the next person on this browser can't be served a
 *      cached page from the previous session.
 */
export function CandidateSignOut() {
  const [busy, setBusy] = React.useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue — the server-side revoke below is what actually ends it.
    }
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* still hard-navigate: the client credential is already gone */
    }
    window.location.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-ink-muted hover:text-ink-strong disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} strokeWidth={2.4} />}
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
