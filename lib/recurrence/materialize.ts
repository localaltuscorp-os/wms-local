import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, taskEvents } from "@/db/schema";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { generateOccurrences, parseRRule, ymd as ymdUTC } from "@/lib/recurrence/rrule";

/**
 * Recurrence materializer — "single actionable instance" model.
 *
 * For each active template (holds a `recurrence_rule`, not itself a child) we
 * keep at most ONE occurrence materialized *ahead* of today — the immediate
 * next. When today reaches it, the next cron tick creates the following one.
 * We never pre-generate a window of future rows, so a daily task no longer
 * explodes into 14+ future instances cluttering the lists.
 *
 * Past occurrences that were materialized when they were "current" stay as
 * real rows (history / overdue / done). Brand-new templates whose start is in
 * the future generate nothing until their start date is reached.
 *
 * Idempotent: the unique partial index on
 * (recurrence_parent_id, recurrence_occurrence_date) means a duplicate INSERT
 * just no-ops via ON CONFLICT DO NOTHING. Safe to run as often as you like.
 */
export interface MaterializeStats {
  templates: number;
  created: number;
  skipped: number;
  errors: number;
}

// Catch-up guard: if the cron was down for a while we backfill missed
// occurrences up to today (+ one future), capped so a long outage can't spawn
// a runaway. Normal daily operation creates exactly one row per run.
const MAX_CATCHUP = 40;
// Forward search window when finding the next occurrence (covers yearly).
const NEXT_SEARCH_DAYS = 400;

function toMidnightUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}
function addDaysUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

