// Pure, DB-free WebAuthn error helpers — safe to import in client components
// AND unit tests (no `server-only` chain, unlike ./attendance.ts).

/**
 * The `@simplewebauthn/browser` `WebAuthnError.code` raised by
 * `startRegistration` when the device already holds a credential listed in
 * `excludeCredentials`. It means "this device is already enrolled" — the
 * correct recovery is to AUTHENTICATE, not to re-register.
 */
export const ALREADY_REGISTERED_CODE = "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";

/** True when a registration attempt failed only because this device is already
 *  enrolled (so the caller should fall back to authentication). */
export function isAuthenticatorAlreadyRegistered(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === ALREADY_REGISTERED_CODE
  );
}
