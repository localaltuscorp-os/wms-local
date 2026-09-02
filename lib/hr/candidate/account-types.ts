/**
 * Client-safe types for the candidate guest-account lifecycle. Kept OUT of the
 * `"use server"` action module (which may only export async functions) so both
 * the server actions and the client UI can import them.
 */

/** Show-once login details handed to a candidate. */
export type Credentials = { email: string; password: string; loginUrl: string };

export type LifecycleResult =
  | { ok: true; credentials?: Credentials; warning?: string }
  | { ok: false; error: string };
