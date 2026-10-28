import { createHash } from "node:crypto";

/** Stable key for one generated letter request; content changes produce a new archive. */
export function letterDeliveryKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
