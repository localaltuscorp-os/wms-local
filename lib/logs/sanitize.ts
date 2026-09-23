/**
 * SECRET SANITISATION FOR THE LOG.
 *
 * The log must never capture a credential. Before any `changes` or `metadata`
 * object is persisted it is passed through here, which drops every value whose
 * KEY names a secret — case-insensitively — and descends into nested
 * objects/arrays so nothing hides a token one level down.
 *
 * PURE — no `server-only`, so the client tracker can run the same scrub before
 * it even sends a payload (defence in depth: the server also scrubs on ingest).
 */

const SECRET_KEY = /(password|passwd|secret|token|cookie|apikey|api_key|credential|refresh|id_token|idtoken|authorization|private_key|signature)/i;

const REDACTED = "[redacted]";

function scrubKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** Recursively remove secret values from an arbitrary object/array/primitive. */
export function sanitizeForLog<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForLog(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubKey(k) ? REDACTED : sanitizeForLog(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Whether a value is safe to log as-is (a shorthand for the ingest route's
 * shape check). Rejects objects that are neither plain JSON nor undefined.
 */
export function isPlainLogValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isPlainLogValue);
  if (t === "object") return Object.values(value as object).every(isPlainLogValue);
  return false;
}
