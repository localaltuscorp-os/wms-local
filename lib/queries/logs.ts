import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLogs,
  designations,
  employees,
  functions,
  payingEntities,
} from "@/db/schema";
import { logModuleTree } from "@/lib/logs/module-map";
import { LOG_EVENT_LABELS, LOG_EVENT_TYPES } from "@/lib/logs/events";
import { nodesToMatches, type LogFilters } from "@/lib/logs/filters";

/**
 * SERVER-SIDE QUERIES FOR ADMIN PANEL → LOGS.
 *
 * `listActivityLogs` applies every filter in one SQL statement (all ANDed,
 * nothing disables another), joins the live employee → function/designation/
 * entity fields, sorts and paginates on the server — never loading the whole
 * history into the browser. `requireAdmin` on the (admin) layout is the gate;
 * nothing here re-checks it because only admin pages call it.
 */

export const LOG_STATUS_OPTIONS = ["SUCCESS", "FAILED", "DENIED"] as const;

export interface LogRow {
  id: string;
  eventAt: Date;
  eventType: string;
  module: string | null;
  page: string | null;
  route: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  action: string | null;
  status: string | null;
  reason: string | null;
  changes: unknown;
  metadata: unknown;
  requestId: string | null;
  operationId: string | null;
  actorType: string | null;
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  functionName: string | null;
  designationName: string | null;
  entityName: string | null;
}

export interface LogPage {
  rows: LogRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function buildWhere(f: LogFilters): SQL | undefined {
  const conds: SQL[] = [];

  if (f.from) conds.push(gte(activityLogs.eventAt, new Date(f.from)));
  if (f.to) conds.push(lte(activityLogs.eventAt, new Date(f.to)));
  if (f.eventTypes.length > 0) conds.push(inArray(activityLogs.eventType, f.eventTypes));
  if (f.statuses.length > 0) conds.push(inArray(activityLogs.status, f.statuses));
  if (f.employeeIds.length > 0) conds.push(inArray(activityLogs.employeeId, f.employeeIds));

  // Function / Entity filter on the LIVE employee relation (no snapshot).
  if (f.functionIds.length > 0) conds.push(inArray(employees.departmentId, f.functionIds));
  if (f.entityIds.length > 0) conds.push(inArray(employees.payingEntityId, f.entityIds));

  // Module/page — expand selected catalogue nodes into (module, page) rules.
  const matches = nodesToMatches(f.nodes);
  if (matches.length > 0) {
    const matchConds = matches.map((m): SQL =>
      m.page
        ? and(eq(activityLogs.module, m.module), eq(activityLogs.page, m.page))!
        : eq(activityLogs.module, m.module),
    );
    conds.push(or(...matchConds)!);
  }

  // Search — a few indexed/cheap columns, never a blind full-table scan.
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "\\$&")}%`;
    conds.push(
      or(
        ilike(employees.name, like),
        ilike(employees.employeeCode, like),
        ilike(activityLogs.resourceId, like),
        ilike(activityLogs.resourceName, like),
        ilike(activityLogs.page, like),
        ilike(activityLogs.route, like),
        ilike(activityLogs.requestId, like),
        ilike(activityLogs.operationId, like),
      )!,
    );
  }

  return conds.length > 0 ? and(...conds) : undefined;
}

const ORDER: Record<LogFilters["sort"], SQL> = {
  newest: desc(activityLogs.eventAt),
  oldest: asc(activityLogs.eventAt),
  person: asc(employees.name),
  module: asc(activityLogs.module),
  event: asc(activityLogs.eventType),
  status: asc(activityLogs.status),
};

export async function listActivityLogs(f: LogFilters): Promise<LogPage> {
  const where = buildWhere(f);
  const base = {
    where,
  };

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        eventAt: activityLogs.eventAt,
        eventType: activityLogs.eventType,
        module: activityLogs.module,
        page: activityLogs.page,
        route: activityLogs.route,
        resourceType: activityLogs.resourceType,
        resourceId: activityLogs.resourceId,
        resourceName: activityLogs.resourceName,
        action: activityLogs.action,
        status: activityLogs.status,
        reason: activityLogs.reason,
        changes: activityLogs.changes,
        metadata: activityLogs.metadata,
        requestId: activityLogs.requestId,
        operationId: activityLogs.operationId,
        actorType: activityLogs.actorType,
        employeeId: activityLogs.employeeId,
        employeeName: employees.name,
        employeeCode: employees.employeeCode,
        functionName: functions.name,
        designationName: designations.name,
        entityName: payingEntities.name,
      })
      .from(activityLogs)
      .leftJoin(employees, eq(activityLogs.employeeId, employees.id))
      .leftJoin(functions, eq(employees.departmentId, functions.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
      .where(where)
      .orderBy(ORDER[f.sort], desc(activityLogs.eventAt))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(activityLogs)
      .leftJoin(employees, eq(activityLogs.employeeId, employees.id))
      .where(where),
  ]);

  const total = Number(totalRows[0]?.n ?? 0);
  return {
    rows: rows.map((r) => ({
      ...r,
      eventAt: r.eventAt instanceof Date ? r.eventAt : new Date(r.eventAt),
      changes: r.changes,
      metadata: r.metadata,
    })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    hasMore: f.page * f.pageSize < total,
  };
}

/** The dropdowns the Logs filter bar needs. */
export async function loadLogFilterOptions(): Promise<{
  functions: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  moduleTree: ReturnType<typeof logModuleTree>;
  eventTypes: { id: string; label: string }[];
  statuses: { id: string; label: string }[];
}> {
  const [fn, emps, ents] = await Promise.all([
    db
      .select({ id: functions.id, name: functions.name })
      .from(functions)
      .orderBy(asc(functions.name)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .orderBy(asc(employees.name)),
    db
      .select({ id: payingEntities.id, name: payingEntities.name })
      .from(payingEntities)
      .orderBy(asc(payingEntities.name)),
  ]);

  return {
    functions: fn,
    employees: emps,
    entities: ents,
    moduleTree: logModuleTree(),
    eventTypes: LOG_EVENT_TYPES.map((t) => ({ id: t, label: LOG_EVENT_LABELS[t] })),
    statuses: LOG_STATUS_OPTIONS.map((s) => ({ id: s, label: s })),
  };
}

export interface LogStats {
  today: number;
  thisWeek: number;
  accessDenied: number;
  logins: number;
}

/** Summary tiles for the Logs header. */
export async function getLogStats(now: Date = new Date()): Promise<LogStats> {
  const istShift = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istShift);
  const today = new Date(Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  ));
  const startOfToday = new Date(today.getTime() - istShift);
  const weekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE event_at >= ${startOfToday.toISOString()}::timestamptz)::int AS today,
      count(*) FILTER (WHERE event_at >= ${weekAgo.toISOString()}::timestamptz)::int AS this_week,
      count(*) FILTER (WHERE event_type = 'ACCESS_DENIED')::int AS access_denied,
      count(*) FILTER (WHERE event_type = 'LOGIN')::int AS logins
    FROM activity_logs
  `);
  const r = (rows as unknown as Array<{
    today: number; this_week: number; access_denied: number; logins: number;
  }>)[0];
  return {
    today: Number(r?.today ?? 0),
    thisWeek: Number(r?.this_week ?? 0),
    accessDenied: Number(r?.access_denied ?? 0),
    logins: Number(r?.logins ?? 0),
  };
}
