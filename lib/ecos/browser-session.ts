/**
 * The browser-session id that makes "snooze until next login" mean something.
 *
 * WHY NOT THE AUTH SESSION. The obvious answer to "show it again after the next
 * login" is to compare against the auth session row — but the app runs in
 * several modes that have no auth session at all (DUMMY_MODE, DEV_AUTH_BYPASS,
 * the local no-login mode), and in those the popup would either never come back
 * or come back on every poll. This is one opaque value that behaves the same in
 * all of them.
 *
 * WHAT IT IS. A random id kept in `sessionStorage`, which the browser scopes to
 * ONE TAB and clears when that tab closes. Snoozing stores it on the receipt;
 * the popup query re-admits the broadcast the moment the id it is asked with is
 * a different one. So: reload, navigate, come back tomorrow in the same tab —
 * still snoozed. New tab, new window, or a fresh sign-in (the login screen
 * calls `resetBrowserSessionId`) — it comes back.
 *
 * It identifies a tab, never a person: it is compared only for equality against
 * a value the same browser wrote, and grants nothing.
 */

const KEY = "altus.broadcast.session";

/** Read (or mint) this browser session's id. "" if storage is unavailable. */
export function browserSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage disabled. An empty id means "nothing is snoozed
    // for me", so the popup keeps working — it just can't be silenced.
    return "";
  }
}

/** Forget it, so every snoozed broadcast returns. Called by the login screen. */
export function resetBrowserSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to reset */
  }
}
