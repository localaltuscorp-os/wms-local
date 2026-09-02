import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { listGoalLookups } from "@/lib/goals/lookups";
import { goalsSpace } from "@/lib/goals/space";
import { resolveGoalsView } from "./cascade/view";
import { toGoalDTO, type GoalDTO, type RosterMember } from "@/components/goals/cascade/util";
import { currentWeekStart, mondayOf } from "@/lib/weekly-goals/week";
import { fyStartYearOf } from "@/lib/goals/types";

/**
 * Data for the PERSONAL Weekly / Daily board (goals table, scope=personal).
 * Professional Weekly/Daily keep their own surfaces; personal reuses the same
 * inline table at a single week (Monday) or day bucket, picked via query param.
 */
export interface PersonalWDData {
  space: "professional" | "personal";
  level: "week" | "day";
  /** The selected bucket key — a Monday ISO (week) or a date (day). */
  periodKey: string;
  fyStartYear: number;
  goals: GoalDTO[];
  roster: RosterMember[];
  myEmployeeId: string;
  isAdmin: boolean;
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  customLookups: { areas: string[]; measures: string[]; types: string[] };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  const d = new Date(Date.now() + 5.5 * 3_600_000); // IST
  return d.toISOString().slice(0, 10);
}

export async function loadPersonalWD(
  level: "week" | "day",
  sp: { wk?: string; day?: string; emp?: string },
): Promise<PersonalWDData> {
  const { me, isAdmin } = await requireGoalsAccess();
  const space = await goalsSpace(isAdmin);
  const view = await resolveGoalsView(me, isAdmin, sp.emp);

  // Selected bucket: a valid query date, else the current week/day.
  const periodKey =
    level === "week"
      ? sp.wk && DATE_RE.test(sp.wk)
        ? mondayOf(sp.wk)
        : currentWeekStart()
      : sp.day && DATE_RE.test(sp.day)
        ? sp.day
        : todayIso();

  const fyStartYear = fyStartYearOf(new Date(`${periodKey.slice(0, 7)}-01T00:00:00Z`));

  const [rows, lookups] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, view.viewedEmployeeId),
          eq(goals.scope, "personal"),
          eq(goals.archived, false),
          eq(goals.period, level),
          eq(goals.periodKey, periodKey),
        ),
      ),
    listGoalLookups(),
  ]);

  const goalsDto: GoalDTO[] = rows
    .map((r) => toGoalDTO(r))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  return {
    space,
    level,
    periodKey,
    fyStartYear,
    goals: goalsDto,
    roster: view.roster,
    myEmployeeId: me.id,
    isAdmin,
    areaOptions: lookups.areas,
    measureOptions: lookups.measures,
    typeOptions: lookups.types,
    customLookups: lookups.custom,
  };
}
