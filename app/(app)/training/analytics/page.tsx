import { BarChart3 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { trainingAnalytics } from "@/lib/queries/learning-analytics";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function TrainingAnalyticsPage() {
  await requireWorkspace("training");

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const a = await trainingAnalytics(monthStart, monthEnd);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <BarChart3 size={13} strokeWidth={2.6} /> Analytics
          </span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}>
            Training Analytics
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Current month. Informs management — never ranks people.
          </p>
        </header>

        <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
          <Stat label="Total trainings" value={a.total} />
          <Stat label="Completed" value={a.conducted} />
          <Stat label="Cancelled" value={a.cancelled} />
          <Stat label="Avg assessment" value={a.avgAssessment != null ? `${a.avgAssessment}%` : "—"} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <Section title="By function">
            {a.byFunction.map((f) => <Bar key={f.name} label={f.name} value={f.count} max={Math.max(1, ...a.byFunction.map((x) => x.count))} />)}
            {a.byFunction.length === 0 && <p className="text-ink-subtle">No trainings this month.</p>}
          </Section>
          <Section title="By topic">
            {a.byTopic.map((t) => <Bar key={t.name} label={t.name} value={t.count} max={Math.max(1, ...a.byTopic.map((x) => x.count))} />)}
            {a.byTopic.length === 0 && <p className="text-ink-subtle">No topics yet.</p>}
          </Section>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <Section title="Attendance">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <KV k="Present" v={a.attendance.present} />
              <KV k="Late" v={a.attendance.late} />
              <KV k="Partial" v={a.attendance.partial} />
              <KV k="Absent" v={a.attendance.absent} />
              <KV k="Via recording" v={a.attendance.viaRecording} />
              <KV k="Avg feedback" v={a.avgSurvey != null ? `${a.avgSurvey} / 5` : "—"} />
            </div>
          </Section>
          <Section title="Trainers (conducted this month)">
            {a.trainers.filter((t) => t.conducted > 0).map((t) => <Bar key={t.trainerId} label={t.trainerName} value={t.conducted} max={Math.max(1, ...a.trainers.map((x) => x.conducted))} />)}
            {a.trainers.every((t) => t.conducted === 0) && <p className="text-ink-subtle">No trainings conducted yet.</p>}
          </Section>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink-strong">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-5">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft">{title}</h2>
      {children}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="font-bold text-ink-strong">{value}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[rgba(15,23,42,0.06)]">
        <div className="h-2 rounded-full" style={{ width: `${Math.round((value / max) * 100)}%`, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }} />
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.03)] px-3 py-2">
      <span className="font-semibold text-ink-soft">{k}</span>
      <span className="font-bold text-ink-strong">{v}</span>
    </div>
  );
}
