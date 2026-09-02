import "server-only";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals, dailyChecklist } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { withRetry } from "@/lib/db/with-timeout";
import { getYearBoard } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, periodKeyLabel, num, type RosterMember } from "@/components/goals/cascade/util";
import { listGoalLookups } from "@/lib/goals/lookups";
import { formatDate } from "@/lib/format";
import { weekNoOf } from "@/lib/goals/fy-calendar";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import { resolveGoalsView } from "../cascade/view";

/**
 * Unified data-load for the Review & Scores workbench. ONE per-level review
 * surface over ALL five planning levels — Daily / Weekly / Monthly / Quarterly /
 * Yearly — for the viewed person in a financial year, person-scoped (?emp=) and
 * FY-scoped (?fy=). Each level's rows come from its own table but are mapped to
 * ONE `ReviewItem` shape so the workbench renders + reviews them identically:
 *   · year/quarter/month → `goals` (self%, approved%, approver notes)
 *   · weekly             → `weekly_goals` (self%, approved%, approver notes)
 *   · daily              → `daily_checklist` (self-completion + note; the day
 *     plan has no manager-approve tier, so `approvable` is false there).
 */

export type ReviewLevel = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** The one shape every review card renders — whatever table it came from. */
export interface ReviewItem {
  /** Which table/action set governs this row. */
  kind: "goal" | "weekly" | "daily";
  level: ReviewLevel;
  id: string;
  title: string;
  area: string | null;
  /** Goal category / type (goal-kind only; null for weekly + daily). Reviewers
   *  with approve rights can change it inline. */
  category: string | null;
  /** Short human code (e.g. "JuQ2", "W28", "22 Jul"). */
  code: string | null;
  /** Human period label ("Jul 2026", "Week of 21 Jul", "22 Jul 2026"). */
  periodLabel: string;
  /** Owner self-rating 0..100. */
  pctDone: number;
  /** Approver-accepted % (null = not yet reviewed; always null for daily). */
  acceptPct: number | null;
  reviewNotes: string | null;
  targetQty: number | null;
  actualQty: number | null;
  targetAmount: number | null;
  actualAmount: number | null;
  team: Array<{ employeeId?: string; name?: string }> | null;
  /** Whether a manager/management approve-tier applies (false for daily). */
  approvable: boolean;
  /** Daily only — the completion checkbox state. */
  done?: boolean;
}

export interface ReviewData {
  levels: Record<ReviewLevel, ReviewItem[]>;
  counts: Record<ReviewLevel, number>;
  fyStartYear: number;
  myEmployeeId: string;
  viewedEmployeeId: string;
  viewedName: string;
  roster: RosterMember[];
  /** Managed Type/category options for the reviewer's inline dropdown. */
  typeOptions: string[];
  customTypes: string[];
  /** Self may set %Done on their own rows. */
  canWrite: boolean;
  /** Manager/management may set Approved% + notes. */
  canReview: boolean;
}

/** Flatten a goal tree to every node. */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

const LEVEL_OF_PERIOD: Record<string, ReviewLevel> = {
  year: "yearly",
  quarter: "quarterly",
  month: "monthly",
};

/** A short day label: "22 Jul". */
function dayLabel(ymd: string): string {
  return formatDate(ymd);
}

