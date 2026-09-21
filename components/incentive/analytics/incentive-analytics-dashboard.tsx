"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  FileText,
  Loader2,
  Minus,
  Users,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { formatDMonY, formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import { fetchIncentiveAnalytics, setMyIncentiveTarget } from "@/app/(app)/incentive/analytics-actions";
import {
  INCENTIVE_GRADE_BANDS,
  type RankMovement,
} from "@/lib/incentive/analytics/grading";
import {
  PERIOD_KINDS,
  PERIOD_LABELS,
  formatMonthKey,
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
import { IncentiveKpiRow } from "../ui/kpi";
import { IncentiveEmptyState } from "../ui/states";
import { SUMMARY_TONE, toneBase, toneFill, toneInk, type Tone } from "../ui/tone";

/**
 * INCENTIVE DASHBOARD — the view.
 *
 * Renders what `buildIncentiveAnalytics` returned; it does no incentive
 * arithmetic of its own. Changing the period asks the server for a fresh
 * result (`fetchIncentiveAnalytics`), which re-applies the viewer's scope — the
 * browser never holds data it was not allowed.
 *
 * ── THE 2026-09-16 RESTRUCTURE ─────────────────────────────────────────────
 * The reading order is now one question per band, all measured over the SAME
 * window:
 *
 *   [Target warning]                the only thing here that is an action
 *   [Team/User · Period]            whose figures, over what span
 *   [six status chips]              filters, not decoration — click to drill
 *   [Your performance]              only when the figures really are yours
 *   [Team summary]                  headcount, earnings, target, grade spread
 *   [Grade report ⇄ the drilled status]
 *   [Trends]                        passed in, and deliberately last
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
  trends,
}: {
  initial: IncentiveAnalytics;
  /** Months the "Specific Month" picker offers, newest first (server-built). */
  months: string[];
  /** The company year overview, for viewers entitled to it. Rendered last. */
  trends?: React.ReactNode;
}) {
  const [data, setData] = React.useState(initial);
  const [kind, setKind] = React.useState<PeriodKind>(initial.period.kind);
  const [month, setMonth] = React.useState<string>(
    initial.period.kind === "month" ? initial.period.months[0]! : (months[1] ?? months[0] ?? ""),
  );
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

  function load(nextKind: PeriodKind, nextMonth?: string, nextView?: AnalyticsView) {
    const shownKind = data.period.kind;
    const shownView = data.scope.view;
    setKind(nextKind);
    if (nextMonth) setMonth(nextMonth);
    if (nextView) setView(nextView);
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
          month: nextKind === "month" ? (nextMonth ?? month) : null,
          view: nextView ?? view,
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
   * IS "YOUR PERFORMANCE" ACTUALLY YOURS?
   *
   * A company-wide viewer looking at the Team view is reading the whole
   * company, and a personal grade card parked above those figures reads as if
   * the company earned it. So the personal block is shown when the viewer has
   * narrowed to themselves, or when their entitlement is their own line and
   * their downline — where their own figures belong in the frame. An admin who
   * wants their own standing switches to User, which is one click and says so.
   */
  const showMine = data.me !== null && (data.scope.view === "user" || !data.scope.all);
  const teamCount = data.employees.length > (data.me ? 1 : 0);

  return (
    <div className="space-y-3" data-incentive-analytics aria-busy={pending}>
      {data.targetWarning && (data.targetWarning.missingCurrent || data.targetWarning.missingNext) && (
        <TargetWarningBar warning={data.targetWarning} onSaved={() => load(kind, month)} />
      )}

      {/* ── Control row: whose figures, then over what span ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-3 py-2">
        {canSwitchView && (
          <Segmented
            ariaLabel="Whose incentive data"
            options={VIEW_OPTIONS}
            value={view}
            disabled={pending}
            onChange={(v) => load(kind, kind === "month" ? month : undefined, v)}
          />
        )}
        <Segmented
          ariaLabel="Period"
          options={PERIOD_OPTIONS}
          value={kind}
          disabled={pending}
          onChange={(k) => load(k, k === "month" ? month : undefined)}
        />
        {kind === "month" && (
          <select
            aria-label="Month"
            value={month}
            disabled={pending}
            onChange={(e) => load("month", e.target.value)}
            className="h-9 rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors hover:border-hairline-strong focus:border-altus-red"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthKey(m)}
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
        </span>
      </div>

      {/* ── Status summary — six filters over the same window ── */}
      <section
        aria-label="Incentive status summary"
        className={cn("transition-opacity", pending && "opacity-60")}
      >
        <IncentiveKpiRow cols={6}>
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

      {/* ── Performance ── */}
      {showMine && data.me && (
        <MyPerformance me={data.me} rankedCount={data.rankedCount} viewerId={data.scope.viewerId} />
      )}
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
      className="flex min-h-[116px] cursor-pointer flex-col justify-between rounded-2xl border bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-soft"
      style={{
        borderColor: selected ? toneBase(tone) : "var(--color-hairline)",
        borderWidth: selected ? 1.5 : 1,
      }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: toneBase(tone) }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</span>
      </span>
      <span
        className="tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 1.9vw, 31px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-bold text-ink-soft tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
        {unvaluedCount > 0 && (
          <span className="text-[11.5px] font-medium text-ink-subtle">{unvaluedCount} amount not set</span>
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

function TargetVsActual({ p }: { p: EmployeePerformance }) {
  if (p.target === null) return <span className="text-[13px] font-semibold text-ink-subtle">No target set</span>;
  const diff = p.difference ?? 0;
  return (
    <span className="text-[13px] font-semibold text-ink-soft">
      {formatInr(p.target)} target · {formatInr(p.earned)} actual ·{" "}
      <b style={{ color: toneInk(diff < 0 ? "red" : "green") }}>
        {diff < 0 ? `Deficit ${formatInr(-diff)}` : diff > 0 ? `Ahead ${formatInr(diff)}` : "On target"}
      </b>
    </span>
  );
}

function Metric({
  label,
  children,
  size = "md",
}: {
  label: string;
  children: React.ReactNode;
  /** `lg` is the team summary's scanning size; the default is the inline one. */
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div
        className={
          size === "lg"
            ? "text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle"
            : "text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
        }
      >
        {label}
      </div>
      <div
        className={
          size === "lg"
            ? "mt-1.5 flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-1"
            : "mt-0.5 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5"
        }
      >
        {children}
      </div>
    </div>
  );
}

/** The signed-in person's own standing. Only rendered when it IS theirs. */
function MyPerformance({
  me,
  rankedCount,
  viewerId,
}: {
  me: EmployeePerformance;
  rankedCount: number;
  /** The signed-in employee's id — their own breakup letter lives under it. */
  viewerId?: string;
}) {
  return (
    <section
      aria-label="Your performance"
      data-performance
      data-my-performance
      className="rounded-2xl border border-hairline bg-surface-card px-4 py-2.5"
    >
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_1fr]">
        <Metric label="Your grade">
          <GradeBadge grade={me.grade} />
          {!me.grade && <span className="text-[12.5px] text-ink-subtle">{ctcReason(me) || "—"}</span>}
        </Metric>
        <Metric label="Incentive">
          <span className="text-[16px] font-black tabular-nums text-ink-strong">{formatInr(me.earned)}</span>
        </Metric>
        <Metric label="% of CTC">
          <span className="text-[16px] font-black tabular-nums text-ink-strong">{pct(me.pctOfCtc)}</span>
        </Metric>
        <Metric label="Rank">
          <span className="text-[16px] font-black tabular-nums text-ink-strong">
            {me.rank === null ? "—" : `#${me.rank}`}
          </span>
          {me.rank !== null && <span className="text-[12px] text-ink-subtle">of {rankedCount}</span>}
          <Movement movement={me.movement} previous={me.previousRank} rank={me.rank} />
        </Metric>
        <Metric label="Target vs actual">
          <TargetVsActual p={me} />
        </Metric>
      </div>
      {/* The employee's own document. Rendered ONLY on the viewer's own block,
          and it links to the same route the payment-time email attaches — the
          route re-checks ownership itself, so this is a door, not the lock. */}
      {viewerId && (
        <a
          href={`/salary/incentive-breakup/${viewerId}?view=1`}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        >
          <FileText size={13} strokeWidth={2.4} aria-hidden />
          Incentive breakup letter
        </a>
      )}
    </section>
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
function TeamSummary({ data }: { data: IncentiveAnalytics }) {
  const g = data.summary.grades;
  const huge = "text-[clamp(26px,2vw,34px)] font-black leading-none tabular-nums text-ink-strong";
  return (
    <section
      aria-label="Team summary"
      data-team-summary
      className="rounded-2xl border border-hairline bg-surface-card px-5 py-5 max-md:px-4 max-md:py-4"
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_minmax(0,1fr)] lg:items-center">
        <Metric size="lg" label="Employees">
          <span className={huge}>{data.summary.people}</span>
          <span className="text-[13px] font-semibold text-ink-subtle">
            {data.scope.all ? "All employees" : "Your team"}
          </span>
        </Metric>
        <Metric size="lg" label="Incentive">
          <span className={huge}>{formatInr(data.summary.earned)}</span>
        </Metric>
        <Metric size="lg" label="Target">
          <span className={huge}>{data.summary.target === null ? "not set" : formatInr(data.summary.target)}</span>
        </Metric>
        <div className="lg:border-l lg:border-hairline lg:pl-8">
          <Metric size="lg" label="Grades">
            {(["A", "B", "C", "D"] as const).map((k) => (
              <IncentiveBadge
                key={k}
                size="lg"
                tone={k === "A" ? "green" : k === "B" ? "blue" : k === "C" ? "amber" : "red"}
              >
                {k} {g[k]}
              </IncentiveBadge>
            ))}
            {g.none > 0 && <span className="text-[12.5px] font-medium text-ink-subtle">{g.none} without CTC</span>}
          </Metric>
        </div>
      </div>
    </section>
  );
}

// ── Tables ────────────────────────────────────────────────────────────────────

function GradeReport({ data }: { data: IncentiveAnalytics }) {
  const columns: DataTableColumn<EmployeePerformance>[] = [
    {
      key: "employee",
      label: "Employee",
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
      align: "right",
      sortValue: (p) => p.earned,
      render: (p) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(p.earned)}</span>
      ),
    },
    {
      key: "pct",
      label: "% of CTC",
      align: "right",
      sortValue: (p) => p.pctOfCtc ?? -1,
      render: (p) => <span className="text-[13px] tabular-nums">{pct(p.pctOfCtc)}</span>,
    },
    {
      key: "grade",
      label: "Grade",
      sortValue: (p) => (p.grade ? GRADE_SORT[p.grade] : 0),
      render: (p) => <GradeBadge grade={p.grade} />,
    },
    {
      key: "rank",
      label: "Rank",
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
