/**
 * Phase B — the relay orchestrator. Runs every registered consumer once, then
 * drains the command worker. Kept separate from relay.ts (the engine) and
 * consumers.ts (the registry) so there's no import cycle.
 *
 * Kill-switch: RELAY_OFF=true makes this a no-op (events accumulate in the log
 * and are processed once the switch is cleared — nothing is lost).
 */
import { runConsumer, type ConsumerResult } from "./relay";
import { CONSUMERS } from "./consumers";
import { runCommandWorker } from "@/lib/commands/worker";

export interface RelayRunResult {
  ranAt: string;
  consumers: ConsumerResult[];
  commands: { sent: number; failed: number; terminal: number };
  skipped?: boolean;
}

export async function runRelay(): Promise<RelayRunResult> {
  const ranAt = new Date().toISOString();
  if (process.env.RELAY_OFF === "true") {
    return { ranAt, consumers: [], commands: { sent: 0, failed: 0, terminal: 0 }, skipped: true };
  }

  const consumers: ConsumerResult[] = [];
  for (const c of CONSUMERS) {
    try {
      consumers.push(await runConsumer(c));
    } catch (err) {
      consumers.push({
        consumer: c.name,
        processed: 0,
        lastSeq: -1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Drain any commands the dispatcher enqueued (no-op when ledger disabled).
  let commands = { sent: 0, failed: 0, terminal: 0 };
  try {
    commands = await runCommandWorker({ limit: 100 });
  } catch (err) {
    console.warn("[relay] command worker failed (non-fatal):", (err as Error)?.message ?? err);
  }

  return { ranAt, consumers, commands };
}
