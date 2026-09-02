"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  DASH_PERIODS,
  PERFORMER_ROWS,
  PERIOD_LABELS,
  THRESHOLD_CHOICES,
  longDay,
  pct,
  rangeLabel,
  relativeDay,
  scoreLabel,
  shiftYmd,
  shortDay,
  type DashPeriod,
} from "@/lib/daily-goals/score";
import {
  belowThreshold,
  bottomPerformers,
  topPerformers,
  type DashPayload,
  type PersonRow,
  type RankedPerson,
} from "@/lib/daily-goals/types";
import { Empty, GOALS_ACCENT, Panel, PctPill, ScoreCard, StatTile, band } from "./parts";

/**
 * The threshold-table columns, declared once so the header and every row read
 * from the SAME ordered list. The range column's LABEL is dynamic (it names the
 * period on screen) but its id is stable, so a saved arrangement survives a
 * switch between Week/Month/Quarter.
 */
const THRESHOLD_COLUMNS: { id: string; label: string; align?: "left" | "right" }[] = [
  { id: "employee", label: "Employee" },
  { id: "week", label: "This Week", align: "right" },
  { id: "mtd", label: "MTD", align: "right" },
  { id: "range", label: "", align: "right" },
  { id: "unfinished", label: "Unfinished", align: "right" },
  { id: "transferred", label: "Transferred", align: "right" },
];


/**
 * DAILY GOALS -> DASHBOARD.
 *
 * A read-only analysis surface for the Daily Goals loop, reached ONLY from the
 * Daily Goals header (components/goals/plan/plan-board.tsx). It is not in the
 * global navigation, it does not touch the WMS dashboard at /dashboard, and it
 * changes nothing on the planner itself.
 *
 * Reading order is fixed by the brief and by what a manager actually scans for:
 *
 *     Score -> Breakdown -> Work Status -> Performance -> Rankings -> Attention
 *
 * ── STATE LIVES IN THE URL ─────────────────────────────────────────────────
 * Every control here writes a query param and lets the server re-read. That
 * keeps one source of truth for "what am I looking at", makes any view
 * shareable as a link, and means the permission scope is re-applied on the
 * server for every change rather than trusted from the client.
 *
 * ── WHAT MANAGERS SEE THAT INDIVIDUALS DO NOT ──────────────────────────────
 * `payload.individual` is decided on the server from the goals hierarchy. When
 * it is true the org filters, both leaderboards and the threshold table are not
 * rendered at all — an individual has no one to compare against, and a row of
 * "All" dropdowns with one option in them is just noise.
 */
