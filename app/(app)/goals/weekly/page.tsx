import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { db } from "@/lib/db";
import { weeklyGoals, goals, employees } from "@/db/schema";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import {
  currentWeekStart,
  mondayOf,
  weekEnd,
  formatWeekLabel,
} from "@/lib/weekly-goals/week";
import { weekNoOf } from "@/lib/goals/fy-calendar";
import { monthKey, fyStartYearOf } from "@/lib/goals/types";
import { listGoalLookups } from "@/lib/goals/lookups";
import { loadCommitData } from "@/components/goals/commit/data";
import { WeeklyCascadeBoard } from "@/components/goals/weekly/weekly-cascade-board";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import type {
  CascadeWeeklyGoal,
  RosterMember,
  MonthGoalOption,
} from "@/components/goals/weekly/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const parentGoal = alias(goals, "parent_month_goal");

/**
 * The Goals-workspace Weekly board — a cascade-aware SURFACE over the existing
 * `weekly_goals` engine (design §6, §11-C). It shows what the legacy board can't:
 * the monthly-goal linkage (`month_goal_id`), the adopt/cross-out toggle, and the
 * cascade fields (area / uom / target+actual qty & amount / team involved /
 * dependency % / evidence). Weeks are labelled W1..W52 (FY calendar). Team
 * Involved resolves LIVE against active employees (departed members auto-drop).
 *
 * It never edits the legacy `/weekly-goals` files — reads the same table and the
 * mature week/hierarchy helpers, and mutates only the additive columns via its
 * own `actions.ts`.
 */
