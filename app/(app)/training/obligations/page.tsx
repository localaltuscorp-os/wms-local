import type { Route } from "next";
import Link from "next/link";
import { Users, BookOpen, Mic } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { withRetry } from "@/lib/db/with-timeout";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  obligationsForRoster,
  currentObligationPeriod,
  type ObligationRow,
} from "@/lib/queries/training-obligations";
import { ObligationBar, statusFor } from "@/components/training/obligations/obligation-bar";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red

type Person = { id: string; name: string; avatarUrl: string | null; department: string | null };

/** Pretty IST month label, e.g. "July 2026". */
function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function pct1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export default async function TrainingObligationsPage() {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);

  // Access model: admin/super → all active; manager → downline + self; else → self.
  const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };
  let people: Person[];
  if (admin) {
    people = await withRetry(
      () =>
        db
          .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
          .from(employees)
          .where(eq(employees.isActive, true))
          .orderBy(asc(employees.name)),
      { ...RETRY, label: "obl-roster-admin" },
    );
  } else {
    const downline = await getDownlineIds(me.id);
    const ids = Array.from(new Set([me.id, ...downline]));
    const rows = await withRetry(
      () =>
        db
          .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
          .from(employees)
          .where(and(eq(employees.isActive, true))),
      { ...RETRY, label: "obl-roster" },
    );
    const allow = new Set(ids);
    people = rows.filter((r) => allow.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  const period = currentObligationPeriod();
  const data = await obligationsForRoster(people.map((p) => p.id), period);
  const targets = data.targets;
  const byId = new Map<string, ObligationRow>(data.rows.map((r) => [r.employeeId, r]));
  const nameById = new Map(people.map((p) => [p.id, p]));
  const expectedShares = data.weeksElapsed;
  const expectedPct = period.periodFraction;

  // ── Org compliance summary ─────────────────────────────────────────────────
  // "On target" = met OR on-track (pro-rated). Each of the 4 obligations counts;
  // GIVE only applies to managers.
  let metCount = 0;
  let dueCount = 0;
  const tally = (actual: number, target: number) => {
    if (target <= 0) return;
    dueCount += 1;
    const s = statusFor(actual, target, expectedPct);
    if (s === "met" || s === "ontrack") metCount += 1;
  };
  for (const r of data.rows) {
    if (r.isManager) tally(r.givenHours, targets.giveHours);
    tally(r.attendedHours, targets.attendHours);
    tally(r.selfLearnHours, targets.selfLearnHours);
    tally(r.sharesDone, (targets.shareMinPerWeek > 0 ? 1 : 0) * expectedShares); // shares: each elapsed week is a "due"
  }
  const compliancePct = dueCount > 0 ? Math.round((metCount / dueCount) * 100) : 0;
  const complianceColor = compliancePct >= 80 ? "#16a34a" : compliancePct >= 60 ? "#d97706" : "#dc2626";

  const managerCount = data.rows.filter((r) => r.isManager).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <PageCommandBar
          title="Skill-Upgrade Obligations"
          actions={
            <Link
              href={"/pms" as Route}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Performance Scores
            </Link>
          }
        />

        {/* Summary strip */}
        <section className="mb-4 grid grid-cols-4 overflow-hidden rounded-xl border border-hairline bg-surface-card max-lg:grid-cols-2 max-sm:grid-cols-1 wg-rise" style={{ animationDelay: "40ms" }}>
          <div className="border-b border-r border-hairline px-4 py-3 max-lg:even:border-r-0 max-sm:border-r-0">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Org on-target</div>
            <div className="mt-1 tabular-nums font-black leading-none" style={{ fontSize: 28, color: complianceColor }}>
              {compliancePct}<span className="text-[20px] font-bold">%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-soft">
              <div className="h-full rounded-pill" style={{ width: `${compliancePct}%`, background: complianceColor }} />
            </div>
            <div className="mt-2 text-[12px] text-ink-subtle tabular-nums">{metCount} of {dueCount} obligations</div>
          </div>
          <SummaryStat icon={<Users size={18} strokeWidth={2.4} />} label="People tracked" value={String(people.length)} sub={`${managerCount} managers give training`} />
          <SummaryStat icon={<BookOpen size={18} strokeWidth={2.4} />} label="Targets / month" value={`${pct1(targets.attendHours)}h`} sub={`attend · ${pct1(targets.selfLearnHours)}h self-learn`} />
          <SummaryStat icon={<Mic size={18} strokeWidth={2.4} />} label="Weekly share" value={`${expectedShares}`} sub={`expected so far · ${targets.shareMinPerWeek}m each`} />
        </section>

        {/* Roster list */}
        {people.length === 0 ? (
          <p className="py-12 text-center text-ink-muted">No one to show yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
            {people.map((p, i) => {
              const r = byId.get(p.id);
              const person = nameById.get(p.id)!;
              const isManager = r?.isManager ?? false;
              const metrics = [
                ...(isManager ? [statusFor(r?.givenHours ?? 0, targets.giveHours, expectedPct)] : []),
                statusFor(r?.attendedHours ?? 0, targets.attendHours, expectedPct),
                statusFor(r?.selfLearnHours ?? 0, targets.selfLearnHours, expectedPct),
                statusFor(r?.sharesDone ?? 0, targets.shareMinPerWeek > 0 ? expectedShares : 0, expectedPct),
              ];
              const overallStatus = metrics.includes("behind") ? "Behind" : metrics.every((s) => s === "met" || s === "na") ? "Complete" : "On track";
              const overallColor = overallStatus === "Behind" ? "#dc2626" : overallStatus === "Complete" ? "#15803d" : "#a16207";
              return (
                <article
                  key={p.id}
                  className="wg-rise flex items-center gap-4 border-b border-hairline px-4 py-4 last:border-b-0 max-lg:flex-wrap"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className="flex items-center gap-3.5">
                    <EmployeeAvatar name={person.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[16px] font-bold text-ink-strong">{person.name}</span>
                      </div>
                      <span className="text-[12.5px] text-ink-subtle">{person.department || "—"}{isManager ? " · Trainer" : ""}</span>
                    </div>
                  </div>

                  <div className="grid flex-1 grid-cols-4 gap-x-5 gap-y-3 max-lg:min-w-full max-md:grid-cols-2 max-sm:grid-cols-1">
                    {isManager && (
                      <ObligationBar
                        label="Give"
                        actual={r?.givenHours ?? 0}
                        target={targets.giveHours}
                        unit="h"
                        expectedPct={expectedPct}
                      />
                    )}
                    <ObligationBar
                      label="Attend"
                      actual={r?.attendedHours ?? 0}
                      target={targets.attendHours}
                      unit="h"
                      expectedPct={expectedPct}
                    />
                    <ObligationBar
                      label="Self-Learn"
                      actual={r?.selfLearnHours ?? 0}
                      target={targets.selfLearnHours}
                      unit="h"
                      expectedPct={expectedPct}
                    />
                    <ObligationBar
                      label="Share"
                      actual={r?.sharesDone ?? 0}
                      target={targets.shareMinPerWeek > 0 ? expectedShares : 0}
                      unit="wk"
                      expectedPct={expectedPct}
                      fmt={(n) => String(Math.round(n))}
                    />
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${overallColor} 12%, transparent)`, color: overallColor }}>
                    {overallStatus}
                  </span>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[12px] text-ink-subtle">{monthLabel(period.period)} · {Math.round(expectedPct * 100)}% elapsed. Give applies to trainers.</p>
      </main>
    </>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border-b border-r border-hairline px-4 py-3 last:border-r-0 max-lg:even:border-r-0 max-sm:border-r-0">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        <span style={{ color: ACCENT }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 tabular-nums font-black leading-none text-ink-strong" style={{ fontSize: 32 }}>
        {value}
      </div>
      <div className="mt-2 text-[12px] text-ink-subtle">{sub}</div>
    </div>
  );
}
