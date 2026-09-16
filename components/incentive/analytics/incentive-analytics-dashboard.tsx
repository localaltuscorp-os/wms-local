"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
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
  type IncentiveGrade,
  type RankMovement,
} from "@/lib/incentive/analytics/grading";
import {
  PERIOD_KINDS,
  PERIOD_LABELS,
  formatMonthKey,
  type PeriodKind,
} from "@/lib/incentive/analytics/periods";
import type {
  EmployeePerformance,
  IncentiveAnalytics,
  StatusKey,
  StatusRecord,
  TargetWarning,
} from "@/lib/incentive/analytics/model";

/**
 * INCENTIVE DASHBOARD — the view.
 *
 * Renders what `buildIncentiveAnalytics` returned; it does no incentive
 * arithmetic of its own. Changing the period asks the server for a fresh
 * result (`fetchIncentiveAnalytics`), which re-applies the viewer's scope — the
 * browser never holds data it was not allowed.
 *
 *   [Period]  [Target warning]  [Status summary ×6]  [Your performance]
 *   [Employee grade report  ⇄  the table behind a clicked status]
 */

const STATUS_TONE: Record<StatusKey, string> = {
  not_approved: "#B91C1C",
  approved: "#15803D",
  due: "#B45309",
  not_due: "#475569",
  paid: "#0F766E",
  unpaid: "#A80400",
};

const GRADE_TONE: Record<IncentiveGrade, { fg: string; bg: string }> = {
  A: { fg: "#166534", bg: "rgba(22,163,74,0.12)" },
  B: { fg: "#1D4ED8", bg: "rgba(37,99,235,0.10)" },
  C: { fg: "#B45309", bg: "rgba(245,158,11,0.14)" },
  D: { fg: "#A80400", bg: "rgba(225,6,0,0.09)" },
};

const GRADE_ORDER: Record<IncentiveGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

const cardShadow =
  "inset 0 0 0 1px var(--color-hairline), 0 6px 20px -18px rgba(15,23,42,0.35)";

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

