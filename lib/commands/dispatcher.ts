/**
 * Phase B — the command channel dispatcher (ARCHITECTURE.md Law 8).
 *
 * Commands are external side-effects (email, WhatsApp, calendar, …) on a
 * SEPARATE, exactly-once channel that is NEVER replayed. This consumer derives
 * commands from events and enqueues them into `command_log` with a deterministic
 * `dedupe_key`, so re-processing or replaying the same event collides on the
 * unique key (ON CONFLICT DO NOTHING) and fires nothing twice.
 *
 * GATED OFF by default (COMMANDS_VIA_LEDGER!=="true"): today the live
 * notifications still flow through the existing `afterResponse(notify)` path, so
 * enqueuing here too would double-send. When you migrate a given effect to the
 * ledger, enable the flag AND remove that effect's afterResponse call. Until
 * then this consumer is a no-op that simply advances its cursor — so enabling it
 * later only affects FUTURE events (replaying history must never notify — Law 8).
 */
import { db, commandLog } from "@/lib/db";
import type { Consumer } from "@/lib/relay/relay";
import type { StoredEvent } from "@/lib/events/types";
import { deriveCommands } from "./derive";

export { deriveCommands } from "./derive";

export const COMMAND_DISPATCHER_CONSUMER = "command:dispatcher";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function ledgerEnabled(): boolean {
  return process.env.COMMANDS_VIA_LEDGER === "true";
}

export const commandDispatcherConsumer: Consumer = {
  name: COMMAND_DISPATCHER_CONSUMER,
  async handle(event: StoredEvent, tx: Tx) {
    if (!ledgerEnabled()) return; // no-op; cursor still advances (Law 8)
    const commands = deriveCommands(event);
    for (const c of commands) {
      await tx
        .insert(commandLog)
        .values({
          commandType: c.commandType,
          dedupeKey: c.dedupeKey,
          payload: c.payload,
          correlationId: event.correlationId ?? null,
        })
        .onConflictDoNothing({ target: commandLog.dedupeKey });
    }
  },
};
