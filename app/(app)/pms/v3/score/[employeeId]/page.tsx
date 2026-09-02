import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Target } from "lucide-react";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { MODULE_THEME } from "@/lib/module-theme";
import { requirePmsV3 } from "@/lib/pms/v3/flag";
import { canActAsManan } from "@/lib/pms/v3/roles";
import { getMonthlyScoreView, getGradeBandsForMonth, getXFactors, getMonthlyTotalsForMonth } from "@/lib/queries/pms-v3";
import { MonthlyScoringPanel } from "@/components/pms/v3/monthly-scoring-panel";
import { XFactorPanel } from "@/components/pms/v3/xfactor-panel";
import { GradeBandBadge } from "@/components/pms/v3/grade-band-badge";
import { TotalSummary } from "@/components/pms/v3/total-summary";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

function currentPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const period = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return { period, label };
}

export default async function PmsV3ScorePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  requirePmsV3();
  const { employeeId } = await params;
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const manan = canActAsManan(me.email);
  const { period, label } = currentPeriod();

  const [subject] = await db
    .select({ id: employees.id, name: employees.name, department: employees.department })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!subject) redirect("/pms/v3" as Route);

  // Am I this person's manager?
  const mgrRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.managerId, me.id)))
    .limit(1);
  const isTheirManager = mgrRows.length > 0;

  // View access: self, their manager, or admin/Manan.
  if (!(employeeId === me.id || isTheirManager || admin)) redirect("/pms/v3" as Route);

  // Which lane does this viewer fill? self > manan (for others) > manager.
  const editableRole =
    employeeId === me.id ? "self" : manan ? "manan" : isTheirManager ? "manager" : null;

  const [view, grades, xfactors, totals] = await Promise.all([
    getMonthlyScoreView(employeeId, period, { canSeeJustifications: manan }),
    getGradeBandsForMonth([{ id: subject.id, name: subject.name }], period),
    manan ? getXFactors(employeeId, period) : Promise.resolve([]),
    getMonthlyTotalsForMonth([{ id: subject.id, name: subject.name }], period),
  ]);
  const grade = grades[0];
  const total = totals[0];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/pms/v3" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={15} strokeWidth={2.6} /> Monthly Scoring
        </Link>

        <header className="mb-6 flex flex-wrap items-center gap-4">
          <EmployeeAvatar name={subject.name} size="lg" />
          <div className="min-w-0 flex-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Target size={11} strokeWidth={2.8} /> {label}
            </span>
            <h1
              className="mt-1.5 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,2.6vw,34px)", letterSpacing: "-0.02em" }}
            >
              {subject.name}
            </h1>
            <span className="text-[13.5px] text-ink-subtle">{subject.department || "—"}</span>
          </div>
          {grade && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Incentive grade</span>
              <GradeBandBadge grade={grade.grade} />
            </div>
          )}
        </header>

        {total && (
          <div className="mb-6">
            <TotalSummary
              total={total.total}
              isManager={total.isManager}
              xFactorMax={view.config.xFactorMaxPoints}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </div>
        )}

        <MonthlyScoringPanel
          view={view}
          subjectName={subject.name}
          editableRole={editableRole}
          periodLabel={label}
          accent={ACCENT}
          accentDeep={ACCENT_DEEP}
        />

        {manan && (
          <div className="mt-6">
            <XFactorPanel
              subjectId={employeeId}
              period={period}
              existing={xfactors.map((x) => ({
                id: x.id,
                points: String(x.points),
                evidenceKind: x.evidenceKind,
                evidenceUrl: x.evidenceUrl,
                transcriptSummary: x.transcriptSummary,
                note: x.note,
              }))}
              maxPoints={view.config.xFactorMaxPoints}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </div>
        )}
      </main>
    </>
  );
}
