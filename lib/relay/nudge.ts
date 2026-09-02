/**
 * Phase B — the after-commit relay nudge. Call this from `afterResponse(...)`
 * right after a mutation that emitted events, so projections update within
 * milliseconds instead of waiting for the next cron tick. It is purely a
 * latency optimisation: the relay is idempotent and the cron is the durable
 * backstop, so a dropped nudge only delays a projection, never loses an event.
 *
 * Coalesced: many mutations in the same instant schedule ONE relay run, so a
 * burst of writes doesn't fan out into a relay run per write.
 */
import { runRelay } from "./run";

let scheduled = false;

export function nudgeRelay(): void {
  if (process.env.RELAY_OFF === "true") return;
  if (scheduled) return;
  scheduled = true;
  // Defer to the next tick so several emits in one request collapse into one run.
  queueMicrotask(() => {
    scheduled = false;
    void runRelay().catch((err) =>
      console.warn("[relay/nudge] run failed (cron will retry):", (err as Error)?.message ?? err),
    );
  });
}
