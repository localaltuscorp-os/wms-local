import "server-only";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, goals, weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsSpace } from "@/lib/goals/space";
import { fyStartYearOf, quartersOfFy, monthKeysOfFy, type Goal } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO, type RosterMember } from "@/components/goals/cascade/util";
import { resolveGoalsView } from "../cascade/view";

/**
 * Data for the GOALS DASHBOARD — the module-wide overview.
 *
 * WHY ITS OWN QUERIES rather than `loadBoardData`, which the level boards use:
 * that loader is built around ONE viewed person (`getYearBoard(employeeId, …)`),
 * and this page has an employee MULTISELECT. Calling it once per selected
 * person would be N round trips that grow with the team; these are three
 * `inArray` selects whose cost barely moves whether you pick one person or
 * twenty.
 *
 * Everything else is deliberately identical to the board loader — the same FY
 * key set, the same `archived = false`, the same space scoping — so a goal that
 * appears on a level board appears here and vice versa.
 */

export interface DailyDay {
  /** `yyyy-mm-dd`, IST — the plan date as stored. */
  ymd: string;
  /** Commitments made for that day (cancelled ones excluded). */
  planned: number;
  /** How many closed out done. */
  done: number;
}

export interface GoalsDashboardData {
  /** Y/Q/M cascade goals for every selected person, flat. */
  goals: GoalDTO[];
  /** Their weekly rows, mapped to `period: "week"` DTOs. */
  weekCards: GoalDTO[];
  /** One bucket per day across the selected range, gaps included. */
  daily: DailyDay[];
  fyStartYear: number;
  myEmployeeId: string;
  /** The single "Viewing" person — the cascade the page is centred on. */
  viewedEmployeeId: string;
  viewedName: string;
  /** Everyone the viewer is allowed to see. The multiselect's universe. */
  roster: RosterMember[];
  /** WHO the page is actually reporting on, after the multiselect. Never empty:
   *  no selection means the VIEWER, which is the default. */
  selectedEmployeeIds: string[];
  /** How that scope was arrived at, so the filter row can tell "just me,
   *  because nobody chose" from "just me, chosen deliberately".
   *    self     — nothing in the URL
   *    all      — `?emps=all`
   *    specific — `?emps=<ids>` */
  empsMode: "self" | "all" | "specific";
  /** The applied window, `yyyy-mm-dd`. Defaults to the financial year. */
  range: { from: string; to: string };
  /** Today in IST — the pace clock and the right edge of the daily strip. */
  todayYmd: string;
}

/** `yyyy-mm-dd` `n` days from `from`, walked over UTC midnights so the string
 *  arithmetic can't trip over a DST-style hour shift. */