export function IncentiveAnalyticsDashboard({
  initial,
  months,
}: {
  initial: IncentiveAnalytics;
  /** Months the "Specific Month" picker offers, newest first (server-built). */
  months: string[];
}) {
  const [data, setData] = React.useState(initial);
  const [kind, setKind] = React.useState<PeriodKind>(initial.period.kind);
  const [month, setMonth] = React.useState<string>(
    initial.period.kind === "month" ? initial.period.months[0]! : (months[1] ?? months[0] ?? ""),
  );
  const [active, setActive] = React.useState<StatusKey | null>(null);
  const [pending, startTransition] = React.useTransition();

  function load(nextKind: PeriodKind, nextMonth?: string) {
    const shownKind = data.period.kind;
    setKind(nextKind);
    if (nextMonth) setMonth(nextMonth);
    startTransition(async () => {
      // On any failure the selector snaps back to the period actually on screen,
      // so the buttons never claim a period whose numbers are not shown.
      const fail = (message: string) => {
        setKind(shownKind);
        fireToast({ message, type: "error" });
      };
      try {
        const res = await fetchIncentiveAnalytics({
          kind: nextKind,
          month: nextKind === "month" ? (nextMonth ?? month) : null,
        });
        if (!res.ok) return fail(res.error);
        setData(res.data);
      } catch {
        fail("The incentive dashboard couldn't load just now — please try again.");
      }
    });
  }

  const activeCard = active ? data.statuses.find((s) => s.key === active) ?? null : null;

  return (
    <div className="space-y-4" data-incentive-analytics aria-busy={pending}>
      {/* ── Period ── */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-card px-3 py-2.5"
        style={{ boxShadow: cardShadow }}
      >
        <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-1">
          {PERIOD_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              disabled={pending}
              onClick={() => load(k, k === "month" ? month : undefined)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors disabled:cursor-wait",
                kind === k ? "text-white" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong",
              )}
              style={kind === k ? { background: "linear-gradient(135deg, #E10600, #A80400)" } : undefined}
            >
              {PERIOD_LABELS[k]}
            </button>
          ))}
        </div>
        {kind === "month" && (
          <select
            aria-label="Month"
            value={month}
            disabled={pending}
            onChange={(e) => load("month", e.target.value)}
            className="h-8 rounded-lg border border-hairline-strong bg-white px-2 text-[13px] font-semibold text-ink-strong"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthKey(m)}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle" data-period-label>
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {data.period.label}
          <span aria-hidden>·</span>
          <Users size={13} aria-hidden />
          {data.scope.label}
        </span>
      </div>

      {data.targetWarning && (data.targetWarning.missingCurrent || data.targetWarning.missingNext) && (
        <TargetWarningBar warning={data.targetWarning} onSaved={() => load(kind, month)} />
      )}

      {/* ── Status summary ── */}
      <section aria-label="Incentive status summary" className={cn("transition-opacity", pending && "opacity-60")}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {data.statuses.map((s) => {
            const selected = active === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={selected}
                data-status-card={s.key}
                onClick={() => setActive(selected ? null : s.key)}
                className="rounded-xl bg-surface-card px-3.5 py-3 text-left transition-shadow hover:shadow-md"
                style={{
                  boxShadow: selected ? `inset 0 0 0 2px ${STATUS_TONE[s.key]}` : cardShadow,
                }}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_TONE[s.key] }} />
                  {s.label}
                </span>
                <span className="mt-1.5 block text-[19px] font-black tabular-nums leading-none text-ink-strong">
                  {formatInr(s.amount)}
                </span>
                <span className="mt-1 block text-[12px] font-medium text-ink-muted">
                  {s.count} {s.count === 1 ? "entry" : "entries"}
                  {s.unvaluedCount > 0 && ` · ${s.unvaluedCount} amount not set`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Performance ── */}
      <PerformanceStrip data={data} />

      {/* ── Detail ── */}
      <section
        aria-label={activeCard ? `${activeCard.label} incentives` : "Employee grade report"}
        className={cn("rounded-2xl bg-surface-card p-4 max-md:p-3 transition-opacity", pending && "opacity-60")}
        style={{ boxShadow: cardShadow }}
      >
        {activeCard ? (
          <>
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-muted hover:bg-surface-soft"
              >
                <ChevronLeft size={15} aria-hidden /> Grade report
              </button>
              <h2 className="text-[16px] font-extrabold text-ink-strong" data-detail-title>
                {activeCard.label} · {activeCard.count} {activeCard.count === 1 ? "entry" : "entries"} ·{" "}
                {formatInr(activeCard.amount)}
              </h2>
              <span className="text-[12.5px] text-ink-subtle">{data.period.label}</span>
            </header>
            <StatusTable
              status={activeCard.key}
              label={activeCard.label}
              period={data.period.label}
              records={data.records.filter((r) => r.statuses.includes(activeCard.key))}
            />
          </>
        ) : (
          <>
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[16px] font-extrabold text-ink-strong">Employee Grade Report</h2>
              <span className="text-[12.5px] text-ink-subtle">
                {data.period.label} · ranked by incentive % of CTC ·{" "}
                {INCENTIVE_GRADE_BANDS.map((b) => `${b.grade} ${b.label.replace(" of CTC", "")}`).join(" · ")}
              </span>
            </header>
            <GradeReport data={data} />
          </>
        )}
      </section>
    </div>
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
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-2.5"
      style={{ background: "#FEF2F2", boxShadow: "inset 0 0 0 1px #FCA5A5", color: "#991B1B" }}
    >
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <AlertTriangle size={16} aria-hidden />
        {message}
      </p>
      <form onSubmit={save} className="ml-auto flex flex-wrap items-center gap-2">
        {warning.missingCurrent && (
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {formatMonthKey(warning.currentMonth)}
            <span className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px]">₹</span>
              <input
                inputMode="numeric"
                value={current}
                onChange={(e) => setCurrent(digits(e.target.value))}
                aria-label={`Target for ${formatMonthKey(warning.currentMonth)}`}
                className="h-8 w-28 rounded-lg border border-red-300 bg-white pl-5 pr-2 text-[13px] font-semibold text-ink-strong outline-none focus:border-altus-red"
              />
            </span>
          </label>
        )}
        {warning.missingNext && (
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {formatMonthKey(warning.nextMonth)}
            <span className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px]">₹</span>
              <input
                inputMode="numeric"
                value={next}
                onChange={(e) => setNext(digits(e.target.value))}
                aria-label={`Target for ${formatMonthKey(warning.nextMonth)}`}
                className="h-8 w-28 rounded-lg border border-red-300 bg-white pl-5 pr-2 text-[13px] font-semibold text-ink-strong outline-none focus:border-altus-red"
              />
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          {saving ? "Saving…" : "Save target"}
        </button>
      </form>
    </div>
  );
}