export function DailyGoalsDashboard({ payload }: { payload: DashPayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const { range, filters, options, individual } = payload;

  /** Write params and re-read from the server. `null` clears a key. Changing
   *  anything above Employee also clears the ones below it, so you can never be
   *  left drilled into a person who is not in the department you just picked. */
  const go = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      startTransition(() => router.push((q ? `${pathname}?${q}` : pathname) as Route));
    },
    [params, pathname, router],
  );

  const setPeriod = (p: DashPeriod) =>
    // Leaving Daily drops `?day=`, and leaving Custom drops the range, so a
    // stale bound can never survive into a window it does not belong to.
    go({ period: p === "day" ? null : p, day: null, from: null, to: null });

  const top = React.useMemo(() => topPerformers(payload.people, PERFORMER_ROWS), [payload.people]);
  const bottom = React.useMemo(
    () => bottomPerformers(payload.people, PERFORMER_ROWS),
    [payload.people],
  );
  const flagged = React.useMemo(
    () => belowThreshold(payload.people, filters.threshold),
    [payload.people, filters.threshold],
  );

  const transferTotal = payload.transfers.reduce((n, t) => n + t.count, 0);
  const completed = payload.score.overall.done;

  return (
    <div className={`flex flex-col gap-4 ${pending ? "opacity-70 transition-opacity" : ""}`}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* The breadcrumb, not a page title on its own: the brief's one hard
              UX requirement is that you always know this is Daily Goals ->
              Dashboard and not the WMS dashboard. */}
          <Link
            href={"/my-day" as Route}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline bg-surface-card px-2.5 py-1.5 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
          >
            <ArrowLeft size={13} /> Daily Goals
          </Link>
          <h1
            className="shrink-0 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(17px, 1.5vw, 20px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Daily Goals Dashboard
          </h1>
          <span className="shrink-0 text-[12px] font-semibold text-ink-muted">
            {rangeLabel(range)}
          </span>
          {pending ? <Loader2 size={14} className="animate-spin text-ink-subtle" /> : null}

          {payload.subject ? (
            <span className="ml-auto inline-flex items-center gap-2 rounded-chip border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-strong">
              {payload.subject.name}
              {payload.subject.id === payload.meId ? (
                <span className="text-[10.5px] font-semibold text-ink-subtle">You</span>
              ) : null}
              {!individual ? (
                <button
                  type="button"
                  onClick={() => go({ emp: null })}
                  className="text-[11px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
                >
                  Clear
                </button>
              ) : null}
            </span>
          ) : (
            <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle">
              {payload.peopleCount} {payload.peopleCount === 1 ? "person" : "people"}
            </span>
          )}
        </div>

        {/* Period tabs + the day stepper / custom bounds they imply. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-surface-card p-1">
            {DASH_PERIODS.map((p) => {
              const on = range.period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={on}
                  className={`rounded-pill px-3 py-1.5 text-[12px] font-bold transition-colors ${
                    on ? "text-white" : "text-ink-soft hover:bg-surface-soft hover:text-ink-strong"
                  }`}
                  style={on ? { background: GOALS_ACCENT } : undefined}
                >
                  {PERIOD_LABELS[p]}
                </button>
              );
            })}
          </div>

          {range.period === "day" ? (
            // Which day. The planner navigates its own days the same way, and
            // "Transferred From <day>" is only meaningful once you can move off
            // today and look back at a day whose work has already scattered.
            <div className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-surface-card px-1 py-1">
              <StepDay label="Previous day" onClick={() => go({ day: shiftYmd(range.from, -1) })}>
                <ChevronLeft size={14} />
              </StepDay>
              <span className="min-w-[118px] text-center text-[12px] font-bold tabular-nums text-ink-strong">
                {longDay(range.from)}
              </span>
              <StepDay
                label="Next day"
                disabled={range.from >= payload.today}
                onClick={() => go({ day: shiftYmd(range.from, 1) })}
              >
                <ChevronRight size={14} />
              </StepDay>
              {range.from !== payload.today ? (
                <button
                  type="button"
                  onClick={() => go({ day: null })}
                  className="rounded-pill px-2 py-1 text-[11px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
                >
                  Today
                </button>
              ) : null}
            </div>
          ) : null}

          {range.period === "custom" ? (
            <div className="inline-flex flex-wrap items-center gap-2 rounded-chip border border-hairline bg-surface-card px-2.5 py-1.5">
              <DateField
                label="From"
                value={range.from}
                max={payload.today}
                onChange={(v) => go({ period: "custom", from: v })}
              />
              <DateField
                label="To"
                value={range.to}
                max={payload.today}
                onChange={(v) => go({ period: "custom", to: v })}
              />
            </div>
          ) : null}
        </div>

        {/* Org filters — managers and admins only. */}
        {individual ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Picker
              label="Department"
              value={filters.department ?? ""}
              options={options.departments.map((d) => ({ value: d, label: d }))}
              onChange={(v) => go({ dept: v || null, lead: null, emp: null })}
            />
            <Picker
              label="Team Leader"
              value={filters.leadId ?? ""}
              options={options.leads.map((l) => ({ value: l.id, label: l.name }))}
              onChange={(v) => go({ lead: v || null, emp: null })}
            />
            <Picker
              label="Employee"
              value={filters.employeeId ?? ""}
              options={options.employees.map((e) => ({ value: e.id, label: e.name }))}
              onChange={(v) => go({ emp: v || null })}
            />
            {filters.department || filters.leadId || filters.employeeId ? (
              <button
                type="button"
                onClick={() => go({ dept: null, lead: null, emp: null })}
                className="text-[11.5px] font-bold transition-opacity hover:opacity-70"
                style={{ color: GOALS_ACCENT }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </header>

      {/* ── 1. SCORE + 2. BREAKDOWN ────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <ScoreCard label="Overall" bucket={payload.score.overall} emphasis />
        <ScoreCard label="Goals" bucket={payload.score.goals} />
        <ScoreCard label="WMS Tasks" bucket={payload.score.wms} />
        <ScoreCard label="Commitments" bucket={payload.score.commitments} />
      </div>

      {/* ── 3. WORK STATUS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_1fr] gap-3 max-lg:grid-cols-1">
        <Panel
          title="Work Status"
          hint="Unfinished and transferred work is accountability information — it does not reduce the score."
        >
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
            <StatTile label="Completed" value={completed} tone="var(--color-green-deep)" />
            <StatTile
              label="Pending / Unfinished"
              value={payload.score.unfinished}
              note="Planned, still open on the day"
              tone={payload.score.unfinished > 0 ? "var(--color-amber-deep)" : undefined}
            />
            <StatTile
              label="Transferred"
              value={payload.score.transferred}
              note="Moved to another date"
            />
          </div>
        </Panel>

        <Panel
          title={
            range.from === range.to ? `Transferred From ${dayWord(range.from, payload.today)}` : "Transferred Work"
          }
          hint={transferTotal > 0 ? `${transferTotal} total` : undefined}
        >
          {payload.transfers.length === 0 ? (
            <Empty>Nothing was moved off {range.from === range.to ? "this day" : "this range"}.</Empty>
          ) : (
            <ul className="flex flex-col">
              {payload.transfers.map((t) => (
                <li
                  key={t.toDay}
                  className="flex items-center justify-between border-b border-hairline py-1.5 last:border-0"
                >
                  {/* "Tomorrow / Day After / 25-Aug" only makes sense against
                      ONE anchor day. Over a multi-day range the destinations
                      are relative to different origins, so they are named by
                      their date and nothing else. */}
                  <span className="text-[12.5px] font-semibold text-ink-strong">
                    {range.from === range.to ? relativeDay(t.toDay, range.to) : shortDay(t.toDay)}
                  </span>
                  <span className="text-[13px] font-black tabular-nums text-ink-strong">
                    {t.count}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between pt-2 text-ink-strong">
                <span className="text-[11.5px] font-black uppercase tracking-[0.07em] text-ink-muted">
                  Total
                </span>
                <span className="text-[14px] font-black tabular-nums">{transferTotal}</span>
              </li>
            </ul>
          )}
        </Panel>
      </div>

      {/* ── 4. PERFORMANCE ─────────────────────────────────────────────── */}
      <Panel
        title="Performance"
        hint={payload.subject ? payload.subject.name : "Current selection"}
      >
        <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
          <PerfCell label="Today" card={payload.performance.today} />
          <PerfCell label="This Week" card={payload.performance.week} />
          <PerfCell label="Month to Date" card={payload.performance.mtd} />
        </div>
        {payload.subject ? (
          // The drill-down detail the brief asks for: the same three streams,
          // plus the two accountability counts, for the one person in view.
          <div className="mt-3 grid grid-cols-5 gap-2 border-t border-hairline pt-3 max-sm:grid-cols-2">
            <MiniStat label="Goals" text={`${pct(payload.score.goals)}%`} sub={scoreLabel(payload.score.goals)} />
            <MiniStat label="WMS Tasks" text={`${pct(payload.score.wms)}%`} sub={scoreLabel(payload.score.wms)} />
            <MiniStat
              label="Commitments"
              text={`${pct(payload.score.commitments)}%`}
              sub={scoreLabel(payload.score.commitments)}
            />
            <MiniStat label="Unfinished" text={String(payload.score.unfinished)} />
            <MiniStat label="Transferred" text={String(payload.score.transferred)} />
          </div>
        ) : null}
      </Panel>

      {/* ── 5. RANKINGS — managers and admins, and only while looking at a
             GROUP. Drilled into one person the boards would rank a field of
             one, so they step aside and the Performance detail above is the
             whole answer. ──────────────────────────────────────────────── */}
      {individual || filters.employeeId ? null : (
        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <Panel title={`Top ${PERFORMER_ROWS} Performers`} hint={rangeLabel(range)}>
            <Leaderboard rows={top} onPick={(id) => go({ emp: id })} icon="up" />
          </Panel>
          <Panel title={`Bottom ${PERFORMER_ROWS} Performers`} hint={rangeLabel(range)}>
            <Leaderboard rows={bottom} onPick={(id) => go({ emp: id })} icon="down" />
          </Panel>
        </div>
      )}

      {/* ── 6. PEOPLE BELOW THRESHOLD — same rule as the boards above. ─── */}
      {individual || filters.employeeId ? null : (
        <Panel
          title="People Below Threshold"
          right={
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted">
              Show people below
              <select
                value={filters.threshold}
                onChange={(e) => go({ threshold: e.target.value })}
                className="rounded-pill border border-hairline bg-surface-card px-2 py-1 text-[12px] font-bold tabular-nums text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
              >
                {/* A hand-typed `?threshold=` outside the preset list still
                    works and is shown here, so the dropdown never silently
                    disagrees with the table beneath it. */}
                {[
                  ...new Set<number>([...THRESHOLD_CHOICES, filters.threshold]),
                ]
                  .sort((a, b) => b - a)
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}%
                    </option>
                  ))}
              </select>
            </label>
          }
        >
          {flagged.length === 0 ? (
            <Empty>
              Nobody in this selection is below {filters.threshold}% for {rangeLabel(range)}.
            </Empty>
          ) : (
            <ThresholdTable rows={flagged} rangeName={PERIOD_LABELS[range.period]} onPick={(id) => go({ emp: id })} />
          )}
        </Panel>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Pieces                                                                   */
/* ----------------------------------------------------------------------- */

/** "Today" when the window is on today, else the date — so the transferred
 *  panel reads "Transferred From Today" exactly as the brief writes it. */
function dayWord(ymd: string, today: string): string {
  return ymd === today ? "Today" : longDay(ymd);
}

function StepDay({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-pill text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function DateField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-muted">
      {label}
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => (e.target.value ? onChange(e.target.value) : undefined)}
        className="rounded-pill border border-hairline bg-surface-card px-2 py-1 text-[12px] font-semibold tabular-nums text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
      />
    </label>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[190px] rounded-chip border border-hairline bg-surface-card px-2 py-1.5 text-[12.5px] font-bold text-ink-strong outline-none hover:border-hairline-strong focus:border-altus-red"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PerfCell({ label, card }: { label: string; card: DashPayload["score"] }) {
  const value = pct(card.overall);
  const tone = band(value);
  const empty = card.overall.planned <= 0;
  return (
    <div className="rounded-xl border border-hairline px-3 py-2.5">
      <div className="text-[10.5px] font-black uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </div>
      {empty ? (
        <div className="mt-1 text-[18px] font-black text-ink-subtle">—</div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: tone.fg }}>
            {value}%
          </span>
          <span className="text-[12px] font-semibold tabular-nums text-ink-subtle">
            {scoreLabel(card.overall)}
          </span>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, text, sub }: { label: string; text: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-soft px-2.5 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-black tabular-nums text-ink-strong">{text}</div>
      {sub ? <div className="text-[10.5px] font-semibold tabular-nums text-ink-subtle">{sub}</div> : null}
    </div>
  );
}

/** Both leaderboards, one component — they differ only in the order the server
 *  handed them over and the arrow beside the heading's rank. */
function Leaderboard({
  rows,
  onPick,
  icon,
}: {
  rows: RankedPerson[];
  onPick: (id: string) => void;
  icon: "up" | "down";
}) {
  if (rows.length === 0)
    return <Empty>No one in this selection planned anything in this window.</Empty>;
  const Icon = icon === "up" ? TrendingUp : TrendingDown;
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => {
        const tone = band(r.pct);
        return (
          <li key={r.id} className="border-b border-hairline last:border-0">
            <button
              type="button"
              onClick={() => onPick(r.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-soft"
            >
              <span className="w-4 shrink-0 text-[12px] font-black tabular-nums text-ink-subtle">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong">
                {r.name}
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-ink-subtle">
                {scoreLabel(r.score.overall)}
              </span>
              <Icon size={13} style={{ color: tone.fg }} aria-hidden />
              <span
                className="w-11 shrink-0 text-right text-[13px] font-black tabular-nums"
                style={{ color: tone.fg }}
              >
                {r.pct}%
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ThresholdTable({
  rows,
  rangeName,
  onPick,
}: {
  rows: PersonRow[];
  rangeName: string;
  onPick: (id: string) => void;
}) {
  // Rendered in the declared order — the header and every row read the same
  // list, so a column can never drift out of step with its cells.
  const orderedColumns = THRESHOLD_COLUMNS;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline-strong">
            {orderedColumns.map((c) => (
              <Th key={c.id} align={c.align}>
                {c.id === "range" ? rangeName : c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              onClick={() => onPick(p.id)}
              className="cursor-pointer border-b border-hairline transition-colors last:border-0 hover:bg-surface-soft"
            >
              {orderedColumns.map((c) => {
                if (c.id === "employee") return (
                  <td key={c.id} className="py-2 pr-3">
                    <div className="text-[13px] font-semibold text-ink-strong">{p.name}</div>
                    {p.leadName || p.department ? (
                      <div className="text-[10.5px] font-medium text-ink-subtle">
                        {[p.department, p.leadName].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                );
                if (c.id === "week") return <Td key={c.id}><PctPill bucket={p.week.overall} /></Td>;
                if (c.id === "mtd") return <Td key={c.id}><PctPill bucket={p.mtd.overall} /></Td>;
                if (c.id === "range") return <Td key={c.id}><PctPill bucket={p.range.overall} /></Td>;
                if (c.id === "unfinished") return (
                  <Td key={c.id}>
                    <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">
                      {p.range.unfinished}
                    </span>
                  </Td>
                );
                return (
                  <Td key={c.id}>
                    <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">
                      {p.range.transferred}
                    </span>
                  </Td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`pb-2 text-[10.5px] font-black uppercase tracking-[0.07em] text-ink-muted ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pl-3 text-right align-middle">{children}</td>;
}
