import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import {
  currentWeekStart,
  nextWeekStart,
  formatWeekLabel,
  TZ,
} from "@/lib/weekly-goals/week";
import { weeklyGoalTitle } from "@/lib/weekly-goals/as-task-row";
import type { CommitData, CommitGoalRow, CommitMember } from "./types";

/** True on Saturday IST — when the commit surface + its punch-out gate go live. */
export function isSaturdayIST(now: Date = new Date()): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now) ===
    "Sat"
  );
}

type GoalSelect = {
  id: string;
  employeeId: string;
  weekStart: string;
  position: number;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  area: string | null;
  uom: string | null;
  pctDone: number;
  pctUpdatedAt: Date | null;
  acceptPct: number | null;
  adopted: boolean;
  committedAt: Date | null;
};

function toRow(g: GoalSelect): CommitGoalRow {
  return {
    id: g.id,
    position: g.position,
    title: weeklyGoalTitle(g),
    client: g.client,
    subject: g.subject,
    area: g.area,
    uom: g.uom,
    pctDone: g.pctDone,
    acceptPct: g.acceptPct,
    filled: g.pctUpdatedAt != null,
    adopted: g.adopted,
    committed: g.committedAt != null,
  };
}

/**
 * Assemble the Saturday commit surface for the signed-in user: their own row
 * plus (when they manage people) every active downline member. For each person
 * we load this week's goals (fill progress) and next week's goals (commit +
 * freeze) in one grouped read. Ordered self-first, then downline by name.
 */
export async function loadCommitData(me: {
  id: string;
  isAdmin: boolean;
}): Promise<CommitData> {
  const weekStart = currentWeekStart();
  const nextWeek = nextWeekStart(weekStart);

  const downline = await getDownlineIds(me.id);
  const memberIds = [me.id, ...downline];

  const [emps, rows] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(inArray(employees.id, memberIds), eq(employees.isActive, true))),
    db
      .select({
        id: weeklyGoals.id,
        employeeId: weeklyGoals.employeeId,
        weekStart: weeklyGoals.weekStart,
        position: weeklyGoals.position,
        client: weeklyGoals.client,
        subject: weeklyGoals.subject,
        targetDone: weeklyGoals.targetDone,
        area: weeklyGoals.area,
        uom: weeklyGoals.uom,
        pctDone: weeklyGoals.pctDone,
        pctUpdatedAt: weeklyGoals.pctUpdatedAt,
        acceptPct: weeklyGoals.acceptPct,
        adopted: weeklyGoals.adopted,
        committedAt: weeklyGoals.committedAt,
      })
      .from(weeklyGoals)
      .where(
        and(
          inArray(weeklyGoals.employeeId, memberIds),
          inArray(weeklyGoals.weekStart, [weekStart, nextWeek]),
          eq(weeklyGoals.archived, false),
        ),
      )
      .orderBy(asc(weeklyGoals.position)),
  ]);

  const nameById = new Map(emps.map((e) => [e.id, e.name]));

  const members: CommitMember[] = memberIds
    .filter((id) => nameById.has(id))
    .map((id) => {
      const mine = rows.filter((r) => r.employeeId === id);
      return {
        employeeId: id,
        name: nameById.get(id) ?? "-",
        isSelf: id === me.id,
        thisWeek: mine.filter((r) => r.weekStart === weekStart).map(toRow),
        nextWeek: mine.filter((r) => r.weekStart === nextWeek).map(toRow),
      };
    })
    // Self first, then downline alphabetically.
    .sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    weekStart,
    nextWeekStart: nextWeek,
    thisWeekLabel: formatWeekLabel(weekStart),
    nextWeekLabel: formatWeekLabel(nextWeek),
    isSaturday: isSaturdayIST(),
    isManager: downline.length > 0,
    members,
  };
}
