"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeIndianRupee,
  ChevronLeft,
  FileText,
  Loader2,
  Minus,
  Target,
  Users,
  UsersRound,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { formatDMonY, formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import {
  fetchIncentiveAnalytics,
  setMyIncentivePeriodTarget,
  setMyIncentiveTarget,
} from "@/app/(app)/incentive/analytics-actions";
import {
  INCENTIVE_GRADE_BANDS,
  type RankMovement,
} from "@/lib/incentive/analytics/grading";
import {
  PERIOD_KINDS,
  PERIOD_LABELS,
  addMonths,
  addQuarters,
  currentMonthKey,
  currentQuarterKey,
  formatMonthKey,
  formatQuarterKey,
  type PeriodKind,
} from "@/lib/incentive/analytics/periods";
import type {
  AnalyticsView,
  EmployeePerformance,
  IncentiveAnalytics,
  StatusKey,
  StatusRecord,
  TargetWarning,
} from "@/lib/incentive/analytics/model";
import { GradeBadge, IncentiveBadge } from "../ui/badges";
import { IncentiveSection, Segmented } from "../ui/chrome";
import { IncentiveKpi, IncentiveKpiRow } from "../ui/kpi";
import { IncentiveEmptyState } from "../ui/states";
import { GRADE_TONE, SUMMARY_TONE, toneBase, toneFill, toneInk, type Tone } from "../ui/tone";
import { PeriodProgress } from "./period-progress";

/**
 * INCENTIVE DASHBOARD — the view.
 *
 * Renders what `buildIncentiveAnalytics` returned; it does no incentive
 * arithmetic of its own. Changing the period asks the server for a fresh
 * result (`fetchIncentiveAnalytics`), which re-applies the viewer's scope — the
 * browser never holds data it was not allowed.
 *
 * ── THE 2026-09-24 RESTRUCTURE ─────────────────────────────────────────────
 * The reading order is now one question per band, all measured over the SAME
 * window:
 *
 *   [Target warning]                the only thing here that is an action
 *   [Team/User · Period · Target]   whose figures, over what span, and the
 *                                   period-aware target control
 *   [EIGHT KPI cards]               Grade · % of CTC · six status buckets —
 *                                   ONE band, click a bucket to drill
 *   [Team summary]                  headcount, earnings, target, grade spread
 *   [Grade report ⇄ the drilled status]
 *   [Trends]                        passed in, and deliberately last
 *
 * THE "YOUR PERFORMANCE" BAND IS GONE. It was a full-width strip running
 * Grade / Incentive / % of CTC / Rank / Target-vs-actual across the page, and
 * the two figures people actually scan for — grade and % of CTC — now sit in
 * the KPI band as cards. Rank and target-vs-actual are columns of the grade
 * report directly below, so nothing was lost, only un-duplicated. The one thing
 * it uniquely held, the incentive breakup letter link, moved into the control
 * row rather than rebuilding the band around it.
 */

const VIEW_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

const PERIOD_OPTIONS = PERIOD_KINDS.map((k) => ({ value: k, label: PERIOD_LABELS[k] }));

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

export function IncentiveAnalyticsDashboard({
  initial,
  months,
  quarters,
  years,
  viewEmployeeId,
  trends,
}: {
  initial: IncentiveAnalytics;
  /** Months the "Specific Month" picker offers, newest first (server-built). */
  months: string[];
  /** Quarters the "Specific Quarter" picker offers, newest first (server-built). */
  quarters: string[];
  /** Years the "Specific Year" picker offers, newest first (server-built). */
  years: string[];
  /**
   * The employee being VIEWED, "" when that is the viewer themselves.
   *
   * Carried on every period fetch below. Without it, changing the period would
   * quietly drop back to the viewer's own figures — the fetch re-resolves the
   * scope from the session, and the session does not know about `?emp=`. Sent
   * down already validated, so the browser cannot ask for anybody the server
   * refused.
   */
  viewEmployeeId: string;
  /** The company year overview, for viewers entitled to it. Rendered last. */
  trends?: React.ReactNode;
}) {
  const [data, setData] = React.useState(initial);
  const [kind, setKind] = React.useState<PeriodKind>(initial.period.kind);
  const [month, setMonth] = React.useState<string>(
    initial.period.kind === "month" ? initial.period.months[0]! : (months[1] ?? months[0] ?? ""),
  );
  const [quarter, setQuarter] = React.useState<string>(() => {
    // A quarter's months are its own three, so the picker opens on the quarter
    // the dashboard is actually showing rather than on "now".
    if (initial.period.kind === "quarter" && initial.period.months[0]) {
      const [y, m] = initial.period.months[0].split("-").map(Number) as [number, number];
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    }
    return quarters[1] ?? quarters[0] ?? currentQuarterKey();
  });
  const [year, setYear] = React.useState<string>(() => {
    // Same rule as the quarter picker: open on the year actually being shown,
    // so the control never disagrees with the figures beside it.
    if (initial.period.kind === "year" && initial.period.months[0]) {
      return initial.period.months[0].slice(0, 4);
    }
    return years[0] ?? currentMonthKey().slice(0, 4);
  });
  const [view, setView] = React.useState<AnalyticsView>(initial.scope.view);
  const [active, setActive] = React.useState<StatusKey | null>(null);
  const [pending, startTransition] = React.useTransition();

  /**
   * Whether to offer the Team / User switch at all. Decided on the SERVER
   * (`applyAnalyticsView`) from the viewer's own entitlement, not guessed here:
   * someone with no direct reports has no team to show, and an admin always
   * does. Hidden rather than disabled, which is how this app treats a door that
   * is not yours — the hub hides rooms you cannot enter rather than greying
   * them out.
   */
  const canSwitchView = data.scope.canSeeTeam;

  function load(next: {
    kind: PeriodKind;
    month?: string;
    quarter?: string;
    year?: string;
    view?: AnalyticsView;
  }) {
    const nextKind = next.kind;
    const shownKind = data.period.kind;
    const shownView = data.scope.view;
    setKind(nextKind);
    if (next.month) setMonth(next.month);
    if (next.quarter) setQuarter(next.quarter);
    if (next.year) setYear(next.year);
    if (next.view) setView(next.view);
    startTransition(async () => {
      // On any failure the selector snaps back to the period actually on screen,
      // so the buttons never claim a period whose numbers are not shown.
      const fail = (message: string) => {
        setKind(shownKind);
        setView(shownView);
        fireToast({ message, type: "error" });
      };
      try {
        const res = await fetchIncentiveAnalytics({
          kind: nextKind,
          month: nextKind === "month" ? (next.month ?? month) : null,
          quarter: nextKind === "quarter" ? (next.quarter ?? quarter) : null,
          year: nextKind === "year" ? (next.year ?? year) : null,
          view: next.view ?? view,
          // Whose figures, for every period change as well as the first paint.
          emp: viewEmployeeId || null,
        });
        if (!res.ok) return fail(res.error);
        setData(res.data);
      } catch {
        fail("The incentive dashboard couldn't load just now — please try again.");
      }
    });
  }

  const activeCard = active ? data.statuses.find((s) => s.key === active) ?? null : null;

  /**
   * IS THE TEAM SUMMARY SHOWING ANYBODY BESIDES THE VIEWER?
   *
   * NOTE: the "Your performance" strip that used to be gated on the same
   * question is GONE — Grade and % of CTC are two cards in the KPI band above,
   * which is where the brief puts them and where they no longer read as a
   * separate band claiming the whole company earned one person's figures.
   */
  const teamCount = data.employees.length > (data.me ? 1 : 0);

  return (
    <div className="space-y-3" data-incentive-analytics aria-busy={pending}>
      {data.targetWarning && (data.targetWarning.missingCurrent || data.targetWarning.missingNext) && (
        <TargetWarningBar warning={data.targetWarning} onSaved={() => load({ kind, month })} />
      )}

      {/* ── Control row: whose figures, then over what span ── */}
      <div className="space-y-2 rounded-2xl border border-hairline bg-surface-card px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {canSwitchView && (
            <Segmented
              ariaLabel="Whose incentive data"
              options={VIEW_OPTIONS}
              value={view}
              disabled={pending}
              onChange={(v) =>
                load({ kind, month: kind === "month" ? month : undefined, quarter, year, view: v })
              }
            />
          )}
          <Segmented
            ariaLabel="Period"
            options={PERIOD_OPTIONS}
            value={kind}
            disabled={pending}
            onChange={(k) =>
              load({ kind: k, month: k === "month" ? month : undefined, quarter, year })
            }
          />
          {/* The month / quarter pickers are the two controls people actually
              click on this row, so they are a size up from the segments beside
              them: taller, wider padding, larger text. */}
          {kind === "month" && (
            <select
              aria-label="Month"
              value={month}
              disabled={pending}
              onChange={(e) => load({ kind: "month", month: e.target.value })}
              className="h-11 min-w-[168px] rounded-pill border border-hairline-strong bg-surface-card px-4 text-[13.5px] font-bold text-ink-strong outline-none transition-colors hover:border-ink-subtle focus:border-altus-red"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m)}
                </option>
              ))}
            </select>
          )}
          {kind === "quarter" && (
            <select
              aria-label="Quarter"
              value={quarter}
              disabled={pending}
              onChange={(e) => load({ kind: "quarter", quarter: e.target.value })}
              className="h-11 min-w-[168px] rounded-pill border border-hairline-strong bg-surface-card px-4 text-[13.5px] font-bold text-ink-strong outline-none transition-colors hover:border-ink-subtle focus:border-altus-red"
            >
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {formatQuarterKey(q)}
                </option>
              ))}
            </select>
          )}
          {/* THE WHOLE CALENDAR YEAR, twelve months — not the same control as
              "YTD", which runs January to today. Both are kept: YTD answers
              "how is this year going", this answers "what did that year do". */}
          {kind === "year" && (
            <select
              aria-label="Year"
              value={year}
              disabled={pending}
              onChange={(e) => load({ kind: "year", year: e.target.value })}
              className="h-11 min-w-[168px] rounded-pill border border-hairline-strong bg-surface-card px-4 text-[13.5px] font-bold tabular-nums text-ink-strong outline-none transition-colors hover:border-ink-subtle focus:border-altus-red"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <span
            className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle"
            data-period-label
          >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {data.period.label}
            <span aria-hidden>·</span>
            <Users size={13} aria-hidden />
            {data.scope.label}
            {/* The employee's own document. It used to live in the "Your
                performance" band, which is gone — this keeps it reachable
                without rebuilding that band. Same href as before; the route
                re-checks ownership itself, so this is a door, not the lock. */}
            {data.scope.viewerId && (
              <a
                href={`/salary/incentive-breakup/${data.scope.viewerId}?view=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
              >
                <FileText size={13} strokeWidth={2.4} aria-hidden />
                Breakup letter
              </a>
            )}
          </span>
        </div>

        {/* ── Set Incentive Target — period-aware (migration 0250) ──
            In the SAME card as the period controls rather than a band of its
            own: it is a control, not a summary, and the brief rules out a
            second information band under the KPIs. */}
        <SetTargetControl disabled={pending} onSaved={() => load({ kind, month, quarter, year })} />
      </div>

      {/* ── KPI band: six status buckets + the viewer's own Grade and % of CTC.
             ONE band, per the brief — the personal figures that used to sit in
             a separate "Your performance" strip are now two cards in it. ── */}
      <section
        aria-label="Incentive status summary"
        className={cn("transition-opacity", pending && "opacity-60")}
      >
        <IncentiveKpiRow cols={8}>
          <div className="contents" data-kpi-card="grade">
            <IncentiveKpi
              label="Grade"
              value={data.me?.grade ?? "—"}
              caption={
                data.me?.grade
                  ? (GRADE_BAND_LABEL[data.me.grade] ?? "Your grade")
                  : (data.me ? ctcReason(data.me) : "") || "Not graded"
              }
              tone={data.me?.grade ? GRADE_TONE[data.me.grade] : "slate"}
            />
          </div>
          <div className="contents" data-kpi-card="pct-of-ctc">
            <IncentiveKpi
              label="% of CTC"
              value={pct(data.me?.pctOfCtc ?? null)}
              caption="Your incentive, as a share of CTC"
              tone="blue"
              progress={data.me?.pctOfCtc != null ? data.me.pctOfCtc / 100 : null}
            />
          </div>
          {data.statuses.map((s) => (
            <div key={s.key} data-status-card={s.key} className="contents">
              <StatusKpi
                label={s.label}
                value={formatInr(s.amount)}
                count={s.count}
                unvaluedCount={s.unvaluedCount}
                tone={SUMMARY_TONE[s.key] ?? "slate"}
                selected={active === s.key}
                onClick={() => setActive(active === s.key ? null : s.key)}
              />
            </div>
          ))}
        </IncentiveKpiRow>
      </section>

      {/* ── Target vs Actual, and the shape of the period ──
          Directly under the KPI band. A company or team viewer already has the
          totals in the Team summary below; somebody viewing their OWN dashboard
          has no team, so that summary is not drawn for them and Target, Actual
          and Attainment would not appear as figures anywhere on the page. This
          is where they live, with the bar that relates them and the months that
          did the work. Collapses to one line when the period holds nothing —
          see PeriodProgress. */}
      <PeriodProgress
        label={data.period.label}
        scopeLabel={data.scope.label}
        earned={data.summary.earned}
        target={data.summary.target}
        difference={data.summary.target === null ? null : data.summary.earned - data.summary.target}
        monthly={data.monthly}
      />

      {/* ── Performance ── */}
      {teamCount && <TeamSummary data={data} />}

      {/* ── Detail ── */}
      <IncentiveSection
        bare
        className={cn("transition-opacity", pending && "opacity-60")}
      >
        {activeCard ? (
          <div>
            <header className="mb-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-bold text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
              >
                <ChevronLeft size={15} aria-hidden /> Grade report
              </button>
              <h2
                className="text-[16px] font-extrabold text-ink-strong"
                data-detail-title
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800 }}
              >
                {activeCard.label} · {activeCard.count}{" "}
                {activeCard.count === 1 ? "entry" : "entries"} · {formatInr(activeCard.amount)}
              </h2>
              <span className="text-[12.5px] text-ink-subtle">{data.period.label}</span>
            </header>
            <StatusTable
              status={activeCard.key}
              label={activeCard.label}
              period={data.period.label}
              records={data.records.filter((r) => r.statuses.includes(activeCard.key))}
            />
          </div>
        ) : (
          <div>
            <header className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 16,
                  letterSpacing: "-0.01em",
                }}
              >
                Employee Grade Report
              </h2>
              <span className="text-[12.5px] text-ink-subtle">
                {data.period.label} · ranked by incentive % of CTC ·{" "}
                {INCENTIVE_GRADE_BANDS.map((b) => `${b.grade} ${b.label.replace(" of CTC", "")}`).join(" · ")}
              </span>
            </header>
            <GradeReport data={data} />
          </div>
        )}
      </IncentiveSection>

      {/* ── Trends — company-wide, and deliberately below the table that
          answers the daily question. ── */}
      {trends}
    </div>
  );
}

/** One clickable status bucket, drawn as a compact KPI card. */
function StatusKpi({
  label,
  value,
  count,
  unvaluedCount = 0,
  tone,
  selected = false,
  onClick,
}: {
  label: string;
  value: string;
  /** Rows in this bucket — the card's second figure. */
  count: number;
  /** Rows in the bucket whose amount is still blank. */
  unvaluedCount?: number;
  tone: Tone;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      /* Compact: this band now carries EIGHT cards (six buckets + Grade +
         % of CTC), so each is shorter and slightly tighter than the six that
         used to have the row to themselves. Same parts, less air. */
      className="flex min-h-[92px] cursor-pointer flex-col justify-between rounded-2xl border bg-surface-card px-3.5 py-2 text-left transition-colors hover:bg-surface-soft"
      style={{
        borderColor: selected ? toneBase(tone) : "var(--color-hairline)",
        borderWidth: selected ? 1.5 : 1,
      }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: toneBase(tone) }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
      </span>
      <span
        className="tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(17px, 1.25vw, 21px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[11.5px] font-bold text-ink-soft tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
        {unvaluedCount > 0 && (
          <span className="text-[11px] font-medium text-ink-subtle">{unvaluedCount} amount not set</span>
        )}
      </span>
    </button>
  );
}

// ── Target warning ────────────────────────────────────────────────────────────

function TargetWarningBar({ warning, onSaved }: { warning: TargetWarning; onSaved: () => void }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [saving, startSaving] = React.useTransition();

  const message =
    warning.missingCurrent && warning.missingNext
      ? "Please fill your incentive target for this month and next month."
      : warning.missingCurrent
        ? `Please fill your incentive target for this month (${formatMonthKey(warning.currentMonth)}).`
        : `Please fill your incentive target for next month (${formatMonthKey(warning.nextMonth)}).`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const entries: { month: string; raw: string }[] = [];
    if (warning.missingCurrent && current) entries.push({ month: warning.currentMonth, raw: current });
    if (warning.missingNext && next) entries.push({ month: warning.nextMonth, raw: next });
    if (entries.length === 0) {
      fireToast({ message: "Enter a target amount first.", type: "error" });
      return;
    }
    startSaving(async () => {
      for (const t of entries) {
        const res = await setMyIncentiveTarget({ month: t.month, amount: Number(t.raw) });
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
      }
      fireToast({ message: "Target saved." });
      setCurrent("");
      setNext("");
      onSaved();
    });
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 10);

  return (
    <div
      role="alert"
      data-target-warning
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5"
      style={{
        background: "color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card))",
        border: "1px solid color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
        color: "var(--color-altus-red-deep)",
      }}
    >
      <p className="flex items-center gap-2 text-[13.5px] font-bold">
        <AlertTriangle size={16} aria-hidden />
        {message}
      </p>
      <form onSubmit={save} className="ml-auto flex flex-wrap items-center gap-2">
        {warning.missingCurrent && (
          <TargetInput
            month={warning.currentMonth}
            value={current}
            onChange={(v) => setCurrent(digits(v))}
          />
        )}
        {warning.missingNext && (
          <TargetInput month={warning.nextMonth} value={next} onChange={(v) => setNext(digits(v))} />
        )}
        <button
          type="submit"
          disabled={saving}
          className="pastel-cta inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12.5px] font-bold disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save target"}
        </button>
      </form>
    </div>
  );
}

function TargetInput({
  month,
  value,
  onChange,
}: {
  month: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] font-bold">
      {formatMonthKey(month)}
      <span className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px]">₹</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Target for ${formatMonthKey(month)}`}
          className="h-8 w-28 rounded-pill border bg-surface-card pl-5 pr-2 text-[13px] font-semibold text-ink-strong outline-none focus:border-altus-red"
          style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 34%, transparent)" }}
        />
      </span>
    </label>
  );
}

// ── Performance ───────────────────────────────────────────────────────────────

function Movement({
  movement,
  previous,
  rank,
}: {
  movement: RankMovement;
  previous: number | null;
  rank: number | null;
}) {
  switch (movement.kind) {
    case "up":
      return (
        <span
          className="inline-flex items-center gap-0.5 text-[12px] font-bold"
          style={{ color: toneInk("green") }}
          title={`Was #${previous}`}
        >
          <ArrowUp size={12} aria-hidden />
          {previous} → {rank}
        </span>
      );
    case "down":
      return (
        <span
          className="inline-flex items-center gap-0.5 text-[12px] font-bold"
          style={{ color: toneInk("red") }}
          title={`Was #${previous}`}
        >
          <ArrowDown size={12} aria-hidden />
          {previous} → {rank}
        </span>
      );
    case "same":
      return (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-subtle">
          <Minus size={12} aria-hidden /> no change
        </span>
      );
    case "new":
      return <span className="text-[12px] font-semibold text-ink-subtle">newly ranked</span>;
    default:
      return <span className="text-[12px] text-ink-subtle">—</span>;
  }
}

function ctcReason(p: EmployeePerformance): string {
  if (p.ctcState === "missing") return "No CTC on record";
  if (p.ctcState === "not_employed") return "Joined after this period";
  if (p.ctcState === "restricted") return "Restricted";
  return "";
}

/**
 * SET INCENTIVE TARGET — period-aware (migration 0250).
 *
 * One dropdown picks the KIND of period (this month / a named month / a named
 * quarter / a named year); the control beside it offers the values for that
 * kind and nothing else. The year option writes the January row, which is the
 * convention `setIncentiveYearTarget` has always used, so a year target keeps
 * summing into YTD exactly as before.
 *
 * The server refuses anything it should not accept — a period that has already
 * ended, or a second target for a period that already has one — and the error
 * comes back as a toast. This control does not decide any of that; it only
 * narrows what is easy to ask for.
 */
const TARGET_KIND_OPTIONS = [
  { value: "this_month" as const, label: "This Month" },
  { value: "month" as const, label: "Specific Month" },
  { value: "quarter" as const, label: "Specific Quarter" },
  { value: "year" as const, label: "Specific Year" },
];

type TargetKind = (typeof TARGET_KIND_OPTIONS)[number]["value"];

/** The next `count` months, current first — target planning looks FORWARD. */
function forwardMonths(count = 13): string[] {
  const cur = currentMonthKey();
  return Array.from({ length: count }, (_, i) => addMonths(cur, i));
}

/** The next `count` quarters, current first. */
function forwardQuarters(count = 5): string[] {
  const cur = currentQuarterKey();
  return Array.from({ length: count }, (_, i) => addQuarters(cur, i));
}

/** The current year and the next two. */
function forwardYears(count = 3): string[] {
  const y = Number(currentMonthKey().slice(0, 4));
  return Array.from({ length: count }, (_, i) => String(y + i));
}

function SetTargetControl({
  disabled,
  onSaved,
}: {
  disabled: boolean;
  onSaved: () => void;
}) {
  const [kind, setKind] = React.useState<TargetKind>("this_month");
  const [month, setMonth] = React.useState(currentMonthKey());
  const [quarter, setQuarter] = React.useState(currentQuarterKey());
  const [year, setYear] = React.useState(currentMonthKey().slice(0, 4));
  const [amount, setAmount] = React.useState("");
  const [saving, startSaving] = React.useTransition();

  const value =
    kind === "month" ? month : kind === "quarter" ? quarter : kind === "year" ? year : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      fireToast({ message: "Enter a target amount first.", type: "error" });
      return;
    }
    startSaving(async () => {
      const res = await setMyIncentivePeriodTarget({ kind, value, amount: n });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Target saved.", type: "success" });
      setAmount("");
      onSaved();
    });
  }

  const selectClass =
    "h-11 rounded-pill border border-hairline-strong bg-surface-card px-4 text-[13.5px] font-bold text-ink-strong outline-none transition-colors hover:border-ink-subtle focus:border-altus-red";

  return (
    <form
      onSubmit={save}
      data-set-incentive-target
      className="flex flex-wrap items-center gap-2 border-t pt-2.5"
      style={{ borderColor: "var(--color-hairline)" }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        Set Incentive Target
      </span>
      <select
        aria-label="Target period kind"
        value={kind}
        disabled={disabled || saving}
        onChange={(e) => setKind(e.target.value as TargetKind)}
        className={selectClass}
      >
        {TARGET_KIND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {kind === "month" && (
        <select
          aria-label="Target month"
          value={month}
          disabled={disabled || saving}
          onChange={(e) => setMonth(e.target.value)}
          className={selectClass}
        >
          {forwardMonths().map((m) => (
            <option key={m} value={m}>
              {formatMonthKey(m)}
            </option>
          ))}
        </select>
      )}
      {kind === "quarter" && (
        <select
          aria-label="Target quarter"
          value={quarter}
          disabled={disabled || saving}
          onChange={(e) => setQuarter(e.target.value)}
          className={selectClass}
        >
          {forwardQuarters().map((q) => (
            <option key={q} value={q}>
              {formatQuarterKey(q)}
            </option>
          ))}
        </select>
      )}
      {kind === "year" && (
        <select
          aria-label="Target year"
          value={year}
          disabled={disabled || saving}
          onChange={(e) => setYear(e.target.value)}
          className={selectClass}
        >
          {forwardYears().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
      <input
        inputMode="numeric"
        value={amount}
        disabled={disabled || saving}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
        aria-label="Target amount"
        placeholder="Target amount"
        className="h-11 w-[160px] rounded-pill border border-hairline-strong bg-surface-card px-4 text-[13.5px] font-bold tabular-nums text-ink-strong outline-none focus:border-altus-red"
      />
      <button
        type="submit"
        disabled={disabled || saving}
        className="pastel-cta h-11 rounded-pill px-4 text-[13.5px] font-bold disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Target"}
      </button>
    </form>
  );
}

/**
 * Headcount, earnings, target and the grade spread for whoever is in view.
 *
 * This is the bar you read first when the dashboard opens, so it is set at
 * scanning size rather than inline size: a fixed four-column arrangement on a
 * wide screen (Employees · Incentive · Target · Grades) with a hairline rule
 * before the grade spread, instead of a left-clustered flex row that left the
 * right half of the card empty. Same four figures, same components — only the
 * type scale, the spacing and the arrangement changed.
 */
/** The band's own sentence ("Above 20% of CTC") — read from the one band table
 *  so a threshold change cannot leave a caption lying. */
const GRADE_BAND_LABEL: Record<string, string> = Object.fromEntries(
  INCENTIVE_GRADE_BANDS.map((b) => [b.grade, b.label]),
);

function TeamSummary({ data }: { data: IncentiveAnalytics }) {
  const g = data.summary.grades;
  const totalGraded = g.A + g.B + g.C + g.D;
  const share = (n: number) => (totalGraded > 0 ? n / totalGraded : null);
  return (
    <section aria-label="Team summary" data-team-summary className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {data.scope.all ? "All employees" : "Your team"}
        </h3>
        {g.none > 0 && (
          <span className="text-[12.5px] font-medium text-ink-subtle">
            {g.none} {g.none === 1 ? "person" : "people"} without CTC — no grade, no % of CTC
          </span>
        )}
      </div>

      {/*
        SEVEN CARDS, ONE GRID, ONE SIZE. The figures that were a single wide
        card — employees, incentive, target, then a row of grade badges — are
        the dashboard's headline numbers, and a reader compares them across the
        same edge. Every card is the module's own IncentiveKpi, so the band
        cannot drift from the status band above it or the Accounts band below.
        A/B/C/D each carry their share of the graded people as the bar, which is
        the one thing the badges never showed: a grade count with nothing to
        measure it against.

        CTC is deliberately NOT one of them: it is not a company figure, it is
        the denominator behind "% of CTC", and it already appears as that
        percentage in Your performance and as a column in the grade report.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <IncentiveKpi
          label="All Employees"
          value={String(data.summary.people)}
          caption={data.scope.all ? "Everyone in the company" : "You and your team"}
          tone="slate"
          icon={<UsersRound size={12} strokeWidth={2.6} />}
        />
        <IncentiveKpi
          label="Incentive Amount"
          value={formatInr(data.summary.earned)}
          caption="Earned in this period"
          tone="green"
          icon={<BadgeIndianRupee size={12} strokeWidth={2.6} />}
        />
        <IncentiveKpi
          label="Target"
          value={data.summary.target === null ? "Not set" : formatInr(data.summary.target)}
          caption={data.summary.target === null ? "No target for this period" : "Across the same people"}
          tone="blue"
          icon={<Target size={12} strokeWidth={2.6} />}
        />
        {(["A", "B", "C", "D"] as const).map((k) => (
          <IncentiveKpi
            key={k}
            label={`Grade ${k}`}
            value={String(g[k])}
            caption={GRADE_BAND_LABEL[k] ?? ""}
            tone={k === "A" ? "green" : k === "B" ? "blue" : k === "C" ? "amber" : "red"}
            progress={share(g[k])}
          />
        ))}
      </div>
    </section>
  );
}

// ── Tables ────────────────────────────────────────────────────────────────────

/**
 * THE GRADE REPORT — eight columns, each with a floor width.
 *
 * Every column carries a `min-w-*` and `whitespace-nowrap`, and the table's own
 * `min-w-[640px]` sits on the scroll container, so a narrow window scrolls the
 * table sideways instead of squeezing "Incentive Earned" into two lines and
 * "Rank" into three characters. Header and value share the one `className`, so
 * a column can never be wider in the head than in the body.
 */
const G = {
  employee: "min-w-[190px]",
  ctc: "min-w-[128px] whitespace-nowrap",
  earned: "min-w-[140px] whitespace-nowrap",
  pct: "min-w-[108px] whitespace-nowrap",
  grade: "min-w-[92px] whitespace-nowrap",
  rank: "min-w-[132px] whitespace-nowrap",
  target: "min-w-[128px] whitespace-nowrap",
  difference: "min-w-[148px] whitespace-nowrap",
} as const;

function GradeReport({ data }: { data: IncentiveAnalytics }) {
  const columns: DataTableColumn<EmployeePerformance>[] = [
    {
      key: "employee",
      label: "Employee",
      className: G.employee,
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-[13.5px] font-bold text-ink-strong">
            {p.name}
            {p.isSelf && <span className="ml-1.5 text-[11px] font-bold uppercase text-ink-subtle">You</span>}
          </span>
          {p.code && <span className="text-[12px] text-ink-subtle">{p.code}</span>}
        </span>
      ),
    },
    {
      key: "ctc",
      label: "CTC (period)",
      className: G.ctc,
      align: "right",
      sortValue: (p) => p.ctc ?? -1,
      render: (p) =>
        p.ctc !== null ? (
          <span className="text-[13px] tabular-nums">{formatInr(p.ctc)}</span>
        ) : (
          <span
            className="text-[12.5px] text-ink-subtle"
            title={
              p.ctcState === "restricted"
                ? "CTC is visible only to the employee and to admins."
                : undefined
            }
          >
            {ctcReason(p)}
          </span>
        ),
    },
    {
      key: "earned",
      label: "Incentive Earned",
      className: G.earned,
      align: "right",
      sortValue: (p) => p.earned,
      render: (p) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(p.earned)}</span>
      ),
    },
    {
      key: "pct",
      label: "% of CTC",
      className: G.pct,
      align: "right",
      sortValue: (p) => p.pctOfCtc ?? -1,
      render: (p) => <span className="text-[13px] tabular-nums">{pct(p.pctOfCtc)}</span>,
    },
    {
      key: "grade",
      label: "Grade",
      className: G.grade,
      sortValue: (p) => (p.grade ? GRADE_SORT[p.grade] : 0),
      render: (p) => <GradeBadge grade={p.grade} />,
    },
    {
      key: "rank",
      label: "Rank",
      className: G.rank,
      sortValue: (p) => p.rank ?? Number.MAX_SAFE_INTEGER,
      render: (p) => (
        <span className="flex flex-col">
          <span className="text-[13px] font-bold tabular-nums text-ink-strong">
            {p.rank === null ? "—" : `#${p.rank}`}
          </span>
          <Movement movement={p.movement} previous={p.previousRank} rank={p.rank} />
        </span>
      ),
    },
    {
      key: "target",
      label: "Target",
      className: G.target,
      align: "right",
      sortValue: (p) => p.target ?? -1,
      render: (p) =>
        p.target === null ? (
          <span className="text-[12.5px] text-ink-subtle">No target</span>
        ) : (
          <span className="text-[13px] tabular-nums">{formatInr(p.target)}</span>
        ),
    },
    {
      key: "difference",
      label: "Difference",
      className: G.difference,
      align: "right",
      sortValue: (p) => p.difference ?? Number.NEGATIVE_INFINITY,
      render: (p) =>
        p.difference === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: toneInk(p.difference < 0 ? "red" : "green") }}
          >
            {p.difference < 0
              ? `Deficit ${formatInr(-p.difference)}`
              : p.difference > 0
                ? `+${formatInr(p.difference)}`
                : "On target"}
          </span>
        ),
    },
  ];

  return (
    <DataTable
      rows={data.employees}
      columns={columns}
      getRowKey={(p) => p.employeeId}
      searchText={(p) => `${p.name} ${p.code ?? ""}`}
      searchPlaceholder="Local search — employee or code"
      initialSort={{ key: "rank", dir: "asc" }}
      stickyFirstColumn
      filters={[
        {
          label: "Grade",
          options: [
            { value: "A", label: "Grade A" },
            { value: "B", label: "Grade B" },
            { value: "C", label: "Grade C" },
            { value: "D", label: "Grade D" },
            { value: "none", label: "No grade" },
          ],
          match: (p, v) => (v === "none" ? p.grade === null : p.grade === v),
        },
        {
          label: "Target",
          options: [
            { value: "set", label: "Has a target" },
            { value: "none", label: "No target" },
            { value: "behind", label: "Behind target" },
            { value: "ahead", label: "At or above target" },
          ],
          match: (p, v) =>
            v === "set"
              ? p.target !== null
              : v === "none"
                ? p.target === null
                : v === "behind"
                  ? p.difference !== null && p.difference < 0
                  : p.difference !== null && p.difference >= 0,
        },
      ]}
      dense
      emptyState={
        <IncentiveEmptyState
          compact
          title="No active employees to show"
          body="Nobody in this scope is active for the selected period."
        />
      }
    />
  );
}

