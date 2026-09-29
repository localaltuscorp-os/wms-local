import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, listTcSubjects } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getScoreConfig } from "@/lib/queries/pms";
import { listSessions, upcomingAlert } from "@/lib/queries/training-calendar";
import { CalendarBoard } from "@/components/training/calendar/calendar-board";
import { CalendarGrid, type GridView } from "@/components/training/calendar/calendar-grid";
import { addSessionSubject } from "./actions";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function TrainingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));

  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) ?? "list";
  const gridView: GridView | null = view === "month" || view === "week" || view === "day" ? view : null;

  const scope = me.isAdmin || isSuperAdmin(me.email) ? ({ kind: "all", meId: me.id } as const) : ({ kind: "downline", meId: me.id } as const);

  const [sessions, alert, subjects, employeeOptions, cfg] = await Promise.all([
    listSessions({ scope }),
    upcomingAlert(),
    listTcSubjects(),
    listEmployeeOptions(),
    getScoreConfig(),
  ]);

  const maxSessionMinutes = cfg.thresholds.maxSessionMinutes || 90;
  const alertDays = cfg.thresholds.noScheduleAlertDays || 6;

  const now = Date.now();

  // Month / Week / Day views filter the visible sessions to that window.
  const inView = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    const d = new Date(iso);
    if (view === "day") {
      const today = new Date();
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }
    if (view === "week") {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      return t >= startOfWeek.getTime() && t < endOfWeek.getTime();
    }
    if (view === "month") {
      const nowD = new Date();
      return d.getFullYear() === nowD.getFullYear() && d.getMonth() === nowD.getMonth();
    }
    return true;
  };

  const filtered = sessions.filter((s) => inView(s.scheduledAt));
  const upcoming = filtered
    .filter((s) => s.status === "scheduled" && new Date(s.scheduledAt).getTime() >= now)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const past = filtered.filter((s) => !(s.status === "scheduled" && new Date(s.scheduledAt).getTime() >= now));

  const showAlert =
    alert.noneScheduled && (alert.daysSinceLast == null || alert.daysSinceLast > alertDays);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
          <ArrowLeft size={15} strokeWidth={2.4} /> Training Centre
        </Link>

        <PageCommandBar
          title="Training Calendar"
          toolbar={
            <div className="flex gap-2">
            {(["list", "day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={`/training/calendar?view=${v}` as Route}
                className="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold capitalize transition-colors"
                style={view === v ? { background: ACCENT, color: "#fff" } : { background: "var(--color-surface-track)", color: "var(--color-ink-soft)" }}
              >
                {v}
              </Link>
            ))}
            </div>
          }
        />

        {showAlert && (
          <div
            className="wg-rise mb-4 flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
            style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.45)" }}
          >
            <AlertTriangle size={17} className="shrink-0" style={{ color: "#b45309" }} />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-[13.5px] font-bold" style={{ color: "#92400e" }}>
                No training scheduled
                {alert.daysSinceLast != null ? ` — ${alert.daysSinceLast} day${alert.daysSinceLast === 1 ? "" : "s"} since the last session.` : "."}
              </p>
              <p className="text-[12.5px] font-medium" style={{ color: "#a16207" }}>
                {canManage
                  ? `Target: every ${alertDays} days.`
                  : "Ask a manager to schedule next session."}
              </p>
            </div>
          </div>
        )}

        {gridView ? (
          <CalendarGrid view={gridView} sessions={sessions} />
        ) : (
          <CalendarBoard
            upcoming={upcoming}
            past={past}
            canManage={canManage}
            subjectOptions={subjects}
            employeeOptions={employeeOptions}
            maxSessionMinutes={maxSessionMinutes}
            onAddSubject={canManage ? addSessionSubject : undefined}
          />
        )}
      </main>
    </>
  );
}
