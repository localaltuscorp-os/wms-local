import type { Route } from "next";
import Link from "next/link";
import { GraduationCap, Users, BookOpen, Mic, Presentation } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { withRetry } from "@/lib/db/with-timeout";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { MODULE_THEME } from "@/lib/module-theme";
import {
  obligationsForRoster,
  currentObligationPeriod,
  type ObligationRow,
} from "@/lib/queries/training-obligations";
import { ObligationBar, statusFor } from "@/components/training/obligations/obligation-bar";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep

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
        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap wg-rise">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <GraduationCap size={13} strokeWidth={2.6} /> Training · Obligations
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}
            >
              Skill-Upgrade Obligations
            </h1>
            <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "70ch" }}>
              {monthLabel(period.period)} · everyone&rsquo;s give / attend / self-learn / share against monthly
              targets. {admin ? "All active people." : "You and your team."} This is what feeds the
              Skill-Upgrade pillar in the performance score.
            </p>
          </div>
          <Link
            href={"/pms" as Route}
            className="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-[14px] font-bold transition-colors"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
          >
            Performance Scores
          </Link>
        </header>

        {/* Summary strip */}
        <section className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1 wg-rise" style={{ animationDelay: "40ms" }}>
          <div className="rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Org on-target</div>
            <div className="mt-1 tabular-nums font-black leading-none" style={{ fontSize: 38, color: complianceColor }}>
              {compliancePct}<span className="text-[20px] font-bold">%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-surface-soft">
              <div className="h-full rounded-pill" style={{ width: `${compliancePct}%`, background: complianceColor }} />
            </div>
            <div className="mt-2 text-[12px] text-ink-subtle tabular-nums">{metCount} of {dueCount} obligations</div>
          </div>
          <SummaryStat icon={<Users size={18} strokeWidth={2.4} />} label="People tracked" value={String(people.length)} sub={`${managerCount} managers give training`} />
          <SummaryStat icon={<BookOpen size={18} strokeWidth={2.4} />} label="Targets / month" value={`${pct1(targets.attendHours)}h`} sub={`attend · ${pct1(targets.selfLearnHours)}h self-learn`} />
          <SummaryStat icon={<Mic size={18} strokeWidth={2.4} />} label="Weekly share" value={`${expectedShares}`} sub={`expected so far · ${targets.shareMinPerWeek}m each`} />
        </section>

        {/* Roster cards */}
        {people.length === 0 ? (
          <p className="py-12 text-center text-ink-muted">No one to show yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
            {people.map((p, i) => {
              const r = byId.get(p.id);
              const person = nameById.get(p.id)!;
              const isManager = r?.isManager ?? false;
              return (
                <article
                  key={p.id}
                  className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className="flex items-center gap-3.5">
                    <EmployeeAvatar name={person.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[16px] font-bold text-ink-strong">{person.name}</span>
                        {isManager && (
                          <span
                            className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
                            style={{ background: ACCENT }}
                          >
                            <Presentation size={10} strokeWidth={2.8} /> Trainer
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] text-ink-subtle">{person.department || "—"}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5 max-sm:grid-cols-1">
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
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-[12.5px] text-ink-subtle">
          Bars are pro-rated to the {Math.round(expectedPct * 100)}% of {monthLabel(period.period)} elapsed —
          green is on or ahead of target, amber is on pace, red is behind. Give applies to managers only.
        </p>
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
    <div className="rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm">
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
