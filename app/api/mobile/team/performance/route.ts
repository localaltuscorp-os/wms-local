import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { teamScopeFor, teamPerformance } from "@/lib/queries/team-performance";
import { TZ } from "@/lib/weekly-goals/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** "HH:mm" in {@link TZ} — server-formatted so the app never touches timezones. */
function timeLabel(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/**
 * GET /api/mobile/team/performance — the mobile rendition of the web
 * `/weekly-goals/team` "Team performance" page: the same A-to-Z scoped
 * roster (self → downline → all, per `teamScopeFor`) and the same
 * per-member snapshot (`teamPerformance`) the web card grid renders —
 * goal score, workload, DCC compliance, training hours, last in/out.
 * Additive + read-only: reuses the web's own queries verbatim, never
 * touches the web surface.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const roster = await teamScopeFor({ id: me.id, isAdmin: me.isAdmin, email: me.email });
  const perf = await teamPerformance(roster.map((r) => r.id));

  const members = roster.map((m) => {
    const p = perf.get(m.id);
    return {
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      department: m.department,
      goalsCount: p?.goalsCount ?? 0,
      goalsDone: p?.goalsDone ?? 0,
      goalScorePct: p?.goalScorePct ?? null,
      assignedToday: p?.assignedToday ?? 0,
      overdueTasks: p?.overdueTasks ?? 0,
      pendingTasks: p?.pendingTasks ?? 0,
      needHelp: p?.needHelp ?? 0,
      blockedTasks: p?.blockedTasks ?? 0,
      doneToday: p?.doneToday ?? 0,
      plannedToday: p?.plannedToday ?? false,
      dccCompliancePct: p?.dccCompliancePct ?? null,
      trainingHoursMonth: p?.trainingHoursMonth ?? 0,
      lastInLabel: timeLabel(p?.lastInAt ?? null),
      lastOutLabel: timeLabel(p?.lastOutAt ?? null),
      /** True once in without an out today — drives the "Working" status (mirrors web `statusOf`). */
      working: Boolean(p?.lastInAt && !p?.lastOutAt),
    };
  });

  return NextResponse.json({ members }, { headers: MOBILE_CORS });
}
