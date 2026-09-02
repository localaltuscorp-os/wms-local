import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { TaskStatus } from "@/db/enums";
export {
  parseActivityFilters,
  groupByDay,
  type ActivityRow,
  type ActivityFilters,
  type DayGroup,
  type ActivitySource,
} from "@/lib/transforms/activity";
import type { ActivityRow, ActivitySource } from "@/lib/transforms/activity";

export interface ListAllActivityOptions {
  /** Cursor — return rows strictly older than this timestamp. */
  before?: Date;
  /** Page size; clamped to [1, MAX_PAGE_SIZE]. Default DEFAULT_PAGE_SIZE. */
  limit?: number;
  /** Filter to events authored by any of these actor IDs. */
  actorIds?: string[];
  /** Filter to these event types (open string set across all three sources). */
  kinds?: string[];
  /** Restrict the UNION to a subset of sources. Defaults to all three. */
  source?: ActivitySource[];
  /** Lower bound on created_at (inclusive). */
  from?: Date;
  /** Upper bound on created_at (inclusive). */
  to?: Date;
}

export interface ListAllActivityResult {
  events: ActivityRow[];
  /** When more rows exist, the ISO timestamp of the oldest returned row. */
  nextCursor: string | null;
  hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * Returns admin activity org-wide, newest first — UNION ALL across
 * `task_events`, `employee_events`, and `settings_events` so the admin
 * activity feed surfaces every audited mutation in one stream.  Joins the
 * actor's name + avatar, the task's subject/title/status, and the target
 * employee's name in a single SQL round-trip (no N+1).  Cursor-based
 * pagination via `before`.
 *
 * RLS Phase 1 (read) is satisfied by the `requireAdmin` guard on the
 * `(admin)` layout — only admins reach this query helper.
 */
export async function listAllActivity(
  opts: ListAllActivityOptions = {},
): Promise<ListAllActivityResult> {
  const limit = clampLimit(opts.limit);
  const source: readonly ActivitySource[] =
    opts.source && opts.source.length > 0
      ? opts.source
      : (["task", "employee", "settings"] as const);

  // postgres-js can't bind raw Date objects inside ad-hoc fragments; pass
  // ISO strings + cast to timestamptz so the planner has a concrete type.
  const beforeIso = opts.before ? opts.before.toISOString() : null;
  const fromIso = opts.from ? opts.from.toISOString() : null;
  const toIso = opts.to ? opts.to.toISOString() : null;
  const actorIds =
    opts.actorIds && opts.actorIds.length > 0 ? opts.actorIds : null;
  const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : null;

  // Per-arm filter fragment. Each arm references different column names so
  // we re-emit the WHERE list against the alias-qualified column names.
  const armFilter = (
    createdCol: string,
    actorCol: string,
    kindCol: string,
  ): SQL => sql`
    ${beforeIso ? sql`AND ${sql.raw(createdCol)} < ${beforeIso}::timestamptz` : sql``}
    ${fromIso ? sql`AND ${sql.raw(createdCol)} >= ${fromIso}::timestamptz` : sql``}
    ${toIso ? sql`AND ${sql.raw(createdCol)} <= ${toIso}::timestamptz` : sql``}
    ${actorIds ? sql`AND ${sql.raw(actorCol)} = ANY(${actorIds})` : sql``}
    ${kinds ? sql`AND ${sql.raw(kindCol)} = ANY(${kinds})` : sql``}
  `;

  const taskArm: SQL | null = source.includes("task")
    ? sql`
      SELECT
        te.id, 'task'::text AS source,
        te.task_id, NULL::uuid AS target_employee_id,
        NULL::text AS setting_scope, NULL::text AS setting_target_id,
        te.actor_id, te.event_type, te.from_value, te.to_value, te.note, te.created_at,
        t.subject AS task_subject, t.title AS task_title, t.status::text AS task_status,
        NULL::text AS target_employee_name
      FROM task_events te
      LEFT JOIN tasks t ON t.id = te.task_id
      WHERE 1=1 ${armFilter("te.created_at", "te.actor_id", "te.event_type")}
    `
    : null;

  const employeeArm: SQL | null = source.includes("employee")
    ? sql`
      SELECT
        ee.id, 'employee'::text AS source,
        NULL::uuid AS task_id, ee.employee_id AS target_employee_id,
        NULL::text AS setting_scope, NULL::text AS setting_target_id,
        ee.actor_id, ee.event_type, ee.from_value, ee.to_value, ee.note, ee.created_at,
        NULL::text AS task_subject, NULL::text AS task_title, NULL::text AS task_status,
        tgt.name AS target_employee_name
      FROM employee_events ee
      LEFT JOIN employees tgt ON tgt.id = ee.employee_id
      WHERE 1=1 ${armFilter("ee.created_at", "ee.actor_id", "ee.event_type")}
    `
    : null;

  const settingsArm: SQL | null = source.includes("settings")
    ? sql`
      SELECT
        se.id, 'settings'::text AS source,
        NULL::uuid AS task_id, NULL::uuid AS target_employee_id,
        se.scope AS setting_scope, se.target_id AS setting_target_id,
        se.actor_id, se.event_type, se.from_value, se.to_value, se.note, se.created_at,
        NULL::text AS task_subject, NULL::text AS task_title, NULL::text AS task_status,
        NULL::text AS target_employee_name
      FROM settings_events se
      WHERE 1=1 ${armFilter("se.created_at", "se.actor_id", "se.event_type")}
    `
    : null;

  const arms = [taskArm, employeeArm, settingsArm].filter(
    (a): a is SQL => a !== null,
  );
  if (arms.length === 0) {
    return { events: [], nextCursor: null, hasMore: false };
  }

  const unioned = arms.reduce<SQL>((acc, arm, idx) =>
    idx === 0 ? arm : sql`${acc} UNION ALL ${arm}`,
    sql``,
  );

  const rows = (await db.execute(sql`
    WITH unioned AS (${unioned})
    SELECT u.*, a.name AS actor_name, a.avatar_url AS actor_avatar_url
    FROM unioned u
    LEFT JOIN employees a ON a.id = u.actor_id
    ORDER BY u.created_at DESC
    LIMIT ${limit + 1}
  `)) as unknown as Array<{
    id: string;
    source: ActivitySource;
    task_id: string | null;
    target_employee_id: string | null;
    setting_scope: string | null;
    setting_target_id: string | null;
    actor_id: string;
    event_type: string;
    from_value: unknown;
    to_value: unknown;
    note: string | null;
    created_at: Date | string;
    task_subject: string | null;
    task_title: string | null;
    task_status: string | null;
    target_employee_name: string | null;
    actor_name: string | null;
    actor_avatar_url: string | null;
  }>;

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const events: ActivityRow[] = sliced.map((r) => ({
    id: r.id,
    source: r.source,
    taskId: r.task_id,
    taskSubject: r.task_subject,
    taskTitle: r.task_title ?? (r.source === "task" ? "(deleted task)" : ""),
    taskStatus: (r.task_status ?? "not_started") as TaskStatus,
    targetEmployeeId: r.target_employee_id,
    targetEmployeeName: r.target_employee_name,
    settingScope: r.setting_scope,
    settingTargetId: r.setting_target_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorAvatarUrl: r.actor_avatar_url,
    eventType: r.event_type,
    fromValue: r.from_value,
    toValue: r.to_value,
    note: r.note,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));

  const last = events[events.length - 1];
  const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;

  return { events, nextCursor, hasMore };
}

/** Activity-feed summary tiles used by the sparkline-style strip cards. */
export interface ActivityStats {
  today: number;
  thisWeek: number;
  commentsToday: number;
  statusChangesToday: number;
}

/**
 * Counts for the four summary cards.  All four are derived in a single
 * query (one round-trip) against the UNION of task_events + employee_events
 * + settings_events so the tiles match what the feed displays.  "Today" is
 * computed against the caller-provided `now` so callers control timezone
 * semantics (server-local by default).
 */
export async function getActivityStats(now: Date = new Date()): Promise<ActivityStats> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // postgres-js can't bind raw Date objects inside aggregate FILTER clauses
  // (TypeError: "string" argument must be string/Buffer/ArrayBuffer).  Pass
  // ISO strings + cast to timestamptz so the planner has a concrete type.
  const todayIso = startOfToday.toISOString();
  const weekAgoIso = sevenDaysAgo.toISOString();

  const rows = (await db.execute(sql`
    WITH all_events AS (
      SELECT created_at, event_type FROM task_events
      UNION ALL SELECT created_at, event_type FROM employee_events
      UNION ALL SELECT created_at, event_type FROM settings_events
    )
    SELECT
      COUNT(*) FILTER (WHERE created_at >= ${todayIso}::timestamptz)                                            AS today,
      COUNT(*) FILTER (WHERE created_at >= ${weekAgoIso}::timestamptz)                                          AS this_week,
      COUNT(*) FILTER (WHERE created_at >= ${todayIso}::timestamptz AND event_type = 'commented')               AS comments_today,
      COUNT(*) FILTER (WHERE created_at >= ${todayIso}::timestamptz AND event_type = 'status_changed')          AS status_changes_today
    FROM all_events
  `)) as unknown as Array<{
    today: string | number;
    this_week: string | number;
    comments_today: string | number;
    status_changes_today: string | number;
  }>;

  const row = rows[0];
  return {
    today: Number(row?.today ?? 0),
    thisWeek: Number(row?.this_week ?? 0),
    commentsToday: Number(row?.comments_today ?? 0),
    statusChangesToday: Number(row?.status_changes_today ?? 0),
  };
}

function clampLimit(n: number | undefined): number {
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  const v = Math.trunc(n as number);
  if (v < 1) return 1;
  if (v > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return v;
}
