import type { ReactNode } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Target, TrendingUp, GraduationCap, ShieldCheck, Smile, Users, Award, Sparkles, Flag } from "lucide-react";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { formatDate } from "@/lib/format";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { scoreFor } from "@/lib/queries/pms";
import {
  getReviewsFor,
  listPersonalGoals,
  getSignalsFor,
  type DetailReview,
  type ReviewRelation,
} from "@/lib/queries/pms-detail";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { StarRating } from "@/components/ui/star-rating";
import { MODULE_THEME } from "@/lib/module-theme";
import { PillarBar, type SubSignal } from "@/components/pms/detail/pillar-bar";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400";

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

/** Score band → colour (green ≥80 / amber ≥60 / red) — same logic as /pms. */
function band(score: number): { color: string; label: string } {
  if (score >= 80) return { color: "#16a34a", label: "Strong" };
  if (score >= 60) return { color: "#d97706", label: "On track" };
  return { color: "#dc2626", label: "Needs focus" };
}

const SUB_LABELS: Record<string, string> = {
  weekly: "Weekly Goals",
  incentive: "Incentive",
  attended: "Training Attended",
  given: "Training Given",
  selfLearn: "Self-Learning",
  share: "Weekly Share",
  dcc: "DCC",
  checklist: "Daily Checklist",
};

function subSignalsFrom(detail?: Record<string, number | null>): SubSignal[] {
  if (!detail) return [];
  return Object.entries(detail).map(([key, rate]) => ({
    key,
    label: SUB_LABELS[key] ?? key,
    rate,
  }));
}

const RELATION_LABEL: Record<ReviewRelation, string> = {
  manager: "Manager Review",
  subordinate: "Subordinate (Upward) Review",
  peer: "Peer / Colleague Review",
  self: "Self Review",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return formatDate(d);
}

function statusChip(status: string): { color: string; bg: string } {
  switch (status) {
    case "released":
    case "actioned":
      return { color: "#15803d", bg: "rgba(22,163,74,0.12)" };
    case "dismissed":
      return { color: "#b91c1c", bg: "rgba(220,38,38,0.10)" };
    case "acknowledged":
      return { color: "#1d4ed8", bg: "rgba(37,99,235,0.10)" };
    default: // suggested / flagged
      return { color: "#b45309", bg: "rgba(217,119,6,0.12)" };
  }
}

