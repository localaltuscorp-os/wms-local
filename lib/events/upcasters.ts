/**
 * Phase B — upcasters (ARCHITECTURE.md Law 3). Old event versions are read
 * through Vn→Vn+1 transforms at READ time, so consumers only ever see the
 * latest payload shape. Today every task event is v1, so the registry is empty
 * and `upcast` is the identity — but the seam exists from day one, so the first
 * payload change (e.g. TaskCompletedV2) is a one-line addition, not a migration.
 */
import type { StoredEvent } from "./types";

type Upcaster = (payload: Record<string, unknown>) => Record<string, unknown>;

// Keyed by `${eventType}@v${fromVersion}` → transform to fromVersion+1.
const UPCASTERS: Record<string, Upcaster> = {
  // Example (when TaskCompleted gains a field in v2):
  // "TaskCompleted@v1": (p) => ({ ...p, newField: null }),
};

/** Return the event with its payload upcast to the current contract version. */
export function upcast(event: StoredEvent): StoredEvent {
  let payload = event.payload;
  let version = event.eventVersion;
  // Chain upcasters until no further transform exists.
  for (;;) {
    const fn = UPCASTERS[`${event.eventType}@v${version}`];
    if (!fn) break;
    payload = fn(payload);
    version += 1;
  }
  return version === event.eventVersion ? event : { ...event, payload, eventVersion: version };
}