/** Grade order for sorting — A best. Not a threshold; the bands own those. */
const GRADE_SORT = { A: 4, B: 3, C: 2, D: 1 } as const;

function StatusTable({
  status,
  label,
  period,
  records,
}: {
  status: StatusKey;
  label: string;
  period: string;
  records: StatusRecord[];
}) {
  const shownAmount = (r: StatusRecord) =>
    status === "paid" ? r.paidAmount : status === "unpaid" ? r.unpaidAmount : r.amount;

  const columns: DataTableColumn<StatusRecord>[] = [
    {
      key: "employee",
      label: "Employee",
      sortValue: (r) => r.employeeLabel.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-[13.5px] font-bold text-ink-strong">{r.employeeLabel}</span>
          {r.employeeCodes && <span className="text-[12px] text-ink-subtle">{r.employeeCodes}</span>}
        </span>
      ),
    },
    {
      key: "type",
      label: "Incentive Type",
      sortValue: (r) => r.typeLabel.toLowerCase(),
      render: (r) => (
        <span className="flex flex-col">
          <span className="text-[13px] font-semibold text-ink-strong">{r.typeLabel}</span>
          {r.product && <span className="text-[12px] text-ink-subtle">Product: {r.product}</span>}
        </span>
      ),
    },
    {
      key: "date",
      label: "Incentive Date",
      sortValue: (r) => r.incentiveDate,
      render: (r) => (
        <span className="text-[13px] tabular-nums">
          {r.dateIsMonth ? formatMonthKey(r.incentiveDate.slice(0, 7)) : formatDMonY(r.incentiveDate)}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortValue: (r) => shownAmount(r) ?? -1,
      render: (r) => {
        const v = shownAmount(r);
        return v === null ? (
          <span
            className="text-[12.5px] text-ink-subtle"
            title="The Incentive Master has no per-request amount for this scheme."
          >
            Amount not set
          </span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(v)}</span>
            {r.source === "ledger" && (status === "paid" || status === "unpaid") && r.amount !== null && (
              <span className="text-[11.5px] text-ink-subtle">of {formatInr(r.amount)} approved</span>
            )}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => r.approvalLabel,
      render: (r) => <span className="text-[13px] font-semibold text-ink-soft">{r.approvalLabel}</span>,
    },
    {
      key: "payment",
      label: "Payment",
      sortValue: (r) => r.paymentLabel,
      render: (r) => <span className="text-[13px] text-ink-soft">{r.paymentLabel}</span>,
    },
  ];

  return (
    <DataTable
      rows={records}
      columns={columns}
      getRowKey={(r) => r.id}
      searchText={(r) =>
        `${r.employeeLabel} ${r.employeeCodes} ${r.typeLabel} ${r.product ?? ""} ${r.reviewerName ?? ""}`
      }
      searchPlaceholder="Local search — employee, type or product"
      initialSort={{ key: "date", dir: "desc" }}
      stickyFirstColumn
      dense
      pageSize={25}
      /* The review trail was the widest column on the table and is read rarely —
         it moves into the row, where the note is no longer truncated either. */
      renderRowDetail={(r) => <StatusRecordDetail record={r} />}
      emptyState={
        <IncentiveEmptyState
          compact
          title={`No ${label.toLowerCase()} incentives in ${period}`}
          body="Change the period or pick a different status card above."
        />
      }
    />
  );
}

function StatusRecordDetail({ record: r }: { record: StatusRecord }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Reviewed by</dt>
        <dd className="mt-0.5 font-semibold text-ink-soft">
          {r.reviewerName ?? "—"}
          {r.reviewedAt && ` · ${formatDMonY(r.reviewedAt)}`}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Approval</dt>
        <dd className="mt-0.5 font-semibold text-ink-soft">{r.approvalLabel}</dd>
      </div>
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Payment</dt>
        <dd className="mt-0.5 font-semibold text-ink-soft">{r.paymentLabel}</dd>
      </div>
      {r.reviewNote ? (
        <div className="sm:col-span-3">
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Note</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-ink-strong">{r.reviewNote}</dd>
        </div>
      ) : null}
      {r.amount !== null && (r.paidAmount !== null || r.unpaidAmount !== null) ? (
        <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-bold"
            style={{ background: toneFill("teal"), color: toneInk("teal") }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: toneBase("teal") }} />
            Paid {formatInr(r.paidAmount ?? 0)}
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-bold"
            style={{ background: toneFill("red"), color: toneInk("red") }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: toneBase("red") }} />
            Unpaid {formatInr(r.unpaidAmount ?? 0)}
          </span>
          <span className="text-[12.5px] text-ink-subtle">of {formatInr(r.amount)} approved</span>
        </div>
      ) : null}
    </dl>
  );
}
