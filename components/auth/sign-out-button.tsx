"use client";

import * as React from "react";
import { LogOut, Loader2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * A plain sign-out button for surfaces that sit OUTSIDE the app chrome — today
 * only `/device-blocked`, which renders no header and therefore has no user
 * menu to sign out from.
 *
 * Mirrors the idle-timeout exit exactly (components/auth/idle-timer-client):
 * clear the Firebase CLIENT session first so it cannot silently re-mint a token
 * on the next load, then let the server route revoke refresh tokens and drop the
 * cookie. Best-effort throughout — navigate regardless, because a person locked
 * out of the app must always be able to leave it.
 */
export function SignOutButton() {
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
    } catch {
      /* the server revoke below is what matters */
    }
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* best effort — navigate regardless so the middleware redirects */
    }
    // HARD navigation so the next person on this browser is never served this
    // one's cached pages.
    window.location.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red disabled:opacity-60"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
      Sign out
    </button>
  );
}
