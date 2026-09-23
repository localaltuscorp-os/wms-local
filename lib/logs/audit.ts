import "server-only";
import { db } from "@/lib/db";
import { activityLogs } from "@/db/schema";
import { classifyRoute } from "@/lib/logs/module-map";
import { sanitizeForLog } from "@/lib/logs/sanitize";
import { isLogEventType, type LogEventType } from "@/lib/logs/events";
import {
  ensureDailySession,
  touchDailySession,
  type SessionCounters,
} from "@/lib/logs/sessions";

/**
 * THE SERVER AUDIT LOGGER — the authoritative writer for data mutations.
 *
 * Client events arrive through `/api/logs/ingest`; everything that is a real
 * mutation (login, logout, CREATE/UPDATE/DELETE, APPROVE/REJECT/REVERSE,
 * EXPORT, ACCESS_DENIED, configuration changes) is written HERE, from the
 * server action or route that performed it — never trusted to the client to
 * report.
 *
 * `route` is re-classified through the permission catalogue, so `module` and
 * `page` are always the canonical names, even when a caller forgets to pass
 * them. `changes` and `metadata` are scrubbed of secrets before they touch the
 * database.
 */

export interface AuditInput {
  eventType: string;
  /** The acting employee. Omitted for LOGIN_FAILED(unknown email) / SYSTEM. */
  employeeId?: string | null;
  /** Pathname to classify into module/page (e.g. "/admin/employees"). */
  route?: string | null;
  /** Explicit module/page override — still re-classified if `route` is absent. */
  module?: string | null;
  page?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  action?: string | null;
  status?: string | null;
  reason?: string | null;
  /** Field-level before/after, e.g. [{ field, before, after }]. */
  changes?: unknown;
  /** Free-form context (device, browser, filters, counts, …). */
  metadata?: unknown;
  requestId?: string | null;
  operationId?: string | null;
  actorType?: string | null;
  /** Override the event time; defaults to now. */
  eventAt?: Date;
  /** Session counters to bump on the acting employee's daily session. */
  sessionCounters?: SessionCounters;
}

/**
 * Write one immutable activity-log row. Returns nothing; throws on a DB error so
 * a caller that must not lose the record can catch and decide. Fire-and-forget
 * callers append `.catch(console.error)`.
 */
export async function auditLog(input: AuditInput): Promise<void> {
  const type = input.eventType;
  if (!isLogEventType(type)) return; // a typo must not throw into a mutation path

  const cls = input.route ? classifyRoute(input.route) : null;

  const row = {
    eventType: type,
    employeeId: input.employeeId ?? null,
    route: input.route ?? null,
    module: cls?.module ?? input.module ?? null,
    page: cls?.page ?? input.page ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    resourceName: input.resourceName ?? null,
    action: input.action ?? null,
    status: input.status ?? null,
    reason: input.reason ?? null,
    changes: input.changes === undefined ? null : sanitizeForLog(input.changes),
    metadata: input.metadata === undefined ? null : sanitizeForLog(input.metadata),
    requestId: input.requestId ?? null,
    operationId: input.operationId ?? null,
    actorType: input.actorType ?? (input.employeeId ? "employee" : "system"),
    eventAt: input.eventAt ?? new Date(),
  };

  await db.insert(activityLogs).values(row);

  // Bump the acting employee's daily-session counters when asked. Login/logout
  // set `first_login_at`/`logout_at` through sessions.ts directly; this path is
  // for a mutation that should also count as activity on the day.
  if (input.employeeId && input.sessionCounters) {
    const session = await ensureDailySession(input.employeeId, row.eventAt);
    await touchDailySession(session.id, input.sessionCounters, row.eventAt);
  }
}

/** ACCESS_DENIED — the single shape for a refused attempt. */
export async function auditAccessDenied(input: {
  employeeId: string;
  route: string;
  module?: string | null;
  page?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  action?: string | null;
  reason?: string | null;
}): Promise<void> {
  await auditLog({
    eventType: "ACCESS_DENIED",
    status: "DENIED",
    actorType: "employee",
    ...input,
  });
}

/**
 * Convenience for the common server-action shape: log a mutation and mark it an
 * action on the session, then swallow a DB failure so the mutation itself is
 * never blocked by its own audit trail.
 */
export function auditAction(input: AuditInput): void {
  auditLog(input).catch((err) => {
    console.error("[auditLog] write failed (non-fatal):", err);
  });
}
