import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, weeklyGoals, employees } from "@/lib/db";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { weeklyScore } from "@/lib/weekly-goals/effective";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/weekly-goals/dashboard — the team weekly-score overview (web
 * parity with /weekly-goals/dashboard, distilled for mobile). Admins/super-admins
 * see everyone; everyone else sees only their own score. One row per person:
 * their weighted weekly score + goal count, sorted high→low, plus the team
 * average. Reuses the web `weeklyScore` so the two never diverge.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const weekStart = currentWeekStart();

  const rows = await db
    .select({
      employeeId: weeklyGoals.employeeId,
      name: employees.name,
      weight: weeklyGoals.weight,
      acceptPct: weeklyGoals.acceptPct,
      pctDone: weeklyGoals.pctDone,
    })
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .where(
      and(
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
        eq(employees.isActive, true),
        admin ? undefined : eq(weeklyGoals.employeeId, me.id),
      ),
    );

  // Group by employee → weighted weekly score.
  const byEmp = new Map<string, { name: string; goals: { acceptPct: number | null; pctDone: number; weight: number }[] }>();
  for (const r of rows) {
    const g = byEmp.get(r.employeeId) ?? { name: r.name, goals: [] };
    g.goals.push({ acceptPct: r.acceptPct, pctDone: r.pctDone, weight: r.weight });
    byEmp.set(r.employeeId, g);
  }

  const people = Array.from(byEmp.entries())
    .map(([employeeId, g]) => ({ employeeId, name: g.name, score: weeklyScore(g.goals), goals: g.goals.length }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const teamScore = people.length > 0 ? Math.round(people.reduce((s, p) => s + p.score, 0) / people.length) : 0;

  return NextResponse.json(
    {
      weekLabel: formatWeekLabel(weekStart),
      teamScore,
      peopleCount: people.length,
      people,
    },
    { headers: MOBILE_CORS },
  );
}
