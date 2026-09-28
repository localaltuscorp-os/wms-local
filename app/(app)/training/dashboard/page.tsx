import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager } from "@/lib/queries/training";
import { learningRoleGroupFor } from "@/lib/training/roles";
import { computePersonActuals, effectiveTargetFor } from "@/lib/queries/learning-targets";
import { getTrainingDashboardStats } from "@/lib/queries/training";
import { TrainingStats } from "@/components/training/dashboard/training-stats";
import type { LearningMetric } from "@/db/enums";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";

interface Card {
  label: string;
  actual: number;
  target: number;
  unit: string;
}

function Kpi({ card }: { card: Card }) {
  const pct = card.target > 0 ? Math.round((card.actual / card.target) * 100) : null;
  const met = pct != null && pct >= 100;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{card.label}</p>
      <p className="mt-1 text-2xl font-black text-ink-strong">
        {card.actual} <span className="text-[15px] font-bold text-ink-subtle">/ {card.target} {card.unit}</span>
      </p>
      {pct != null && (
        <div className="mt-2 h-1.5 rounded-full bg-surface-track">
          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: met ? "var(--color-green)" : "var(--color-altus-red)" }} />
        </div>
      )}
    </div>
  );
}

export default async function TrainingDashboardPage() {
  const me = await requireWorkspace("training");
  const role = await learningRoleGroupFor(me);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const actuals = await computePersonActuals(me.id, monthStart, monthEnd);
  const metric = async (m: LearningMetric) => effectiveTargetFor(role, m, monthEnd);

  const [attendT, conductT, selfT, shareT] = await Promise.all([
    metric("trainings_attend"),
    metric("trainings_conduct"),
    metric("self_learning_hours"),
    metric("learning_shares"),
  ]);

  const cards: Card[] = [
    { label: "Trainings attended", actual: actuals.trainingsAttended, target: attendT, unit: "" },
    { label: "Trainings conducted", actual: actuals.trainingsConducted, target: conductT, unit: "" },
    { label: "Self-learning", actual: actuals.selfLearningHours, target: selfT, unit: "hrs" },
    { label: "Learning shares", actual: actuals.learningShares, target: shareT, unit: "" },
  ].filter((c) => c.target > 0 || c.label === "Self-learning");

  const canViewTeam = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  const stats = canViewTeam ? await getTrainingDashboardStats() : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1180px]">
          <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Training Centre</Link>
          <header className="mt-3 mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Dashboard</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 4 }}>My Learning</h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>Your monthly target vs actual ({role} cohort).</p>
          </header>

          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            {cards.map((c) => <Kpi key={c.label} card={c} />)}
          </div>

          {stats && (
            <div className="mt-8">
              <h2 className="mb-4 text-[15px] font-bold text-ink-strong">Team overview</h2>
              <TrainingStats stats={stats} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
