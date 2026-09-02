/**
 * Default password assigned to employees when an admin invites them. They
 * sign in with this immediately and can change it from their Profile. Must
 * stay >= 6 chars (Firebase Auth rejects shorter). Single source of truth —
 * the invite action sets it on the Firebase user and the credentials email
 * displays it; keep both reading from here so they never drift.
 */
export const DEFAULT_INVITE_PASSWORD = "Wms@123";
