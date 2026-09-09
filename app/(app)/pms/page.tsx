import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  Target,
  TrendingUp,
  Settings,
  Sparkles,
  ClipboardCheck,
  Gauge,
  ShieldAlert,
  Award,
} from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { scoreForMany, type RosterScore } from "@/lib/queries/pms";
import { MODULE_THEME } from "@/lib/module-theme";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400";

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

const PILLARS = [
  ["kpi", "KPI"],
  ["skillUpgrade", "Skill"],
  ["compliance", "Comply"],
  ["attitude", "Attitude"],
  ["teamwork", "Team"],
] as const;

/** Score band → colour (green ≥80 / amber ≥60 / red). */
function band(score: number): { color: string; label: string } {
  if (score >= 80) return { color: "#16a34a", label: "Strong" };
  if (score >= 60) return { color: "#d97706", label: "On track" };
  return { color: "#dc2626", label: "Needs focus" };
}

export default async function PmsPage() {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);

  // Access model: admin/super → everyone; manager → their downline + self;
  // plain employee → just themselves.
  let people: { id: string; name: string; avatarUrl: string | null; department: string | null }[];
  if (admin) {
    people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const reports = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)))
      .orderBy(asc(employees.name));
    const self = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.id, me.id));
    const seen = new Set<string>();
    people = [...self, ...reports].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }

  const scores = await scoreForMany(people.map((p) => p.id));
  const byId = new Map<string, RosterScore>(scores.map((s) => [s.employeeId, s]));
  const sorted = [...people].sort((a, b) => (byId.get(b.id)?.score.score ?? 0) - (byId.get(a.id)?.score.score ?? 0));
  const eligible = sorted.filter((p) => byId.get(p.id)?.promotion.eligible).length;

  // ── KPIs folded over the already-loaded scores (zero extra queries) ──
  const scoreVals = sorted.map((p) => byId.get(p.id)?.score.score ?? 0);
  const avgScore = scoreVals.length > 0 ? Math.round(scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length) : 0;
  const strongCount = scoreVals.filter((s) => s >= 80).length;
  const onTrackCount = scoreVals.filter((s) => s >= 60 && s < 80).length;
  const atRiskCount = scoreVals.filter((s) => s < 60).length;
  const avgBand = band(avgScore);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero ── */}
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ACCENT} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${ACCENT} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                <Target size={13} strokeWidth={2.6} /> Employees · Performance
              </span>
              <h1
                className="mt-3 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(30px,3.6vw,46px)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                }}
              >
                Performance Intelligence
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                A live rating out of 100 per person across five pillars — KPI (50), Skill Upgrade (20),
                Compliance (10), Attitude (10) and Team Work (10).
                {" "}{admin ? "Every weight is yours to set." : "Your manager and admins set the weights."}
                {eligible > 0 && ` ${eligible} flagged for a promotion review.`}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                href={"/pms/review" as Route}
                className="wg-btn inline-flex items-center gap-2 rounded-pill border-2 bg-white/70 px-4 py-2.5 text-[14px] font-bold whitespace-nowrap transition-colors"
                style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
              >
                <ClipboardCheck size={16} strokeWidth={2.4} /> Monthly Review
              </Link>
              {process.env.PMS_V3 !== "false" && (
                <Link
                  href={"/pms/v3" as Route}
                  className="wg-btn inline-flex items-center gap-2 rounded-pill border-2 bg-white/70 px-4 py-2.5 text-[14px] font-bold whitespace-nowrap transition-colors"
                  style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
                >
                  <Sparkles size={16} strokeWidth={2.4} /> New Scoring (v3)
                </Link>
              )}
              {admin && (
                <>
                  <Link
                    href={"/pms/signals" as Route}
                    className="wg-btn inline-flex items-center gap-2 rounded-pill border-2 bg-white/70 px-4 py-2.5 text-[14px] font-bold whitespace-nowrap transition-colors"
                    style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
                  >
                    <Sparkles size={16} strokeWidth={2.4} /> Signals
                  </Link>
                  <Link
                    href={"/pms/config" as Route}
                    className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white whitespace-nowrap"
                    style={{
                      background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
                      boxShadow: `0 10px 24px -12px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                    }}
                  >
                    <Settings size={16} strokeWidth={2.4} /> Score Settings
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── KPI strip (folded over the loaded scores — zero extra queries) ── */}
        <section
          aria-label="Performance totals"
          className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        >
          <KpiCard
            icon={<Gauge size={17} strokeWidth={2.4} />}
            accent={avgBand.color}
            label="Average score"
            value={String(avgScore)}
            caption={`${avgBand.label.toLowerCase()} · ${sorted.length} ${sorted.length === 1 ? "person" : "people"}`}
            progress={avgScore / 100}
            delay={0}
          />
          <KpiCard
            icon={<TrendingUp size={17} strokeWidth={2.4} />}
            accent={ACCENT_DEEP}
            label="Promotion-ready"
            value={String(eligible)}
            caption={eligible > 0 ? "flagged for a promotion review" : "no one flagged yet"}
            delay={50}
          />
          <KpiCard
            icon={<Award size={17} strokeWidth={2.4} />}
            accent={ACCENT}
            label="Strong (80+)"
            value={String(strongCount)}
            caption={`${onTrackCount} on track (60–79)`}
            delay={100}
          />
          <KpiCard
            icon={<ShieldAlert size={17} strokeWidth={2.4} />}
            accent={atRiskCount > 0 ? "#dc2626" : "#334155"}
            label="Needs focus"
            value={String(atRiskCount)}
            caption={atRiskCount > 0 ? "scoring below 60" : "nobody below 60"}
            delay={150}
          />
        </section>

        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          {sorted.map((p, i) => {
            const rs = byId.get(p.id);
            const score = rs?.score.score ?? 0;
            const b = band(score);
            return (
              <Link
                key={p.id}
                href={`/pms/${p.id}` as Route}
                className="wg-rise group block rounded-2xl bg-surface-card p-5 transition-all duration-200 hover:-translate-y-0.5"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, boxShadow: CARD_SHADOW }}
              >
                <div className="flex items-center gap-4">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-black tabular-nums"
                    style={{
                      background: `color-mix(in srgb, ${i < 3 ? ACCENT : "#334155"} ${i < 3 ? 12 : 7}%, transparent)`,
                      color: i < 3 ? ACCENT_DEEP : "var(--color-ink-subtle)",
                    }}
                    aria-label={`Rank ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  <EmployeeAvatar name={p.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-bold text-ink-strong">{p.name}</span>
                      {rs?.promotion.eligible && (
                        <span
                          className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold text-white"
                          style={{
                            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
                            boxShadow: `0 4px 12px -6px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent)`,
                          }}
                        >
                          <TrendingUp size={11} strokeWidth={2.8} /> Promotion
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-ink-subtle">{p.department || "—"} · {rs?.tenureDays ?? 0}d tenure</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="tabular-nums leading-none"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: 36,
                        letterSpacing: "-0.02em",
                        color: b.color,
                      }}
                    >
                      {score}
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: b.color }}>{b.label}</div>
                  </div>
                </div>

                {/* Headline score bar */}
                <div
                  className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--color-hairline)" }}
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(2, score)}%`,
                      background: `linear-gradient(90deg, color-mix(in srgb, ${b.color} 70%, #fff), ${b.color})`,
                    }}
                  />
                </div>

                {/* Pillar breakdown */}
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {PILLARS.map(([key, label]) => {
                    const pillar = rs?.score.breakdown[key];
                    const pct = pillar && pillar.rate != null ? Math.round(pillar.rate * 100) : null;
                    return (
                      <div key={key} className="text-center">
                        <div
                          className="relative h-14 overflow-hidden rounded-lg"
                          style={{
                            background: "var(--color-surface-soft)",
                            boxShadow: "inset 0 1px 2px rgba(15,23,42,0.06)",
                          }}
                          title={`${label}: ${pct == null ? "no data" : pct + "%"}`}
                        >
                          <div
                            className="absolute bottom-0 inset-x-0 rounded-b-lg"
                            style={{
                              height: `${pct ?? 0}%`,
                              background:
                                pct == null
                                  ? "var(--color-hairline-strong)"
                                  : `linear-gradient(180deg, ${ACCENT}, ${ACCENT_DEEP})`,
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] font-semibold text-ink-subtle">{label}</div>
                        <div className="text-[11px] font-bold tabular-nums" style={{ color: pct == null ? "var(--color-ink-subtle)" : ACCENT_DEEP }}>{pct == null ? "—" : pct}</div>
                      </div>
                    );
                  })}
                </div>
              </Link>
            );
          })}
        </div>
        {sorted.length === 0 && (
          <div
            className="rounded-2xl bg-surface-card p-12 text-center text-[14.5px] text-ink-muted"
            style={{ boxShadow: CARD_SHADOW }}
          >
            No one to show yet.
          </div>
        )}
      </main>
    </>
  );
}

/* ── KPI card — same construction as the Attendance / Salary / Overtime stat cards ── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{ boxShadow: CARD_SHADOW, animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(1, progress) * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
