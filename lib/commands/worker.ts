/**
 * Phase B — the command worker (ARCHITECTURE.md Law 8). Drains `command_log`
 * and performs each external effect exactly once, with bounded retry. A command
 * is marked `sent` only after the effect succeeds; failures back off and retire
 * to `terminal` after 3 attempts. The unique `dedupe_key` (set by the
 * dispatcher) is what guarantees a given effect is enqueued once; this worker
 * guarantees it is performed once.
 *
 * Runs from the relay cron alongside the projection consumers. No-op when the
 * ledger is empty (which it is until COMMANDS_VIA_LEDGER is enabled).
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, commandLog } from "@/lib/db";
import type { CommandLogRow } from "@/lib/db";
import { notify } from "@/lib/notifications/dispatch";
import type { NotificationKind } from "@/db/schema";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 60_000, 300_000]; // immediate, 1m, 5m

/** Perform one command. Throws on failure so the caller records a retry. */
async function dispatchCommand(row: CommandLogRow): Promise<void> {
  switch (row.commandType) {
    case "notify": {
      const p = row.payload as {
        userId?: string;
        kind?: string;
        title?: string;
        body?: string | null;
        taskId?: string | null;
        actorId?: string | null;
      };
      if (!p.userId || !p.kind) throw new Error("notify command missing userId/kind");
      await notify({
        userId: p.userId,
        kind: p.kind as NotificationKind,
        title: p.title ?? "You have an update",
        body: p.body ?? null,
        taskId: p.taskId ?? null,
        actorId: p.actorId ?? null,
      });
      return;
    }
    default:
      throw new Error(`unknown command_type: ${row.commandType}`);
  }
}

export async function runCommandWorker(
  { limit = 50 }: { limit?: number } = {},
): Promise<{ sent: number; failed: number; terminal: number }> {
  const now = new Date();
  const rows = await db
    .select()
    .from(commandLog)
    .where(
      and(
        inArray(commandLog.status, ["pending", "failed"]),
        lte(commandLog.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(commandLog.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let terminal = 0;

  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      await dispatchCommand(row);
      await db
        .update(commandLog)
        .set({ status: "sent", sentAt: new Date(), attempts })
        .where(eq(commandLog.id, row.id));
      sent += 1;
    } catch (err) {
      const isTerminal = attempts >= MAX_ATTEMPTS;
      const backoff = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 300_000;
      await db
        .update(commandLog)
        .set({
          status: isTerminal ? "terminal" : "failed",
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          nextAttemptAt: new Date(Date.now() + backoff),
        })
        .where(eq(commandLog.id, row.id));
      if (isTerminal) terminal += 1;
      else failed += 1;
    }
  }
  return { sent, failed, terminal };
}
