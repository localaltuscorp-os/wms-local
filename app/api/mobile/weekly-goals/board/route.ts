import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import {
  effectivePct,
  weeklyScore,
  weightTotal,
  WEIGHT_BUDGET,
} from "@/lib/weekly-goals/effective";
import {
  currentWeekStart,
  mondayOf,
  nextWeekStart,
  prevWeekStart,
  formatWeekLabel,
  weekEnd,
} from "@/lib/weekly-goals/week";
import { formatInr } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Friendly incentive-type labels (mirror of the web GoalCard chip). */
const INCENTIVE_TYPE_LABEL: Record<string, string> = {
  adhoc: "Ad-hoc incentive",
  onetime: "One-time incentive",
  routine: "Routine incentive",
};

function incentiveLabel(
  incentive: boolean,
  type: string | null,
  amount: number,
): string | null {
  if (!incentive) return null;
  const base = (type && INCENTIVE_TYPE_LABEL[type]) || "Incentive";
  return amount > 0 ? `${base} · ${formatInr(amount)}` : base;
}

/**
 * GET /api/mobile/weekly-goals/board[?week=YYYY-MM-DD] — the SIGNED-IN user's own
 * weekly-goals board for one Monday→Sunday week. Owner-scoped (self only), a
 * read-only mirror of the web `/weekly-goals` page's per-person card list: each
 * goal carries its client/subject, target, weight, status and effective %Done
 * (manager-accepted `acceptPct` when reviewed, else the doer's `pctDone`).
 *
 * The per-week header carries the weight-aware weekly score and the live weight
 * budget (must land on WEIGHT_BUDGET), plus prev/this/next week keys for the
 * pager. Archived goals are hidden (they never contribute to the active board or
 * the score), matching what a doer sees on the web board.
 *
 * Additive — reuses the web's shared query helpers (week math + effective-% +
 * status display map) so the two surfaces never diverge; never touches existing
 * web routes.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: MOBILE_CORS },
    );
  }
  const me = auth.employee;

  const thisWeek = currentWeekStart();
  const url = new URL(req.url);
  const qWeek = url.searchParams.get("week");
  const weekStart =
    qWeek && /^\d{4}-\d{2}-\d{2}$/.test(qWeek) ? mondayOf(qWeek) : thisWeek;

  // A goal belongs to the viewed week if its planning-home `weekStart` IS that
  // week OR its `targetDate` lands inside that week's Monday→Sunday window
  // (mirrors the web board's `weekCond`). Owner-scoped to the signed-in user.
  const weekCond = or(
    eq(weeklyGoals.weekStart, weekStart),
    and(
      gte(weeklyGoals.targetDate, weekStart),
      lte(weeklyGoals.targetDate, weekEnd(weekStart)),
    ),
  );

  const [rows, statusDisplay] = await Promise.all([
    db
      .select({
        id: weeklyGoals.id,
        position: weeklyGoals.position,
        client: weeklyGoals.client,
        subject: weeklyGoals.subject,
        priority: weeklyGoals.priority,
        targetDone: weeklyGoals.targetDone,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        weight: weeklyGoals.weight,
        weekStart: weeklyGoals.weekStart,
        targetDate: weeklyGoals.targetDate,
        notes: weeklyGoals.notes,
        status: weeklyGoals.status,
        incentive: weeklyGoals.incentive,
        incentiveAmount: weeklyGoals.incentiveAmount,
        incentiveType: weeklyGoals.incentiveType,
        carriedFromId: weeklyGoals.carriedFromId,
        archived: weeklyGoals.archived,
      })
      .from(weeklyGoals)
      .where(and(weekCond, eq(weeklyGoals.employeeId, me.id)))
      .orderBy(asc(weeklyGoals.position)),
    getStatusDisplayMap(),
  ]);

  // The active board hides archived goals; they also never feed the score/budget.
  const active = rows.filter((r) => !r.archived);
  // The weight budget is measured over this week's PLANNING-HOME goals only
  // (mirrors the web single-person budget bar), so a goal merely due this week
  // doesn't distort the 100-point budget.
  const budgetGoals = active.filter((r) => r.weekStart === weekStart);

  const goals = active.map((r) => {
    const eff = effectivePct({ acceptPct: r.acceptPct, pctDone: r.pctDone });
    const title =
      r.targetDone?.trim() ||
      [r.client, r.subject].filter(Boolean).join(" · ") ||
      "Untitled goal";
    return {
      id: r.id,
      position: r.position,
      title,
      client: r.client,
      subject: r.subject,
      targetDone: r.targetDone,
      priority: r.priority,
      status: r.status,
      weight: r.weight,
      // `date` columns come back as `YYYY-MM-DD` strings — pass through as-is
      // (no Date coercion needed; the client renders the plain key).
      targetDate: r.targetDate,
      pctDone: r.pctDone,
      acceptPct: r.acceptPct,
      effectivePct: eff,
      reviewed: r.acceptPct != null,
      complete: eff >= 100,
      notes: r.notes,
      incentive: r.incentive,
      incentiveLabel: incentiveLabel(r.incentive, r.incentiveType, r.incentiveAmount),
      carried: r.carriedFromId != null,
    };
  });

  return NextResponse.json(
    {
      weekStart,
      weekLabel: formatWeekLabel(weekStart),
      isCurrentWeek: weekStart === thisWeek,
      prevWeek: prevWeekStart(weekStart),
      nextWeek: nextWeekStart(weekStart),
      thisWeek,
      ownerName: me.name,
      weeklyScore: weeklyScore(active),
      weightTotal: weightTotal(budgetGoals),
      weightBudget: WEIGHT_BUDGET,
      statusDisplay,
      goals,
    },
    { headers: MOBILE_CORS },
  );
}
