import { redirect } from "next/navigation";
import type { Route } from "next";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import {
  PageCommandBar,
  COMMAND_PAGE_CLASS,
} from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { tasks, employees, goals, dailyChecklist } from "@/db/schema";
import { isManagerWithReports } from "@/lib/manager-gates";
import { RecycleBinList } from "@/components/goals/recycle-bin-list";
import { restoreCommitment, purgeCommitment } from "./actions";
import { formatDate } from "@/lib/format";
import { RecycleBinGoals, type BinGoal } from "@/components/goals/recycle-bin-goals";
import { goalCode, periodKeyLabel } from "@/components/goals/cascade/util";
import { goalsSpace } from "@/lib/goals/space";
import type { GoalPeriod } from "@/lib/goals/types";

export const dynamic = "force-dynamic";

/**
 * Recycle Bin — where "abandoned" tasks land (Sir). A MANAGER reviews their
 * team's abandoned tasks and either restores one to the daily loop or permanently
 * deletes it. Admins see everyone; managers see their active direct reports.
 */
export default async function RecycleBinPage() {
  const me = await requireUser();
  const isManager = me.isAdmin || (await isManagerWithReports(me.id));
  if (!isManager) redirect("/my-day" as Route);

  const doer = alias(employees, "doer");
  const abandonedBy = alias(employees, "abandoned_by");

  let scopeIds: string[] | null = null;
  if (!me.isAdmin) {
    const reports = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)));
    scopeIds = [me.id, ...reports.map((r) => r.id)];
  }

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      abandonedAt: tasks.abandonedAt,
      doerName: doer.name,
      abandonedByName: abandonedBy.name,
    })
    .from(tasks)
    .leftJoin(doer, eq(doer.id, tasks.doerId))
    .leftJoin(abandonedBy, eq(abandonedBy.id, tasks.abandonedById))
    .where(
      scopeIds
        ? and(isNotNull(tasks.abandonedAt), inArray(tasks.doerId, scopeIds))
        : isNotNull(tasks.abandonedAt),
    )
    .orderBy(desc(tasks.abandonedAt))
    .limit(300);

  const items = rows.map((r) => ({
    id: r.id,
    taskNo: r.taskNo,
    title: r.title,
    client: r.client,
    doerName: r.doerName,
    abandonedByName: r.abandonedByName,
    abandonedAt: r.abandonedAt ? r.abandonedAt.toISOString() : null,
  }));

  // ── Archived (deleted) GOALS — the goals recycle bin, in the active space ──
  const space = await goalsSpace(me.isAdmin);
  const goalOwner = alias(employees, "goal_owner");
  const goalRows = await db
    .select({
      id: goals.id,
      title: goals.title,
      area: goals.area,
      period: goals.period,
      periodKey: goals.periodKey,
      position: goals.position,
      updatedAt: goals.updatedAt,
      ownerName: goalOwner.name,
    })
    .from(goals)
    .leftJoin(goalOwner, eq(goalOwner.id, goals.employeeId))
    .where(
      scopeIds
        ? and(eq(goals.archived, true), eq(goals.scope, space), inArray(goals.employeeId, scopeIds))
        : and(eq(goals.archived, true), eq(goals.scope, space)),
    )
    .orderBy(desc(goals.updatedAt))
    .limit(300);

  const binGoals: BinGoal[] = goalRows.map((g) => ({
    id: g.id,
    title: g.title,
    area: g.area,
    code: goalCode({ period: g.period as GoalPeriod, periodKey: g.periodKey, position: g.position, id: g.id }),
    periodLabel: periodKeyLabel(g.periodKey),
    ownerName: g.ownerName ?? "—",
    deletedAt: g.updatedAt ? g.updatedAt.toISOString() : null,
  }));

  // ── Cancelled COMMITMENTS — the daily_checklist half of the bin (0186) ──
  const cmtOwner = alias(employees, "cmt_owner");
  const cmtBinner = alias(employees, "cmt_binner");
  const cmtRows = await db
    .select({
      id: dailyChecklist.id,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      planDate: dailyChecklist.planDate,
      abandonedAt: dailyChecklist.abandonedAt,
      ownerName: cmtOwner.name,
      binnedByName: cmtBinner.name,
    })
    .from(dailyChecklist)
    .leftJoin(cmtOwner, eq(cmtOwner.id, dailyChecklist.employeeId))
    .leftJoin(cmtBinner, eq(cmtBinner.id, dailyChecklist.abandonedById))
    .where(
      scopeIds
        ? and(isNotNull(dailyChecklist.abandonedAt), inArray(dailyChecklist.employeeId, scopeIds))
        : isNotNull(dailyChecklist.abandonedAt),
    )
    .orderBy(desc(dailyChecklist.abandonedAt))
    .limit(300);

  const binCommitments = cmtRows.map((r) => ({
    id: r.id,
    taskNo: null,
    title: r.title,
    client: r.client ?? (r.planDate ? `Planned for ${formatDate(r.planDate)}` : null),
    doerName: r.ownerName ?? null,
    abandonedByName: r.binnedByName ?? null,
    abandonedAt: r.abandonedAt ? r.abandonedAt.toISOString() : null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className={COMMAND_PAGE_CLASS}>
        <PageCommandBar
          title="Recycle Bin"
          hint="Deleted goals and abandoned tasks — restore, or delete for good."
        />

        {/* Deleted GOALS — restore or permanently delete (select-all + confirm). */}
        <RecycleBinGoals items={binGoals} />

        {/* Abandoned daily-loop TASKS (existing). */}
        <section className="mt-7">
          <h2 className="mb-2.5 text-[12px] font-black uppercase tracking-[0.08em] text-ink-muted">
            Abandoned tasks
          </h2>
          <RecycleBinList items={items} />
        </section>

        {/* Cancelled DAILY COMMITMENTS — the card's × on a row with no WMS task
            behind it. Soft-deleted (0186) rather than erased, so they can come
            back to the day they were planned on. */}
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-black uppercase tracking-[0.08em] text-ink-muted">
            Cancelled commitments
          </h2>
          <RecycleBinList
            items={binCommitments}
            restore={restoreCommitment}
            purge={purgeCommitment}
            restoredMessage="Restored to its day."
          />
        </section>
      </PageShell>
    </>
  );
}