export default async function PmsDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);

  // ── Access: admin/super OR self OR the subject is in my downline. ──
  let allowed = admin || me.id === employeeId;
  if (!allowed) {
    const downline = await getDownlineIds(me.id);
    allowed = downline.includes(employeeId);
  }
  if (!allowed) redirect("/pms" as Route);

  const [person] = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      avatarUrl: employees.avatarUrl,
    })
    .from(employees)
    .where(eq(employees.id, employeeId));

  if (!person) redirect("/pms" as Route);

  const [scoreResult, reviews, goals, signals] = await Promise.all([
    scoreFor(employeeId),
    getReviewsFor(employeeId),
    listPersonalGoals(employeeId),
    getSignalsFor(employeeId),
  ]);

  const { score, breakdown } = scoreResult.score;
  const b = band(score);
  const dash = (2 * Math.PI * 52) * (score / 100);
  const circumference = 2 * Math.PI * 52;

  const pillars: {
    key: keyof typeof breakdown;
    name: string;
    icon: ReactNode;
    hint?: string;
  }[] = [
    { key: "kpi", name: "KPI", icon: <Target size={16} strokeWidth={2.6} />, hint: "Weekly Goals achievement + Incentive target-vs-actual." },
    { key: "skillUpgrade", name: "Skill Upgrade", icon: <GraduationCap size={16} strokeWidth={2.4} />, hint: "Training attended & given, self-learning and the weekly Share — pro-rated to this month." },
    { key: "compliance", name: "Compliance", icon: <ShieldCheck size={16} strokeWidth={2.4} />, hint: "DCC compliance and Daily-Checklist completion." },
    { key: "attitude", name: "Attitude & Mindset", icon: <Smile size={16} strokeWidth={2.4} /> },
    { key: "teamwork", name: "Team Work", icon: <Users size={16} strokeWidth={2.4} /> },
  ];

  const reviewRelations: ReviewRelation[] = ["manager", "subordinate", "peer", "self"];
  const totalReviews =
    reviews.manager.length + reviews.subordinate.length + reviews.peer.length + reviews.self.length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* Back link */}
        <div className="mb-5 wg-rise">
        </div>

        {/* ── Glass hero: identity + big score ring ── */}
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            animationDelay: "35ms",
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${b.color} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${ACCENT} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-5 min-w-0 max-md:gap-4">
              <EmployeeAvatar name={person.name} size="lg" />
              <div className="min-w-0">
                <span
                  className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                >
                  <Target size={13} strokeWidth={2.6} /> Employees · Performance
                </span>
                <h1
                  className="mt-2 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: "clamp(28px,3.4vw,44px)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.02,
                  }}
                >
                  {person.name}
                </h1>
                <p className="mt-1 text-[14.5px] font-medium text-ink-muted">
                  {person.department || "No department"} · {scoreResult.tenureDays}d tenure
                </p>
                {scoreResult.promotion.eligible && (
                  <span
                    className="mt-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
                      boxShadow: `0 6px 16px -8px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent)`,
                    }}
                  >
                    <TrendingUp size={12} strokeWidth={2.8} /> Promotion-eligible
                  </span>
                )}
              </div>
            </div>

            {/* Big score ring */}
            <div className="flex items-center gap-4">
              <div
                className="relative h-[136px] w-[136px] shrink-0"
                role="img"
                aria-label={`Performance score ${score} out of 100 — ${b.label}`}
              >
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-soft)" strokeWidth="12" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={b.color}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    style={{ filter: `drop-shadow(0 3px 6px color-mix(in srgb, ${b.color} 35%, transparent))` }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <div
                      className="tabular-nums leading-none"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: 40,
                        letterSpacing: "-0.02em",
                        color: b.color,
                      }}
                    >
                      {score}
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: b.color }}>
                      {b.label}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Promotion banner */}
        <div
          className="mb-6 flex items-start gap-3 rounded-2xl p-4 wg-rise"
          style={{
            animationDelay: "70ms",
            background: scoreResult.promotion.eligible
              ? `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 8%, #fff), color-mix(in srgb, ${ACCENT} 4%, #fff))`
              : "var(--color-surface-card)",
            boxShadow: scoreResult.promotion.eligible
              ? `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 35%, transparent), 0 10px 28px -20px color-mix(in srgb, ${ACCENT_DEEP} 60%, transparent)`
              : CARD_SHADOW,
          }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
            style={{
              background: scoreResult.promotion.eligible
                ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`
                : "var(--color-hairline-strong)",
            }}
          >
            <TrendingUp size={18} strokeWidth={2.6} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-ink-strong">
              {scoreResult.promotion.eligible ? "Eligible for a Promotion Review" : "Not Yet Promotion-Eligible"}
            </div>
            <p className="mt-0.5 text-[13.5px] leading-snug text-ink-muted">{scoreResult.promotion.rationale}</p>
          </div>
        </div>

        {/* Pillars */}
        <section className="mb-8 wg-rise" style={{ animationDelay: "105ms" }}>
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Score breakdown · 5 pillars
          </h2>
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {pillars.map((p) => {
              const pillar = breakdown[p.key];
              return (
                <PillarBar
                  key={p.key}
                  name={p.name}
                  weight={pillar.weight}
                  rate={pillar.rate}
                  accent={ACCENT}
                  accentDeep={ACCENT_DEEP}
                  icon={p.icon}
                  hint={p.hint}
                  subSignals={subSignalsFrom(pillar.detail)}
                />
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-6 max-xl:grid-cols-1">
          {/* Monthly reviews */}
          <section className="col-span-2 max-xl:col-span-1 wg-rise" style={{ animationDelay: "140ms" }}>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              Monthly 360 reviews
            </h2>
            <div className="space-y-4">
              {totalReviews === 0 && (
                <div
                  className="rounded-2xl bg-surface-card p-8 text-center text-[14px] text-ink-muted"
                  style={{ boxShadow: CARD_SHADOW }}
                >
                  No monthly reviews recorded yet.
                </div>
              )}
              {reviewRelations.map((rel) => {
                const list = reviews[rel];
                if (list.length === 0) return null;
                return (
                  <div
                    key={rel}
                    className="rounded-2xl bg-surface-card p-5"
                    style={{ boxShadow: CARD_SHADOW }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[15px] font-bold text-ink-strong">{RELATION_LABEL[rel]}</span>
                      <span
                        className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold tabular-nums"
                        style={{ background: `color-mix(in srgb, ${ACCENT} 9%, transparent)`, color: ACCENT_DEEP }}
                      >
                        {list.length} {list.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {list.map((r) => (
                        <ReviewRow key={r.id} review={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right column: goals + signals */}
          <aside className="space-y-6 wg-rise" style={{ animationDelay: "175ms" }}>
            {/* Personal goals */}
            <section>
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                Personal goals
              </h2>
              <div className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: CARD_SHADOW }}>
                {goals.length === 0 ? (
                  <p className="text-[14px] text-ink-muted">No personal goals captured yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {goals.map((g) => {
                      const done = g.status === "done";
                      const dropped = g.status === "dropped";
                      return (
                        <li key={g.id} className="flex items-start gap-3">
                          <span
                            className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                            style={{
                              background: done ? ACCENT : dropped ? "var(--color-hairline-strong)" : ACCENT_DEEP,
                            }}
                          >
                            {done ? "✓" : dropped ? "–" : g.position + 1}
                          </span>
                          <div className="min-w-0">
                            <div
                              className={`text-[14px] font-bold text-ink-strong ${dropped ? "line-through opacity-60" : ""}`}
                            >
                              {g.title}
                            </div>
                            {g.detail && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{g.detail}</p>}
                            <span className="mt-1 inline-block text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                              {g.period} · {g.status}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Recognition + promotion signals */}
            <section>
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                Signals
              </h2>
              <div className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: CARD_SHADOW }}>
                {signals.recognition.length === 0 && signals.promotion.length === 0 ? (
                  <p className="text-[14px] text-ink-muted">No recognition or promotion signals yet.</p>
                ) : (
                  <div className="space-y-4">
                    {signals.recognition.map((r) => {
                      const c = statusChip(r.status);
                      return (
                        <div key={r.id} className="flex items-start gap-3">
                          <Award size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: ACCENT_DEEP }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-bold text-ink-strong">{r.kind}</span>
                              <span
                                className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                                style={{ color: c.color, background: c.bg }}
                              >
                                {r.status}
                              </span>
                            </div>
                            {r.reason && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{r.reason}</p>}
                            <span className="mt-0.5 inline-block text-[11px] font-semibold text-ink-subtle">
                              {r.period}
                              {r.scoreSnapshot != null && ` · score ${Math.round(r.scoreSnapshot)}`}
                              {r.releasedAt && ` · released ${fmtDate(r.releasedAt)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {signals.promotion.map((p) => {
                      const c = statusChip(p.status);
                      return (
                        <div key={p.id} className="flex items-start gap-3">
                          <Flag size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: ACCENT_DEEP }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-bold text-ink-strong">Promotion signal</span>
                              <span
                                className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                                style={{ color: c.color, background: c.bg }}
                              >
                                {p.status}
                              </span>
                            </div>
                            {p.rationale && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{p.rationale}</p>}
                            <span className="mt-0.5 inline-block text-[11px] font-semibold text-ink-subtle">
                              {p.scoreSnapshot != null && `score ${Math.round(p.scoreSnapshot)}`}
                              {p.eligibleSince && ` · since ${fmtDate(p.eligibleSince)}`}
                              {p.decidedAt && ` · decided ${fmtDate(p.decidedAt)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

/** One review entry: reviewer + date, the three 1–5 ratings, change tags + note. */
function ReviewRow({ review }: { review: DetailReview }) {
  const dims: { label: string; value: number | null }[] = [
    { label: "Attitude", value: review.attitude },
    { label: "Behaviour", value: review.behaviour },
    { label: "Skill", value: review.skill },
  ];
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "color-mix(in srgb, var(--color-surface-soft) 40%, transparent)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={2.4} style={{ color: ACCENT_DEEP }} />
          <span className="text-[13.5px] font-bold text-ink-strong">
            {review.reviewerName ?? "Reviewer"}
          </span>
          <span className="text-[12px] text-ink-subtle">· {review.period}</span>
        </div>
        <span
          className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
          style={{
            color: ACCENT_DEEP,
            background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
          }}
        >
          {review.scope}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        {dims.map((d) => (
          <div key={d.label} className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink-muted">{d.label}</span>
            <StarRating value={d.value} readOnly size={16} color={ACCENT} label={d.label} />
          </div>
        ))}
      </div>
      {review.changeTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.changeTags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill border border-hairline bg-white/60 px-2 py-0.5 text-[11.5px] font-semibold text-ink-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {review.explanation && (
        <p className="mt-2 text-[13.5px] leading-snug text-ink-muted">{review.explanation}</p>
      )}
    </div>
  );
}
