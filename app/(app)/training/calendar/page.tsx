import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, AlertTriangle, ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, listTcSubjects } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getScoreConfig } from "@/lib/queries/pms";
import { listSessions, upcomingAlert } from "@/lib/queries/training-calendar";
import { MODULE_THEME } from "@/lib/module-theme";
import { CalendarBoard } from "@/components/training/calendar/calendar-board";
import { addSessionSubject } from "./actions";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function TrainingCalendarPage() {
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));

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
  const upcoming = sessions
    .filter((s) => s.status === "scheduled" && new Date(s.scheduledAt).getTime() >= now)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const past = sessions.filter((s) => !(s.status === "scheduled" && new Date(s.scheduledAt).getTime() >= now));

  const showAlert =
    alert.noneScheduled && (alert.daysSinceLast == null || alert.daysSinceLast > alertDays);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
          <ArrowLeft size={15} strokeWidth={2.4} /> Training Centre
        </Link>

        <header className="mt-3 mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <CalendarDays size={13} strokeWidth={2.6} /> Training Calendar
          </span>
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}
          >
            Training Calendar
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Schedule sessions, mark attendance, gather feedback and assess. {canManage ? "Prefer Fridays / Saturdays." : "Your sessions and your team's."}
          </p>
        </header>

        {showAlert && (
          <div
            className="wg-rise mb-6 flex items-start gap-3 rounded-2xl border p-4"
            style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.45)" }}
          >
            <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: "#b45309" }} />
            <div>
              <p className="text-[15px] font-bold" style={{ color: "#92400e" }}>
                No training scheduled
                {alert.daysSinceLast != null ? ` — ${alert.daysSinceLast} day${alert.daysSinceLast === 1 ? "" : "s"} since the last session.` : "."}
              </p>
              <p className="mt-0.5 text-[13.5px] font-semibold" style={{ color: "#a16207" }}>
                {canManage
                  ? `Aim for a session at least every ${alertDays} days. Schedule one below.`
                  : `Ask a manager to schedule the next session (target: every ${alertDays} days).`}
              </p>
            </div>
          </div>
        )}

        <CalendarBoard
          upcoming={upcoming}
          past={past}
          canManage={canManage}
          subjectOptions={subjects}
          employeeOptions={employeeOptions}
          maxSessionMinutes={maxSessionMinutes}
          onAddSubject={canManage ? addSessionSubject : undefined}
        />
      </main>
    </>
  );
}
