import { Target } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { learningVisibleIds, learningRoleGroupFor } from "@/lib/training/roles";
import { listEmployees } from "@/lib/queries/employees";
import { computePersonActuals, effectiveTargetFor } from "@/lib/queries/learning-targets";
import type { LearningMetric } from "@/db/enums";
import { isFounderEmail } from "@/lib/auth/founder";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface MetricSpec {
  metric: LearningMetric;
  label: string;
  unit: "count" | "hours";
}

const METRICS: MetricSpec[] = [
  { metric: "trainings_attend", label: "Trainings attended", unit: "count" },
  { metric: "trainings_conduct", label: "Trainings conducted", unit: "count" },
  { metric: "self_learning_hours", label: "Self-learning", unit: "hours" },
  { metric: "learning_shares", label: "Learning shares", unit: "count" },
];

interface Row {
  id: string;
  name: string;
  role: string;
  metrics: { metric: LearningMetric; label: string; unit: string; actual: number; target: number }[];
}

export default async function TargetsPage() {
  const me = await requireWorkspace("training");
  const visible = await learningVisibleIds(me);
  const all = await listEmployees({ includeInactive: false });
  const people = visible.length === 0 ? all : all.filter((e) => visible.includes(e.id));

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows: Row[] = await Promise.all(
    people.map(async (e) => {
      const role = await learningRoleGroupFor(e);
      const actuals = await computePersonActuals(e.id, monthStart, monthEnd);
      const metrics = await Promise.all(
        METRICS.map(async (m) => ({
          ...m,
          actual:
            m.metric === "trainings_attend" ? actuals.trainingsAttended :
            m.metric === "trainings_conduct" ? actuals.trainingsConducted :
            m.metric === "self_learning_hours" ? actuals.selfLearningHours :
            actuals.learningShares,
          target: await effectiveTargetFor(role, m.metric, monthEnd),
        })),
      );
      return { id: e.id, name: e.name, role, metrics };
    }),
  );

  // TL-group summary: members + how many met their training-attendance target.
  const nameById = new Map(all.map((e) => [e.id, e.name]));
  const byManager = new Map<string, { name: string; members: number; met: number }>();
  for (const p of people) {
    const row = rows.find((r) => r.id === p.id);
    const attend = row?.metrics.find((m) => m.metric === "trainings_attend");
    const mgrId = p.managerId ?? "none";
    const entry = byManager.get(mgrId) ?? { name: mgrId === "none" ? "No manager" : (nameById.get(mgrId) ?? "Unknown"), members: 0, met: 0 };
    entry.members++;
    if (attend && attend.target > 0 && attend.actual >= attend.target) entry.met++;
    byManager.set(mgrId, entry);
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <Target size={13} strokeWidth={2.6} /> Target vs Actual
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Target vs Actual
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Current month · configurable targets · {me.isAdmin || isFounderEmail(me.email) ? "whole organisation" : "you and your team"}.
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Person</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Role</th>
                {METRICS.map((m) => (
                  <th key={m.metric} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[rgba(15,23,42,0.04)]">
                  <td className="px-4 py-2.5 font-bold text-ink-strong">{r.name}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{r.role}</td>
                  {r.metrics.map((m) => {
                    const pct = m.target > 0 ? Math.round((m.actual / m.target) * 100) : null;
                    const met = pct != null && pct >= 100;
                    return (
                      <td key={m.metric} className="px-4 py-2.5">
                        <span className="font-bold text-ink-strong">{m.actual} / {m.target}</span>
                        {pct != null && (
                          <span className="ml-2 text-[12px] font-bold" style={{ color: met ? "#16a34a" : pct >= 75 ? "#b45309" : "var(--color-altus-red-deep)" }}>
                            {pct}%
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={2 + METRICS.length} className="px-4 py-10 text-center text-ink-subtle">No people to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-5">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft">By team (TL group)</h2>
          <div className="grid gap-2">
            {[...byManager.values()].sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
              <div key={g.name} className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.03)] px-3 py-2 text-[13px]">
                <span className="font-semibold text-ink-soft">{g.name}</span>
                <span className="font-bold text-ink-strong">{g.met} / {g.members} met training target</span>
              </div>
            ))}
            {byManager.size === 0 && <p className="text-ink-subtle">No teams to show.</p>}
          </div>
        </div>
      </main>
    </>
  );
}
