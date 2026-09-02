import Link from "next/link";
import type { Route } from "next";
import { ClipboardCheck, Sparkles, Target, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { MODULE_THEME } from "@/lib/module-theme";
import {
  reviewablePeople,
  getMyReview,
  listMyAuthoredReviews,
  listMyPersonalGoals,
  REVIEW_CHANGE_TAGS,
} from "@/lib/queries/pms-review";
import { ReviewForm, type ReviewPerson } from "@/components/pms/review/review-form";
import { PersonalGoalsEditor, type PersonalGoalRow } from "@/components/pms/review/personal-goals-editor";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400";

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

/** Current IST month as 'YYYY-MM' (UTC components shifted +5:30 == IST wall clock). */
function istPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const period = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { period, label };
}

export default async function PmsReviewPage() {
  const me = await requireUser();
  const { period, label } = istPeriod();

  const [scope, authored, myGoals] = await Promise.all([
    reviewablePeople({ id: me.id, managerId: me.managerId }),
    listMyAuthoredReviews(me.id, period),
    listMyPersonalGoals(me.id, period),
  ]);

  const doneKey = new Set(authored.map((a) => `${a.subjectId}:${a.relation}`));
  const flat = [...scope.manager, ...scope.subordinate, ...scope.peer];

  // Pre-fetch prior reviews for the subjects the user has already done, so the
  // form opens in edit mode for those. (Batched — bounded to the roster.)
  const priorEntries = await Promise.all(
    flat
      .filter((p) => doneKey.has(`${p.id}:${p.relation}`))
      .map(async (p) => {
        const r = await getMyReview(me.id, p.id, p.relation, period);
        return [p.id, r] as const;
      }),
  );
  const priorById = new Map(priorEntries);

  const people: ReviewPerson[] = flat.map((p) => {
    const prior = priorById.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      department: p.department,
      relation: p.relation,
      done: doneKey.has(`${p.id}:${p.relation}`),
      prior: prior
        ? {
            attitude: prior.attitude,
            behaviour: prior.behaviour,
            skill: prior.skill,
            changeTags: prior.changeTags ?? [],
            explanation: prior.explanation,
            scope: (prior.scope as "internal" | "external") ?? "internal",
          }
        : null,
    };
  });

  const goalRows: PersonalGoalRow[] = myGoals.map((g) => ({
    title: g.title,
    detail: g.detail ?? "",
    status: (g.status as PersonalGoalRow["status"]) ?? "active",
  }));

  const reviewedCount = people.filter((p) => p.done).length;
  const reviewProgress = people.length > 0 ? reviewedCount / people.length : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero ── */}
        <header
          className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
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
                <ClipboardCheck size={13} strokeWidth={2.6} /> Employees · Monthly 360
              </span>
              <h1
                className="mt-3 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(28px,3.4vw,44px)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                }}
              >
                Monthly Review
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                Rate the people you work with on Attitude, Behaviour and Skill (3–5) for {label}. Your
                ratings feed the Attitude and Team-Work pillars of each person&apos;s PMS score — set
                your own three personal goals below.
              </p>

              {/* Review progress — folded over the loaded roster */}
              {reviewProgress != null && (
                <div className="mt-4 flex items-center gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-[13px] font-bold tabular-nums"
                    style={{ color: reviewedCount === people.length ? ACCENT_DEEP : "var(--color-ink-muted)" }}
                  >
                    <CheckCircle2 size={15} strokeWidth={2.4} />
                    {reviewedCount} of {people.length} reviewed
                  </span>
                  <div
                    className="h-1.5 w-44 overflow-hidden rounded-full max-sm:w-28"
                    style={{ background: "var(--color-hairline)" }}
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(2, reviewProgress * 100)}%`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${ACCENT} 75%, #fff), ${ACCENT})`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <Link
              href={"/pms" as Route}
              className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white whitespace-nowrap"
              style={{
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
                boxShadow: `0 10px 24px -12px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            >
              <Target size={16} strokeWidth={2.4} /> View Scores
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-[1.6fr_1fr] gap-5 max-lg:grid-cols-1">
          {/* 360 review workspace */}
          <section
            className="wg-rise rounded-2xl bg-surface-card p-6 max-md:p-4"
            style={{ animationDelay: "0ms", boxShadow: CARD_SHADOW }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                className="text-[19px] text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                360 Review
              </h2>
              {people.length > 0 && (
                <span
                  className="rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
                  style={{ background: `color-mix(in srgb, ${ACCENT} 9%, transparent)`, color: ACCENT_DEEP }}
                >
                  {reviewedCount} of {people.length} done
                </span>
              )}
            </div>
            <ReviewForm
              people={people}
              changeTags={REVIEW_CHANGE_TAGS}
              period={period}
              periodLabel={label}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </section>

          {/* Personal goals */}
          <section
            className="wg-rise h-fit rounded-2xl bg-surface-card p-6 max-md:p-4"
            style={{ animationDelay: "35ms", boxShadow: CARD_SHADOW }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span
                className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
                style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT }}
              >
                <Sparkles size={17} strokeWidth={2.4} />
              </span>
              <h2
                className="text-[19px] text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                My Personal Goals
              </h2>
            </div>
            <p className="mb-4 text-[13.5px] text-ink-muted" style={{ maxWidth: "44ch" }}>
              Three non-work goals for {label} — yours to track and reflect on.
            </p>
            <PersonalGoalsEditor
              initial={goalRows}
              period={period}
              periodLabel={label}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </section>
        </div>
      </main>
    </>
  );
}
