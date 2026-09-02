import { after } from "next/server";

/**
 * Schedule work to run after the response is flushed, but degrade gracefully
 * outside a request scope (unit tests, one-off scripts) where Next's `after`
 * throws. In those contexts the side-effect is simply skipped.
 */
export function afterResponse(fn: () => unknown): void {
  try {
    after(fn);
  } catch {
    // No request scope (e.g. vitest / tsx scripts) — skip the deferred work.
  }
}