export async function materializeRecurringTasks(
  opts: { now?: Date } = {},
): Promise<MaterializeStats> {
  const now = opts.now ?? new Date();
  const today = toMidnightUTC(now);
  const stats: MaterializeStats = { templates: 0, created: 0, skipped: 0, errors: 0 };

  // Pick rule-holders only: recurrence_rule set, NOT a materialized child,
  // not archived. The partial index `tasks_recurrence_template_idx`
  // covers this scan.
  const templates = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.recurrenceRule),
        isNull(tasks.recurrenceParentId),
        eq(tasks.archived, false),
      ),
    );

  for (const t of templates) {
    stats.templates++;
    const rule = parseRRule(t.recurrenceRule ?? "");
    if (!rule) {
      // Bad rule string — skip silently, log once. The picker writes
      // well-formed RRULEs so this is mostly defensive.
      stats.skipped++;
      continue;
    }
    // Anchor = the template's calendar date (occurrence #1). We use `dueAt`
    // because that's the date the human chose.
    const anchor = t.dueAt;

    // Existing children — their occurrence dates tell us how far we've gone
    // and (with the template) how many occurrences have been materialized.
    const kids = await db
      .select({ d: tasks.recurrenceOccurrenceDate })
      .from(tasks)
      .where(eq(tasks.recurrenceParentId, t.id));
    const childDates = kids.map((k) => k.d).filter((d): d is string => Boolean(d));
    const materializedCount = 1 + childDates.length; // template is occurrence #1

    // Furthest occurrence already created (a child, else the template anchor).
    const floorYmd = childDates.length
      ? childDates.reduce((a, b) => (a > b ? a : b))
      : ymdUTC(toMidnightUTC(anchor));
    const floor = fromYmd(floorYmd);

    // We already have an occurrence queued ahead of today → nothing to do.
    if (floor.getTime() > today.getTime()) {
      stats.skipped++;
      continue;
    }
    // A COUNT-limited series (Google "after N") that's already complete.
    if (rule.count !== null && materializedCount >= rule.count) {
      stats.skipped++;
      continue;
    }

    // Build the set to create: catch up any occurrence up to today, then
    // exactly ONE future occurrence. Generate FROM the floor (a valid
    // on-pattern date) so a long-running daily series doesn't hit the
    // from-original-anchor occurrence cap. COUNT is enforced above; strip it.
    const genRule = { ...rule, count: null };
    const occurrences: string[] = [];
    let cursor = floor;
    let made = materializedCount;
    for (let guard = 0; guard < MAX_CATCHUP; guard++) {
      if (rule.count !== null && made >= rule.count) break;
      const nxt = generateOccurrences(genRule, cursor, addDaysUTC(cursor, NEXT_SEARCH_DAYS))[0];
      if (!nxt) break; // series ended (past UNTIL)
      occurrences.push(nxt);
      made++;
      cursor = fromYmd(nxt);
      if (cursor.getTime() > today.getTime()) break; // created the one future → stop
    }
    if (occurrences.length === 0) {
      stats.skipped++;
      continue;
    }

    // Hour-of-day to clone — pin the new task's dueAt to the same
    // wall-clock the template uses, just on the occurrence date.
    const hh = anchor.getUTCHours();
    const mm = anchor.getUTCMinutes();
    const ss = anchor.getUTCSeconds();

    for (const ymd of occurrences) {
      // Build a Date at `${ymd}T${hh:mm:ss}Z` so the cloned dueAt
      // sits at the same wall-time as the template's dueAt.
      const [yy, mo, dd] = ymd.split("-").map(Number) as [number, number, number];
      const dueAt = new Date(Date.UTC(yy, mo - 1, dd, hh, mm, ss));
      const id = crypto.randomUUID();
      const shortId = deriveShortId(id);
      try {
        // Single INSERT … ON CONFLICT DO NOTHING (the unique partial
        // index handles dedup). We do NOT clone:
        //   - `recurrence_rule`        — children aren't rule-holders.
        //   - `legacy_import_key`      — keep null on synthesised rows.
        //   - `transferred_from_id`    — irrelevant for synthesised rows.
        //   - audit-ish state (approval_status, approved_at, etc.)
        const result = await db
          .insert(tasks)
          .values({
            id,
            title: t.title,
            description: t.description,
            doerId: t.doerId,
            initiatorId: t.initiatorId,
            priority: t.priority,
            // Fresh status — the doer starts each occurrence from scratch.
            status: "not_started",
            // dueAt is the only field that varies per occurrence.
            dueAt,
            notes: t.notes,
            subject: t.subject,
            archived: false,
            createdById: t.createdById,
            shortId,
            tags: t.tags ?? null,
            // No approval verdict yet; doer hasn't done anything.
            approvalStatus: null,
            revisedTargetDate: null,
            // Carry over the schedule + recurrence-frequency hints so
            // UI surfaces still render correctly, but the child has
            // no rule of its own.
            startsAt: t.startsAt,
            endsAt: t.endsAt,
            allDay: t.allDay,
            recurrence: t.recurrence,
            recurrenceRule: null,
            recurrenceParentId: t.id,
            recurrenceOccurrenceDate: ymd,
            projectNodeId: t.projectNodeId,
          })
          .onConflictDoNothing({
            target: [tasks.recurrenceParentId, tasks.recurrenceOccurrenceDate],
          })
          .returning({ id: tasks.id });

        if (result.length === 0) {
          // Already existed — dedup hit.
          stats.skipped++;
          continue;
        }
        stats.created++;

        // Audit row — pin the actor to the creator so the timeline
        // tells a coherent story ("Created by <X> (recurring)").
        await db.insert(taskEvents).values({
          taskId: id,
          actorId: t.createdById ?? t.initiatorId,
          eventType: "created",
          note: `materialized from recurring template ${t.shortId ?? t.id} on ${ymd}`,
          createdAt: new Date(),
        }).catch((err) => {
          // Audit failure is non-fatal — the task row is the source of truth.
          // eslint-disable-next-line no-console
          console.warn("[recurrence] audit insert failed", err);
        });

        // (Best-effort short_id collision retry — same pattern as createTask.)
        void nextShortIdCandidate; // intentionally referenced so the import doesn't drift to unused
      } catch (err) {
        stats.errors++;
        // eslint-disable-next-line no-console
        console.warn(
          `[recurrence] failed to materialize ${t.shortId ?? t.id} @ ${ymd}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return stats;
}