export function shiftYmd(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function loadGoalsDashboardData(
  sp: { emp?: string; emps?: string; fy?: string; from?: string; to?: string },
  todayYmd: string,
): Promise<GoalsDashboardData> {
  const { me, isAdmin } = await requireGoalsAccess();
  const view = await resolveGoalsView(me, isAdmin, sp.emp);
  const fy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : fyStartYearOf(new Date());
  const space = await goalsSpace(isAdmin);

  /* THE MULTISELECT IS RE-VALIDATED HERE, not trusted.
     `?emps=` is a URL parameter, so it is whatever the caller typed. The roster
     resolveGoalsView returns IS the permission boundary — self plus downline,
     or everyone for an admin — so intersecting against it is what stops a
     hand-edited URL from loading a stranger's goals. */
  const allowed = new Set(view.roster.map((r) => r.id));
  const raw = (sp.emps ?? "").trim();
  const requested = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && allowed.has(x));

  /* THE DASHBOARD OPENS ON YOU — the same rule the WMS dashboard now follows,
     and the reason the separate "Viewing" control is gone: the multiselect is
     the only thing that decides scope, and it starts on the person reading it.

     `?emps=all` widens to the whole visible roster. "Everyone" is the roster,
     which is already the permission boundary — self for a plain member, self
     plus downline for a manager, all active staff for an admin — so the widest
     this can go is exactly what the viewer is allowed to see.

     (This reverses the earlier "empty means everyone" default. An org-wide
     first read turned out to be the wrong opening question for a page you
     mostly visit to see where YOU stand.) */
  const empsMode: GoalsDashboardData["empsMode"] =
    raw === "all" ? "all" : requested.length > 0 ? "specific" : "self";
  const selectedEmployeeIds =
    empsMode === "all"
      ? view.roster.map((r) => r.id)
      : empsMode === "specific"
        ? requested
        : [view.viewedEmployeeId];

  // The FY is the natural default window for a goals page: it is the span the
  // cascade is authored in. A narrower range filters within it.
  const fyStart = `${fy}-04-01`;
  const fyEnd = `${fy + 1}-03-31`;
  const from = sp.from && YMD.test(sp.from) ? sp.from : fyStart;
  const to = sp.to && YMD.test(sp.to) ? sp.to : fyEnd;
  const range = from <= to ? { from, to } : { from: to, to: from };

  const periodKeys = [String(fy), ...quartersOfFy(fy), ...monthKeysOfFy(fy)];

  const [goalRows, weeklyRows, dailyRows] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(
        and(
          inArray(goals.employeeId, selectedEmployeeIds),
          eq(goals.archived, false),
          eq(goals.scope, space),
          // Y/Q/M match on the canonical key. The PERSONAL space also parks
          // week/day rows in this table keyed by date, so those come in by
          // range — mirroring getYearBoard, which is what keeps the two
          // surfaces showing the same set. A no-op in the professional space.
          or(
            inArray(goals.periodKey, periodKeys),
            and(
              inArray(goals.period, ["week", "day"]),
              gte(goals.periodKey, fyStart),
              lte(goals.periodKey, fyEnd),
            ),
          ),
        ),
      ),
    db
      .select()
      .from(weeklyGoals)
      .where(
        and(
          inArray(weeklyGoals.employeeId, selectedEmployeeIds),
          eq(weeklyGoals.archived, false),
          gte(weeklyGoals.weekStart, fyStart),
          lte(weeklyGoals.weekStart, fyEnd),
        ),
      ),
    /* AGGREGATED IN SQL, not in JS. A full-FY range across a whole team is
       tens of thousands of checklist rows, and the page only ever draws one
       bar per day — shipping the rows to count them here would be the largest
       payload on the page by an order of magnitude, to render a number
       Postgres can return directly.

       EXPLICIT COLUMNS for the same reason the rest of the app uses them on
       this table: `cascade_goal_id` may not exist in production yet (see its
       note in db/schema.ts), and a bare select would ask for it. */
    db
      .select({
        planDate: dailyChecklist.planDate,
        planned: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${dailyChecklist.done})::int`,
      })
      .from(dailyChecklist)
      .where(
        and(
          inArray(dailyChecklist.employeeId, selectedEmployeeIds),
          // Cancelled commitments are soft-deleted, not removed. Counting them
          // would make a day someone tidied up look like a day they failed.
          isNull(dailyChecklist.abandonedAt),
          gte(dailyChecklist.planDate, range.from),
          lte(dailyChecklist.planDate, range.to),
        ),
      )
      .groupBy(dailyChecklist.planDate),
  ]);

  const nameById = new Map(view.roster.map((r) => [r.id, r.name] as const));
  const nameOf = (id: string | null | undefined): string | null =>
    id ? nameById.get(id) ?? null : null;

  const goalDTOs: GoalDTO[] = (goalRows as Goal[]).map((r) =>
    toGoalDTO({ ...r, createdByName: nameOf(r.createdById) }),
  );

  const weekCards: GoalDTO[] = weeklyRows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    createdById: r.createdById ?? null,
    createdAt: r.createdAt == null ? null : new Date(r.createdAt).toISOString(),
    createdByName: nameOf(r.createdById),
    period: "week" as const,
    periodKey: String(r.weekStart),
    parentGoalId: r.monthGoalId ?? null,
    position: r.position,
    area: r.area,
    // Mirrors the weekly board's own title rule (target_done → subject → fallback).
    title: (r.targetDone ?? "").trim() || (r.subject ?? "").trim() || "Untitled",
    uom: r.uom,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    targetAmount: r.targetAmount,
    actualAmount: r.actualAmount,
    notes: null,
    teamInvolved: r.teamInvolved ?? null,
    teamDependencyPct: r.teamDependencyPct,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: null,
    evidenceUrl: r.evidenceUrl,
    weight: r.weight,
    adopted: r.adopted,
    source: "manual",
    category: "goal",
    clonedFromId: r.carriedFromId ?? null,
    incentiveEnabled: false,
    incentiveAmount: null,
    incentiveKind: null,
    monthlyMasterRef: null,
    shareWithTeam: false,
    targetDate: r.targetDate == null ? null : String(r.targetDate).slice(0, 10),
    status: null,
    reviewedById: null,
  }));

  /* Every day in the window gets a bucket, including days with nothing on
     them — a gap in the strip IS the finding, and dropping empty days would
     quietly close it up and make the record look continuous.

     Capped so a full-FY range cannot ask the browser to lay out 365 bars: the
     strip shows the tail of the range, and the component says so. The KPIs
     beside it are computed from the same buckets, so they agree with what is
     drawn rather than reporting a wider set than the picture. */
  const byDay = new Map<string, DailyDay>(
    dailyRows.map((r) => [r.planDate, { ymd: r.planDate, planned: r.planned, done: r.done }]),
  );
  const stripEnd = range.to < todayYmd ? range.to : todayYmd;
  const stripStart = shiftYmd(stripEnd, -(DAILY_STRIP_DAYS - 1));
  const dailyFrom = stripStart > range.from ? stripStart : range.from;
  const daily: DailyDay[] = [];
  for (let ymd = dailyFrom; ymd <= stripEnd; ymd = shiftYmd(ymd, 1)) {
    daily.push(byDay.get(ymd) ?? { ymd, planned: 0, done: 0 });
  }

  return {
    goals: goalDTOs,
    weekCards,
    daily,
    fyStartYear: fy,
    myEmployeeId: me.id,
    empsMode,
    viewedEmployeeId: view.viewedEmployeeId,
    viewedName: view.viewedName,
    roster: view.roster,
    selectedEmployeeIds,
    range,
    todayYmd,
  };
}

/** How many days of commitments the strip draws. Long enough to show a habit
 *  forming or breaking, short enough to stay one readable row of bars. */
export const DAILY_STRIP_DAYS = 21;