export default async function GoalsWeeklyPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { me, isAdmin } = await requireGoalsAccess();

  // PERSONAL space (admins) → the private week board (goals table, scope=personal).
  // Professional keeps the cascade-aware weekly_goals surface below.
  if ((await goalsSpace(isAdmin)) === "personal") {
    const data = await loadPersonalWD("week", {
      wk: pick(sp.wk),
      day: pick(sp.day),
      emp: pick(sp.emp),
    });
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <PersonalWDBoard data={data} />
      </>
    );
  }

  const thisWeek = currentWeekStart();
  const weekStart = mondayOf(pick(sp.week) ?? thisWeek);

  // Org-chart scope (same model as weekly goals): admins → everyone; managers →
  // self + full downline; everyone else → self only.
  const scope = isAdmin ? { all: true, ids: [] } : await goalScopeFor(me);
  const isManager = !scope.all && scope.ids.length > 1;
  const canPickPerson = isAdmin || isManager;

  // Which person's board are we viewing? Default self; admins/managers may drill
  // into someone they own (validated against scope).
  const empParam = pick(sp.emp);
  let scopeEmp = me.id;
  if (isAdmin && empParam) scopeEmp = empParam;
  else if (isManager && empParam && scope.ids.includes(empParam)) scopeEmp = empParam;

  // The month this week's Monday belongs to (for the "link to monthly goal" picker).
  const thisMonthKey = monthKey(weekStart);

  const [rawRows, monthGoalRows, dayGoalRows] = await Promise.all([
    db
      .select({
        id: weeklyGoals.id,
        employeeId: weeklyGoals.employeeId,
        employeeName: employees.name,
        weekStart: weeklyGoals.weekStart,
        position: weeklyGoals.position,
        subject: weeklyGoals.subject,
        targetDone: weeklyGoals.targetDone,
        area: weeklyGoals.area,
        uom: weeklyGoals.uom,
        targetQty: weeklyGoals.targetQty,
        targetAmount: weeklyGoals.targetAmount,
        actualQty: weeklyGoals.actualQty,
        actualAmount: weeklyGoals.actualAmount,
        teamInvolved: weeklyGoals.teamInvolved,
        teamDependencyPct: weeklyGoals.teamDependencyPct,
        goalType: weeklyGoals.goalType,
        status: weeklyGoals.status,
        reviewedById: weeklyGoals.reviewedById,
        shareWithTeam: weeklyGoals.shareWithTeam,
        delegatedTo: weeklyGoals.delegatedTo,
        evidenceUrl: weeklyGoals.evidenceUrl,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        weight: weeklyGoals.weight,
        adopted: weeklyGoals.adopted,
        committedAt: weeklyGoals.committedAt,
        approvedByManagerAt: weeklyGoals.approvedByManagerAt,
        carriedFromId: weeklyGoals.carriedFromId,
        monthGoalId: weeklyGoals.monthGoalId,
        monthGoalTitle: parentGoal.title,
        monthGoalPeriodKey: parentGoal.periodKey,
        targetDate: weeklyGoals.targetDate,
        createdById: weeklyGoals.createdById,
        createdAt: weeklyGoals.createdAt,
      })
      .from(weeklyGoals)
      .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
      .leftJoin(parentGoal, eq(weeklyGoals.monthGoalId, parentGoal.id))
      .where(
        and(
          eq(weeklyGoals.weekStart, weekStart),
          eq(weeklyGoals.archived, false),
          // A weekly goal reaches this person's board when they OWN it, when it's
          // shared with them as a team member (share_with_team + team_involved),
          // OR when it's delegated to them (delegated_to — accountability hand-off,
          // mig 0171). This mirrors the cascade board's getSharedGoals so a
          // delegated weekly goal actually shows on the delegate's list.
          or(
            eq(weeklyGoals.employeeId, scopeEmp),
            and(
              eq(weeklyGoals.shareWithTeam, true),
              sql`${weeklyGoals.teamInvolved} @> ${JSON.stringify([{ employeeId: scopeEmp }])}::jsonb`,
            ),
            sql`${weeklyGoals.delegatedTo} @> ${JSON.stringify([{ employeeId: scopeEmp }])}::jsonb`,
          ),
        ),
      )
      .orderBy(asc(weeklyGoals.position)),
    // Monthly cascade goals this person owns for the current month → linkable parents.
    db
      .select({ id: goals.id, title: goals.title, area: goals.area })
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, scopeEmp),
          eq(goals.period, "month"),
          eq(goals.periodKey, thisMonthKey),
          eq(goals.archived, false),
        ),
      )
      .orderBy(asc(goals.position)),
    // DAY goals whose date falls in this Mon–Sun week → the Week→Day kanban
    // lanes. ONE lean indexed select (employee + period + date range). Empty in
    // practice for most professional boards — the lanes render gracefully.
    db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, scopeEmp),
          eq(goals.scope, "professional"),
          eq(goals.period, "day"),
          eq(goals.archived, false),
          gte(goals.periodKey, weekStart),
          lte(goals.periodKey, weekEnd(weekStart)),
        ),
      )
      .orderBy(asc(goals.position)),
  ]);

  const dayGoals: GoalDTO[] = dayGoalRows
    .map((r) => toGoalDTO(r))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  // Resolve Team Involved live: collect every referenced employee id, fetch the
  // ACTIVE ones (departed / inactive are simply absent → the UI drops them but
  // the stored id is preserved on the row). Also build the add-member roster.
  const referencedIds = new Set<string>();
  for (const r of rawRows) {
    for (const m of r.teamInvolved ?? []) if (m.employeeId) referencedIds.add(m.employeeId);
  }

  // Add-member picker roster: active employees within the viewer's scope.
  const rosterWhere = scope.all
    ? eq(employees.isActive, true)
    : and(
        eq(employees.isActive, true),
        inArray(employees.id, Array.from(new Set([me.id, scopeEmp, ...scope.ids]))),
      );
  const rosterRows = await db
    .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
    .from(employees)
    .where(rosterWhere)
    .orderBy(asc(employees.name));

  // Ensure every referenced-but-out-of-roster id still gets an active/inactive
  // verdict so the card can decide to drop it.
  const rosterIds = new Set(rosterRows.map((r) => r.id));
  const missingRefs = Array.from(referencedIds).filter((id) => !rosterIds.has(id));
  const extraRows =
    missingRefs.length > 0
      ? await db
          .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
          .from(employees)
          .where(inArray(employees.id, missingRefs))
      : [];

  const roster: RosterMember[] = [...rosterRows, ...extraRows].map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
  }));

  const rows: CascadeWeeklyGoal[] = rawRows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    weekStart: String(r.weekStart),
    position: r.position,
    subject: r.subject,
    targetDone: r.targetDone,
    area: r.area,
    uom: r.uom,
    targetQty: r.targetQty,
    targetAmount: r.targetAmount,
    actualQty: r.actualQty,
    actualAmount: r.actualAmount,
    teamInvolved: r.teamInvolved ?? [],
    teamDependencyPct: r.teamDependencyPct,
    goalType: r.goalType ?? null,
    status: r.status ?? null,
    reviewedById: r.reviewedById ?? null,
    shareWithTeam: r.shareWithTeam ?? false,
    delegatedTo: r.delegatedTo ?? null,
    evidenceUrl: r.evidenceUrl,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    weight: r.weight,
    adopted: r.adopted,
    committed: r.committedAt != null,
    approvedByManager: r.approvedByManagerAt != null,
    carriedFromId: r.carriedFromId,
    monthGoalId: r.monthGoalId,
    monthGoalTitle: r.monthGoalTitle ?? null,
    targetDate: r.targetDate == null ? null : String(r.targetDate).slice(0, 10),
    createdById: r.createdById ?? null,
    createdAt: r.createdAt == null ? null : new Date(r.createdAt).toISOString(),
  }));

  const monthGoalOptions: MonthGoalOption[] = monthGoalRows.map((g) => ({
    id: g.id,
    title: g.title,
    area: g.area,
  }));

  // People picker (admins/managers) — scoped active employees.
  const people = canPickPerson
    ? roster
        .filter((r) => r.isActive)
        .map((r) => ({ id: r.id, name: r.name }))
    : [];

  // Managed Area / Measure / Type dropdowns for the inline table.
  const lookups = await listGoalLookups();
  const fyStart = fyStartYearOf(new Date(`${weekStart}T00:00:00Z`));

  // Self "freeze next week" ritual — surfaced as a popup button (self view only).
  const commitData = await loadCommitData({ id: me.id, isAdmin });
  const selfMember = commitData.members.find((m) => m.isSelf) ?? commitData.members[0];
  const commit =
    selfMember && scopeEmp === me.id
      ? { member: selfMember, nextWeekLabel: commitData.nextWeekLabel, weekStart: commitData.weekStart }
      : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <WeeklyCascadeBoard
        me={{ id: me.id, isAdmin }}
        weekStart={weekStart}
        weekNo={weekNoOf(weekStart)}
        weekLabel={formatWeekLabel(weekStart)}
        thisWeek={thisWeek}
        scopeEmp={scopeEmp}
        canPickPerson={canPickPerson}
        people={people}
        rows={rows}
        dayGoals={dayGoals}
        roster={roster}
        monthGoalOptions={monthGoalOptions}
        areaOptions={lookups.areas}
        measureOptions={lookups.measures}
        typeOptions={lookups.types}
        customLookups={lookups.custom}
        fyStartYear={fyStart}
        commit={commit}
      />
    </>
  );
}
