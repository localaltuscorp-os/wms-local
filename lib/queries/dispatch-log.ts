import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notificationDispatchLog,
  notifications,
  employees,
} from "@/db/schema";

export interface DispatchFailureRow {
  id: string;
  notificationId: string;
  channel: "email" | "slack" | "whatsapp" | "web_push";
  status: "failed" | "failed_terminal";
  errorMessage: string | null;
  attemptCount: number;
  attemptedAt: Date;
  nextAttemptAt: Date | null;
  /** Notification title + recipient for context. */
  notificationTitle: string;
  notificationKind: string;
  recipientName: string | null;
}

/**
 * Phase 3.5-companion — list the most recent dispatch failures + terminal
 * giveups for the admin Integrations tab. Surfaces what would otherwise
 * be silent — every Slack/email/WhatsApp send that didn't land, with
 * the error and how many times we've retried.
 *
 * Caps at `limit` rows (default 50). Joined with `notifications` for the
 * title/kind and `employees` for the recipient name so the row is
 * self-readable.
 */
export async function listRecentDispatchFailures(opts: {
  limit?: number;
} = {}): Promise<DispatchFailureRow[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const rows = await db
    .select({
      id: notificationDispatchLog.id,
      notificationId: notificationDispatchLog.notificationId,
      channel: notificationDispatchLog.channel,
      status: notificationDispatchLog.status,
      errorMessage: notificationDispatchLog.errorMessage,
      attemptCount: notificationDispatchLog.attemptCount,
      attemptedAt: notificationDispatchLog.attemptedAt,
      nextAttemptAt: notificationDispatchLog.nextAttemptAt,
      notificationTitle: notifications.title,
      notificationKind: notifications.kind,
      recipientName: employees.name,
    })
    .from(notificationDispatchLog)
    .leftJoin(
      notifications,
      eq(notifications.id, notificationDispatchLog.notificationId),
    )
    .leftJoin(employees, eq(employees.id, notifications.userId))
    .where(
      inArray(notificationDispatchLog.status, ["failed", "failed_terminal"]),
    )
    .orderBy(desc(notificationDispatchLog.attemptedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    notificationId: r.notificationId,
    channel: r.channel,
    status: r.status as "failed" | "failed_terminal",
    errorMessage: r.errorMessage,
    attemptCount: r.attemptCount,
    attemptedAt: r.attemptedAt,
    nextAttemptAt: r.nextAttemptAt,
    notificationTitle: r.notificationTitle ?? "(deleted notification)",
    notificationKind: r.notificationKind ?? "",
    recipientName: r.recipientName ?? null,
  }));
}

/** Quick counts by status — used in the Integrations tab header strip. */
export async function getDispatchLogTotals(): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  failedTerminal: number;
}> {
  const rows = (await db
    .select({
      status: notificationDispatchLog.status,
      n: sql<number>`count(*)::int`,
    })
    .from(notificationDispatchLog)
    .groupBy(notificationDispatchLog.status)) as { status: string; n: number }[];
  const out = { sent: 0, skipped: 0, failed: 0, failedTerminal: 0 };
  for (const r of rows) {
    if (r.status === "sent") out.sent = r.n;
    else if (r.status === "skipped") out.skipped = r.n;
    else if (r.status === "failed") out.failed = r.n;
    else if (r.status === "failed_terminal") out.failedTerminal = r.n;
  }
  return out;
}