export async function loadReviewData(sp: { emp?: string; fy?: string }): Promise<ReviewData> {
  const { me, isAdmin } = await requireGoalsAccess();
  const view = await resolveGoalsView(me, isAdmin, sp.emp);
  const fy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : fyStartYearOf(new Date());
  const empId = view.viewedEmployeeId;
  const fyStart = `${fy}-04-01`;
  const fyEnd = `${fy + 1}-03-31`;

  // Each read is retried on a FRESH connection — the review page has no cache
  // to fall back on, and the first query of a request is the one most likely to
  // grab a stale pooled connection (the recurring CONNECT_TIMEOUT signature).
  const r = <T,>(label: string, make: () => Promise<T>): Promise<T> =>
    withRetry(make, { attempts: 2, timeoutMs: [6000, 9000], label });

  const [board, wrows, drows] = await Promise.all([
    r("review:board", () => getYearBoard(empId, fy)),
    r("review:weekly", () =>
    db
      .select({
        id: weeklyGoals.id,
        weekStart: weeklyGoals.weekStart,
        targetDone: weeklyGoals.targetDone,
        subject: weeklyGoals.subject,
        area: weeklyGoals.area,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        reviewNotes: weeklyGoals.reviewNotes,
        targetQty: weeklyGoals.targetQty,
        actualQty: weeklyGoals.actualQty,
        targetAmount: weeklyGoals.targetAmount,
        actualAmount: weeklyGoals.actualAmount,
        teamInvolved: weeklyGoals.teamInvolved,
        position: weeklyGoals.position,
      })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, empId),
          eq(weeklyGoals.archived, false),
          gte(weeklyGoals.weekStart, fyStart),
          lte(weeklyGoals.weekStart, fyEnd),
        ),
      )
      .orderBy(desc(weeklyGoals.weekStart), weeklyGoals.position),
    ),
    r("review:daily", () =>
    db
      .select({
        id: dailyChecklist.id,
        planDate: dailyChecklist.planDate,
        title: dailyChecklist.title,
        subject: dailyChecklist.subject,
        done: dailyChecklist.done,
        donePct: dailyChecklist.donePct,
        doneNote: dailyChecklist.doneNote,
        position: dailyChecklist.position,
      })
      .from(dailyChecklist)
      .where(
        and(
          eq(dailyChecklist.employeeId, empId),
          gte(dailyChecklist.planDate, fyStart),
          lte(dailyChecklist.planDate, fyEnd),
        ),
      )
      .orderBy(desc(dailyChecklist.planDate), dailyChecklist.position),
    ),
  ]);

  const levels: Record<ReviewLevel, ReviewItem[]> = {
    daily: [],
    weekly: [],
    monthly: [],
    quarterly: [],
    yearly: [],
  };

  // ── Year / Quarter / Month — the goals table ──
  for (const node of [...collect(board.years), ...collect(board.standalone)]) {
    const g = toGoalDTO(node);
    const level = LEVEL_OF_PERIOD[g.period];
    if (!level) continue;
    levels[level].push({
      kind: "goal",
      level,
      id: g.id,
      title: g.title,
      area: g.area,
      category: g.category,
      code: g.periodKey,
      periodLabel: periodKeyLabel(g.periodKey),
      pctDone: g.pctDone,
      acceptPct: g.acceptPct,
      reviewNotes: g.reviewNotes,
      targetQty: num(g.targetQty),
      actualQty: num(g.actualQty),
      targetAmount: num(g.targetAmount),
      actualAmount: num(g.actualAmount),
      team: g.teamInvolved ?? null,
      approvable: true,
    });
  }

  // ── Weekly — the weekly_goals table ──
  for (const w of wrows) {
    levels.weekly.push({
      kind: "weekly",
      level: "weekly",
      id: w.id,
      title: (w.targetDone?.trim() || w.subject?.trim() || "Weekly goal") as string,
      area: w.area,
      category: null,
      code: `W${weekNoOf(w.weekStart)}`,
      periodLabel: `Week of ${formatWeekShort(w.weekStart)}`,
      pctDone: w.pctDone,
      acceptPct: w.acceptPct,
      reviewNotes: w.reviewNotes,
      targetQty: num(w.targetQty),
      actualQty: num(w.actualQty),
      targetAmount: num(w.targetAmount),
      actualAmount: num(w.actualAmount),
      team: w.teamInvolved ?? null,
      approvable: true,
    });
  }

  // ── Daily — the day-plan checklist (self-completion, no approve tier) ──
  for (const d of drows) {
    const pct = d.donePct ?? (d.done ? 100 : 0);
    levels.daily.push({
      kind: "daily",
      level: "daily",
      id: d.id,
      title: d.title,
      area: d.subject,
      category: null,
      code: dayLabel(d.planDate),
      periodLabel: dayLabel(d.planDate),
      pctDone: pct,
      acceptPct: null,
      reviewNotes: d.doneNote,
      targetQty: null,
      actualQty: null,
      targetAmount: null,
      actualAmount: null,
      team: null,
      approvable: false,
      done: d.done,
    });
  }

  const counts = Object.fromEntries(
    (Object.keys(levels) as ReviewLevel[]).map((k) => [k, levels[k].length]),
  ) as Record<ReviewLevel, number>;

  const lookups = await listGoalLookups();

  return {
    levels,
    counts,
    fyStartYear: fy,
    myEmployeeId: me.id,
    viewedEmployeeId: empId,
    viewedName: view.viewedName,
    roster: view.roster,
    typeOptions: lookups.types,
    customTypes: lookups.custom.types,
    canWrite: view.canWrite,
    canReview: view.canReview,
  };
}
