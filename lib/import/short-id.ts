/**
 * Derive a URL-safe 10-char short-id from a UUID by stripping dashes
 * and taking the first 10 hex characters (40 bits, birthday-bound at
 * ~1M rows). UNIQUE constraint on `tasks.short_id` catches collisions;
 * createTask retries with nextShortIdCandidate on conflict.
 */
export function deriveShortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 10);
}

/**
 * Returns the n-th 10-char slice of a dashless UUID, or null if the
 * slice would run past the end (32 hex chars total → max offset 22).
 */
export function nextShortIdCandidate(uuid: string, offset: number): string | null {
  const dashless = uuid.replace(/-/g, "");
  if (offset < 0 || offset + 10 > dashless.length) return null;
  return dashless.slice(offset, offset + 10);
}
