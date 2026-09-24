import Link from "next/link";
import type { Route } from "next";
import { ClipboardCheck } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canTrain } from "@/lib/training/roles";
import { listSessions } from "@/lib/queries/training-calendar";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function TrainingAttendancePage() {
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await canTrain(me));
  const scope = me.isAdmin || isSuperAdmin(me.email)
    ? ({ kind: "all", meId: me.id } as const)
    : ({ kind: "downline", meId: me.id } as const);

  const sessions = await listSessions({ scope });

  const rows = sessions
    .filter((s) => s.status !== "cancelled")
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <ClipboardCheck size={13} strokeWidth={2.6} /> Attendance
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Training Attendance
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Who attended each training. {canManage ? "Open a session to correct attendance." : "Open a session to see its attendees."}
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Training</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Trainer</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">When</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Attended</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-[rgba(15,23,42,0.04)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/training/calendar/${s.id}` as Route} className="font-bold text-ink-strong hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
                      {s.topic}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.trainerName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{new Date(s.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td className="px-4 py-2.5 font-semibold text-ink-strong">{s.attendedCount} / {s.attendeeCount}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.status}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-subtle">No trainings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