// ── Performance strip ─────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: IncentiveGrade | null }) {
  if (!grade) return <span className="text-ink-subtle">—</span>;
  const tone = GRADE_TONE[grade];
  return (
    <span
      className="inline-grid size-7 place-items-center rounded-lg text-[14px] font-black"
      style={{ color: tone.fg, background: tone.bg }}
      data-grade={grade}
    >
      {grade}
    </span>
  );
}

function Movement({ movement, previous, rank }: { movement: RankMovement; previous: number | null; rank: number | null }) {
  switch (movement.kind) {
    case "up":
      return (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-green-700" title={`Was #${previous}`}>
          <ArrowUp size={12} aria-hidden />
          {previous} → {rank}
        </span>
      );
    case "down":
      return (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-red-700" title={`Was #${previous}`}>
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
      <b style={{ color: diff < 0 ? "#A80400" : "#15803D" }}>
        {diff < 0 ? `Deficit ${formatInr(-diff)}` : diff > 0 ? `Ahead ${formatInr(diff)}` : "On target"}
      </b>
    </span>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</div>
      <div className="mt-1 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5">{children}</div>
    </div>
  );
}

function PerformanceStrip({ data }: { data: IncentiveAnalytics }) {
  const me = data.me;
  const g = data.summary.grades;
  const team = data.employees.length > (me ? 1 : 0);
  return (
    <section
      aria-label="Performance"
      data-performance
      className="rounded-2xl bg-surface-card px-4 py-3"
      style={{ boxShadow: cardShadow }}
    >
      {me ? (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_1fr]" data-my-performance>
          <Metric label="Your grade">
            <GradeBadge grade={me.grade} />
            {!me.grade && <span className="text-[12.5px] text-ink-subtle">{ctcReason(me) || "—"}</span>}
          </Metric>
          <Metric label="Incentive">
            <span className="text-[17px] font-black tabular-nums text-ink-strong">{formatInr(me.earned)}</span>
          </Metric>
          <Metric label="% of CTC">
            <span className="text-[17px] font-black tabular-nums text-ink-strong">{pct(me.pctOfCtc)}</span>
          </Metric>
          <Metric label="Rank">
            <span className="text-[17px] font-black tabular-nums text-ink-strong">
              {me.rank === null ? "—" : `#${me.rank}`}
            </span>
            {me.rank !== null && <span className="text-[12px] text-ink-subtle">of {data.rankedCount}</span>}
            <Movement movement={me.movement} previous={me.previousRank} rank={me.rank} />
          </Metric>
          <Metric label="Target vs actual">
            <TargetVsActual p={me} />
          </Metric>
        </div>
      ) : null}
      {team && (
        <div
          className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-muted", me && "mt-3 border-t pt-2.5")}
          style={me ? { borderColor: "var(--color-hairline)" } : undefined}
          data-team-summary
        >
          <span className="font-bold text-ink-strong">
            {data.scope.all ? "All employees" : "Your team"} · {data.summary.people}
          </span>
          <span>
            Incentive <b className="tabular-nums text-ink-strong">{formatInr(data.summary.earned)}</b>
          </span>
          <span>
            Target{" "}
            <b className="tabular-nums text-ink-strong">
              {data.summary.target === null ? "not set" : formatInr(data.summary.target)}
            </b>
          </span>
          <span className="flex items-center gap-1.5">
            {(["A", "B", "C", "D"] as const).map((k) => (
              <span
                key={k}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={{ color: GRADE_TONE[k].fg, background: GRADE_TONE[k].bg }}
              >
                {k} {g[k]}
              </span>
            ))}
            {g.none > 0 && <span className="text-[12px] text-ink-subtle">{g.none} without CTC</span>}
          </span>
        </div>
      )}
      {!me && !team && (
        <p className="text-[13.5px] text-ink-subtle">No active employees to analyse for this period.</p>
      )}
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
          <span className="font-bold text-ink-strong">
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
          <span className="tabular-nums">{formatInr(p.ctc)}</span>
        ) : (
          <span className="text-[12.5px] text-ink-subtle" title={p.ctcState === "restricted" ? "CTC is visible only to the employee and to admins." : undefined}>
            {ctcReason(p)}
          </span>
        ),
    },
    {
      key: "earned",
      label: "Incentive Earned",
      align: "right",
      sortValue: (p) => p.earned,
      render: (p) => <span className="font-semibold tabular-nums text-ink-strong">{formatInr(p.earned)}</span>,
    },
    {
      key: "pct",
      label: "% of CTC",
      align: "right",
      sortValue: (p) => p.pctOfCtc ?? -1,
      render: (p) => <span className="tabular-nums">{pct(p.pctOfCtc)}</span>,
    },
    {
      key: "grade",
      label: "Grade",
      sortValue: (p) => (p.grade ? GRADE_ORDER[p.grade] : 0),
      render: (p) => <GradeBadge grade={p.grade} />,
    },
    {
      key: "rank",
      label: "Rank",
      sortValue: (p) => p.rank ?? Number.MAX_SAFE_INTEGER,
      render: (p) => (
        <span className="flex flex-col">
          <span className="font-bold tabular-nums text-ink-strong">{p.rank === null ? "—" : `#${p.rank}`}</span>
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
          <span className="tabular-nums">{formatInr(p.target)}</span>
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
          <span className="font-semibold tabular-nums" style={{ color: p.difference < 0 ? "#A80400" : "#15803D" }}>
            {p.difference < 0 ? `Deficit ${formatInr(-p.difference)}` : p.difference > 0 ? `+${formatInr(p.difference)}` : "On target"}
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
      searchPlaceholder="Search employee or code"
      initialSort={{ key: "rank", dir: "asc" }}
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
      ]}
      dense
      emptyState={<p className="py-6 text-center text-[14px] text-ink-subtle">No active employees to show.</p>}
    />
  );
}

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
          <span className="font-bold text-ink-strong">{r.employeeLabel}</span>
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
          <span className="font-semibold text-ink-strong">{r.typeLabel}</span>
          {r.product && <span className="text-[12px] text-ink-subtle">Product: {r.product}</span>}
        </span>
      ),
    },
    {
      key: "date",
      label: "Incentive Date",
      sortValue: (r) => r.incentiveDate,
      render: (r) => (
        <span className="tabular-nums">
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
          <span className="text-[12.5px] text-ink-subtle" title="The Incentive Master has no per-request amount for this scheme.">
            Amount not set
          </span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="font-semibold tabular-nums text-ink-strong">{formatInr(v)}</span>
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
      key: "review",
      label: "Review",
      sortValue: (r) => r.reviewedAt ?? "",
      render: (r) =>
        r.reviewerName || r.reviewedAt ? (
          <span className="flex max-w-[260px] flex-col text-[12.5px]">
            <span className="font-semibold text-ink-soft">
              {r.reviewerName ?? "—"}
              {r.reviewedAt && ` · ${formatDMonY(r.reviewedAt)}`}
            </span>
            {r.reviewNote && (
              <span className="truncate text-ink-subtle" title={r.reviewNote}>
                {r.reviewNote}
              </span>
            )}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
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
      searchText={(r) => `${r.employeeLabel} ${r.employeeCodes} ${r.typeLabel} ${r.product ?? ""} ${r.reviewerName ?? ""}`}
      searchPlaceholder="Search employee, type or product"
      initialSort={{ key: "date", dir: "desc" }}
      dense
      emptyState={
        <p className="py-6 text-center text-[14px] text-ink-subtle">
          No {label} incentives in {period}.
        </p>
      }
    />
  );
}
