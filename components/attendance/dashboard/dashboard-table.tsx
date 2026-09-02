"use client";

import * as React from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  Info,
  X,
  CalendarX2,
  SearchX,
  ChevronRight,
} from "lucide-react";
import { animate, useReducedMotion } from "motion/react";
import type { DashboardRow, MonthSummary } from "@/lib/queries/attendance-status";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EmployeeDetailDialog } from "./employee-detail";
import { SheetDailyDialog } from "./sheet-daily-dialog";
import { AirstrikeDelete } from "./airstrike-delete";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Cell-meaning palette. Each metric maps to a brand status token; zero values
 *  are rendered muted/de-emphasised so a grid full of "0"s stays readable. */
type Tone = "green" | "red" | "amber" | "blue" | "slate" | "teal" | "indigo" | "neutral";

const TONE: Record<Exclude<Tone, "neutral">, { fg: string; bg: string }> = {
  green: { fg: "var(--color-green-deep)", bg: "var(--color-green-bg)" },
  red: { fg: "var(--color-red-deep)", bg: "var(--color-red-bg)" },
  amber: { fg: "var(--color-amber-deep)", bg: "var(--color-amber-bg)" },
  blue: { fg: "var(--color-blue-deep)", bg: "var(--color-blue-bg)" },
  slate: { fg: "var(--color-slate-deep)", bg: "var(--color-slate-bg)" },
  teal: { fg: "var(--color-teal-deep)", bg: "var(--color-teal-bg)" },
  indigo: { fg: "var(--color-indigo-deep)", bg: "var(--color-indigo-bg)" },
};

/** Mid-strength swatches for aurora washes (brighter than -deep). */
const TONE_MID: Record<Exclude<Tone, "neutral">, string> = {
  green: "var(--color-green)",
  red: "var(--color-red)",
  amber: "var(--color-amber)",
  blue: "var(--color-blue)",
  slate: "var(--color-slate)",
  teal: "var(--color-teal)",
  indigo: "var(--color-indigo)",
};

/** A sortable metric column. `tone` drives the cell colouring; `chip` renders a
 *  tinted pill for meaningful (non-zero) counts. */
type SummaryKey = keyof MonthSummary;
interface Col {
  key: SummaryKey;
  label: string;
  short?: string;
  hint?: string;
  tone: Tone;
  chip?: boolean;
}

const COLS: Col[] = [
  { key: "present", label: "Present", tone: "green", chip: true },
  { key: "absent", label: "Absent", tone: "red", chip: true },
  { key: "halfDay", label: "Half-Day", short: "H/D", tone: "amber", chip: true },
  { key: "late", label: "Late", tone: "amber", chip: true },
  { key: "leftEarly", label: "Left-Early", tone: "amber" },
  { key: "lateWaived", label: "Late-Waived", short: "L·W", hint: "Late arrival waived by a full day worked", tone: "slate" },
  { key: "weeklyOff", label: "Weekly-Off", short: "W/O", hint: "Scheduled weekly day off", tone: "neutral" },
  { key: "holiday", label: "Holiday", tone: "indigo" },
  { key: "holidayPresent", label: "Holiday-Present", short: "HP", hint: "Worked on a holiday / weekly-off (extra pay)", tone: "green" },
  { key: "paidLeave", label: "Paid Leave", short: "PL", tone: "blue" },
  { key: "unpaidLeave", label: "Unpaid Leave", short: "LWP", hint: "Leave without pay", tone: "slate" },
  { key: "compOff", label: "Comp-Off", short: "CO", hint: "Redeemed comp-off day", tone: "teal" },
];

/** Legend entries — explain every cryptic code. */
const LEGEND: { label: string; tone: Tone; desc: string }[] = [
  { label: "Present", tone: "green", desc: "Full day worked" },
  { label: "Absent", tone: "red", desc: "No attendance recorded" },
  { label: "Half-Day", tone: "amber", desc: "Partial day worked" },
  { label: "Late / Left-Early", tone: "amber", desc: "Arrived late or left before close" },
  { label: "Late-Waived (L·W)", tone: "slate", desc: "Late, but waived by a full day worked" },
  { label: "Weekly-Off (W/O)", tone: "neutral", desc: "Scheduled weekly day off" },
  { label: "Holiday", tone: "indigo", desc: "Company holiday" },
  { label: "Holiday-Present (HP)", tone: "green", desc: "Worked a holiday / weekly-off → extra pay" },
  { label: "Paid Leave (PL)", tone: "blue", desc: "Approved leave, paid" },
  { label: "Unpaid Leave (LWP)", tone: "slate", desc: "Leave without pay" },
  { label: "Comp-Off (CO)", tone: "teal", desc: "Redeemed compensatory day off" },
];

type SortDir = "asc" | "desc";

/** Per-person attendance rate: present + half-day (½) + HP + paid leave, over
 *  the gradeable working days (present+absent+half+HP+leaves). Pure read of the
 *  already-loaded summary — no new query, no invented threshold. */
function attendanceRate(s: MonthSummary): number | null {
  const credited = s.present + s.halfDay * 0.5 + s.holidayPresent + s.paidLeave + s.compOff;
  const base =
    s.present + s.absent + s.halfDay + s.holidayPresent + s.paidLeave + s.unpaidLeave + s.compOff;
  if (base <= 0) return null;
  return Math.round((credited / base) * 100);
}

/** Rate → tone. Matches the app's canonical rate thresholds
 *  (punctuality-card): green ≥ 80, amber ≥ 60, red below. */
function rateTone(rate: number): Exclude<Tone, "neutral"> {
  return rate >= 80 ? "green" : rate >= 60 ? "amber" : "red";
}

export function AttendanceDashboardTable({
  rows,
  year,
  month,
  canWipe = false,
}: {
  rows: DashboardRow[];
  year: number;
  month: number;
  /** Super-admin only: mounts the hidden `*` company-wide attendance reset. */
  canWipe?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  // `source` decides the drill-down: "sheet" rows open the SHEET daily log (sheet
  // statuses + real punch times); "app" rows open the punch drawer.
  const [selected, setSelected] = React.useState<{ id: string; name: string; source: "sheet" | "app" } | null>(null);
  const [sortKey, setSortKey] = React.useState<SummaryKey | "name" | "rate" | "payableDays">("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [legendOpen, setLegendOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "rate") {
        const ra = attendanceRate(a.summary) ?? -1;
        const rb = attendanceRate(b.summary) ?? -1;
        return dir * (ra - rb);
      }
      const va = a.summary[sortKey as SummaryKey];
      const vb = b.summary[sortKey as SummaryKey];
      return dir * (va - vb);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ── KPI strip — month-level truths folded from the already-loaded rows
  //    (no new queries; stable while searching so the report reads as a
  //    single month statement). ────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    let present = 0,
      absent = 0,
      late = 0,
      onLeave = 0,
      creditedSum = 0,
      baseSum = 0;
    for (const r of rows) {
      const s = r.summary;
      present += s.present;
      absent += s.absent;
      late += s.late;
      onLeave += s.paidLeave + s.unpaidLeave;
      creditedSum += s.present + s.halfDay * 0.5 + s.holidayPresent + s.paidLeave + s.compOff;
      baseSum +=
        s.present + s.absent + s.halfDay + s.holidayPresent + s.paidLeave + s.unpaidLeave + s.compOff;
    }
    const rate = baseSum > 0 ? Math.round((creditedSum / baseSum) * 100) : null;
    return { people: rows.length, present, absent, late, onLeave, rate };
  }, [rows]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numbers default to descending (most-first); name defaults ascending.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <section className="space-y-6">
      {/* ── KPI strip — glass stat cards with aurora washes ──────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <KpiCard
          index={0}
          label="Present %"
          tone={kpis.rate == null ? "slate" : rateTone(kpis.rate)}
          value={kpis.rate}
          suffix="%"
          ring={kpis.rate}
          caption="Credited over gradeable days"
        />
        <KpiCard
          index={1}
          label="Present days"
          tone="green"
          value={kpis.present}
          caption={`Across ${kpis.people} ${kpis.people === 1 ? "person" : "people"}`}
        />
        <KpiCard
          index={2}
          label="Late marks"
          tone={kpis.late > 0 ? "amber" : "slate"}
          value={kpis.late}
          caption="Un-waived late arrivals"
        />
        <KpiCard
          index={3}
          label="Absences"
          tone={kpis.absent > 0 ? "red" : "slate"}
          value={kpis.absent}
          caption="No attendance recorded"
        />
        <KpiCard
          index={4}
          label="On leave"
          tone={kpis.onLeave > 0 ? "blue" : "slate"}
          value={kpis.onLeave}
          caption="Paid + unpaid leave days"
        />
      </div>

      {/* ── Report panel — frosted shell, toolbar, frozen-header grid ────── */}
      <section
        className="admin-panel wg-rise"
        style={{ animationDelay: "120ms" }}
        aria-label="Per-employee month attendance"
      >
        <div className="admin-toolbar">
          <div className="relative w-full max-w-sm">
            <Search
              size={16}
              strokeWidth={2.2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Local search — employee" title="Local search — filters only the list on this page" aria-label="Local search — employee — this page only"
              className={`w-full h-10 pl-10 pr-4 rounded-full border border-hairline bg-white/75 text-[14px] font-medium text-ink-strong placeholder:text-ink-subtle transition-all focus:border-altus-red focus:ring-2 focus:ring-altus-red/20 ${FOCUS_RING}`}
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[13px] font-semibold text-ink-subtle tabular-nums whitespace-nowrap">
              {sorted.length} {sorted.length === 1 ? "person" : "people"}
            </span>
            <button
              type="button"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
              className={`wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/75 py-2 px-3.5 text-[13px] font-semibold text-ink-soft hover:text-ink-strong hover:border-hairline-strong ${FOCUS_RING}`}
            >
              <Info size={14} strokeWidth={2.2} />
              Legend
            </button>
            {canWipe && <AirstrikeDelete />}
          </div>
        </div>

        {legendOpen && (
          <div className="px-4 pt-4">
            <Legend onClose={() => setLegendOpen(false)} />
          </div>
        )}

        {sorted.length === 0 ? (
          <EmptyState
            noData={rows.length === 0}
            onClear={query ? () => setQuery("") : undefined}
          />
        ) : (
          // SINGLE scroll container: both the header row (sticky top) and the
          // first column (sticky left) pin within THIS one overflow box. No
          // nested overflow ancestor between the sticky cells and this box.
          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            <table className="border-collapse w-full" style={{ minWidth: 1240 }}>
              <thead>
                <tr>
                  <HeadCell
                    corner
                    sortable
                    active={sortKey === "name"}
                    dir={sortDir}
                    onSort={() => toggleSort("name")}
                    align="left"
                  >
                    Employee
                  </HeadCell>
                  <HeadCell
                    sortable
                    active={sortKey === "rate"}
                    dir={sortDir}
                    onSort={() => toggleSort("rate")}
                    align="left"
                    hint="Present + ½ half-days + HP + paid leave, over gradeable working days"
                  >
                    Rate
                  </HeadCell>
                  {COLS.map((c) => (
                    <HeadCell
                      key={c.key}
                      sortable
                      active={sortKey === c.key}
                      dir={sortDir}
                      onSort={() => toggleSort(c.key)}
                      hint={c.hint}
                      short={c.short}
                    >
                      {c.label}
                    </HeadCell>
                  ))}
                  <HeadCell
                    sortable
                    active={sortKey === "payableDays"}
                    dir={sortDir}
                    onSort={() => toggleSort("payableDays")}
                    hint="Total payable day-count for the month"
                  >
                    Payable
                  </HeadCell>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const s = r.summary;
                  const rate = attendanceRate(s);
                  const zebra = i % 2 === 1;
                  return (
                    <tr
                      key={r.employeeId}
                      role="button"
                      tabIndex={0}
                      title={`Open ${r.name}'s daily log`}
                      onClick={() => setSelected({ id: r.employeeId, name: r.name, source: r.source ?? "app" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected({ id: r.employeeId, name: r.name, source: r.source ?? "app" });
                        }
                      }}
                      className={`group cursor-pointer ${FOCUS_RING}`}
                    >
                      {/* Frozen employee column — opaque bg so scrolled-under
                          cells hide behind it; brand-tinted on hover. */}
                      <td
                        className={`sticky left-0 z-10 px-4 py-2.5 border-b border-hairline transition-colors ${
                          zebra ? "bg-[#fbfcfd]" : "bg-[#ffffff]"
                        } group-hover:bg-[color-mix(in_srgb,var(--color-altus-red)_3.5%,#ffffff)]`}
                        style={{
                          maxWidth: 250,
                          boxShadow: "inset -1px 0 0 var(--color-hairline)",
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <EmployeeAvatar name={r.name} size="sm" />
                          <span
                            className="font-semibold text-ink-strong text-[14px] truncate transition-colors group-hover:text-[var(--color-altus-red-deep)]"
                            title={r.name}
                          >
                            {r.name}
                          </span>
                          <ChevronRight
                            size={14}
                            strokeWidth={2.4}
                            aria-hidden
                            className="ml-auto shrink-0 text-[var(--color-altus-red)] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 motion-reduce:transition-none motion-reduce:translate-x-0"
                          />
                        </div>
                      </td>
                      {/* Attendance-rate mini bar. */}
                      <td
                        className={`px-4 py-2.5 border-b border-hairline align-middle transition-colors ${
                          zebra ? "bg-[rgba(15,23,42,0.012)]" : ""
                        } group-hover:bg-[color-mix(in_srgb,var(--color-altus-red)_2.5%,transparent)]`}
                        style={{ minWidth: 124 }}
                      >
                        <RateBar rate={rate} />
                      </td>
                      {COLS.map((c) => (
                        <MetricCell key={c.key} value={s[c.key]} tone={c.tone} chip={c.chip} zebra={zebra} />
                      ))}
                      <td
                        className={`px-4 py-2.5 text-right border-b border-hairline whitespace-nowrap transition-colors ${
                          zebra ? "bg-[rgba(15,23,42,0.012)]" : ""
                        } group-hover:bg-[color-mix(in_srgb,var(--color-altus-red)_2.5%,transparent)]`}
                      >
                        <span
                          className="tabular-nums text-ink-strong"
                          style={{
                            fontFamily: "var(--font-display), system-ui, sans-serif",
                            fontWeight: 800,
                            fontSize: 15,
                          }}
                        >
                          {s.payableDays}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected?.source === "sheet" ? (
        <SheetDailyDialog
          open={selected !== null}
          onOpenChange={(o) => {
            if (!o) setSelected(null);
          }}
          employeeId={selected?.id ?? null}
          employeeName={selected?.name ?? ""}
          year={year}
          month={month}
        />
      ) : (
        <EmployeeDetailDialog
          open={selected !== null}
          onOpenChange={(o) => {
            if (!o) setSelected(null);
          }}
          employeeId={selected?.id ?? null}
          employeeName={selected?.name ?? ""}
          year={year}
          month={month}
        />
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   KPI card — frosted glass, tone-tinted aurora wash, display-face numeral
   with a count-up entrance (reduced-motion renders the final value).
   ──────────────────────────────────────────────────────────────────────── */

function KpiCard({
  index,
  label,
  value,
  suffix = "",
  caption,
  tone,
  ring = null,
}: {
  index: number;
  label: string;
  /** null → em-dash (no gradeable data). */
  value: number | null;
  suffix?: string;
  caption: string;
  tone: Exclude<Tone, "neutral">;
  /** When set, draws a mini progress ring at this percentage. */
  ring?: number | null;
}) {
  const mid = TONE_MID[tone];
  const deep = TONE[tone].fg;
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-section px-5 py-4.5 max-md:px-4"
      style={{
        animationDelay: `${index * 70}ms`,
        background:
          "linear-gradient(155deg, color-mix(in srgb, #ffffff 88%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 94%, transparent) 100%)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 20px 44px -30px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        ["--kpi-index" as string]: index,
        ["--kpi-tone" as string]: `color-mix(in srgb, ${mid} 55%, transparent)`,
        ["--kpi-tone-deep" as string]: `color-mix(in srgb, ${deep} 42%, transparent)`,
      }}
    >
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full shrink-0" style={{ background: mid }} />
          <span
            className="uppercase font-bold text-ink-subtle"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: 10.5,
              letterSpacing: "0.14em",
            }}
          >
            {label}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: "-0.02em",
              color: deep,
            }}
          >
            {value == null ? "—" : <CountUp value={value} suffix={suffix} />}
          </span>
          {ring != null && <MiniRing pct={ring} color={deep} />}
        </div>
        <p className="mt-1.5 text-[12px] font-semibold text-ink-subtle leading-snug">{caption}</p>
      </div>
    </div>
  );
}

/** Animated numeral. Renders the final value immediately (SSR/hydration/
 *  reduced-motion safe), then counts up on mount for motion users. */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, suffix, reduce]);
  return (
    <span ref={ref} className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

/** Compact SVG progress ring for the Present % hero stat. */
function MiniRing({ pct, color }: { pct: number; color: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={46} height={46} viewBox="0 0 46 46" aria-hidden className="shrink-0 -rotate-90">
      <circle cx={23} cy={23} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={5} />
      <circle
        cx={23}
        cy={23}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
      />
    </svg>
  );
}

/* ── Legend ──────────────────────────────────────────────────────────────── */

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="rounded-[14px] border border-hairline p-4"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(248,250,252,0.75))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="uppercase font-bold text-ink-subtle"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 10.5,
            letterSpacing: "0.12em",
          }}
        >
          What the columns mean
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide legend"
          className={`size-7 inline-flex items-center justify-center rounded-full text-ink-subtle hover:text-ink-strong hover:bg-surface-track transition-colors ${FOCUS_RING}`}
        >
          <X size={15} strokeWidth={2.2} />
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
        {LEGEND.map((l) => {
          const sw = l.tone === "neutral" ? "var(--color-ink-subtle)" : TONE[l.tone].fg;
          return (
            <li key={l.label} className="flex items-start gap-2">
              <span
                className="mt-1 size-2.5 rounded-full shrink-0"
                style={{ background: sw, boxShadow: `0 0 0 3px color-mix(in srgb, ${sw} 14%, transparent)` }}
                aria-hidden
              />
              <span className="text-[13px] leading-snug">
                <span className="font-bold text-ink-strong">{l.label}</span>
                <span className="text-ink-muted"> — {l.desc}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Empty states ───────────────────────────────────────────────────────── */

function EmptyState({ noData, onClear }: { noData: boolean; onClear?: () => void }) {
  const Icon = noData ? CalendarX2 : SearchX;
  return (
    <div className="py-16 px-6 text-center">
      <span
        className="mx-auto flex size-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
          color: "var(--color-altus-red)",
          boxShadow: "0 0 0 8px color-mix(in srgb, var(--color-altus-red) 3%, transparent)",
        }}
      >
        <Icon size={24} strokeWidth={2} aria-hidden />
      </span>
      <p
        className="mt-5 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        {noData ? "No attendance to report" : "No matching employees"}
      </p>
      <p className="mt-1.5 text-[14px] font-semibold text-ink-subtle">
        {noData
          ? "There are no active employees for this month."
          : "Try a different name, or clear the search."}
      </p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className={`wg-btn mt-4 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/80 py-2 px-4 text-[13px] font-bold text-ink-strong hover:border-hairline-strong ${FOCUS_RING}`}
        >
          <X size={14} strokeWidth={2.4} />
          Clear Search
        </button>
      )}
    </div>
  );
}

/* ── Table cells ────────────────────────────────────────────────────────── */

function RateBar({ rate }: { rate: number | null }) {
  if (rate == null) {
    return <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">—</span>;
  }
  const tone = rateTone(rate);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: "var(--color-surface-track)", minWidth: 44 }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${rate}%`,
            background: `linear-gradient(90deg, ${TONE_MID[tone]}, ${TONE[tone].fg})`,
          }}
        />
      </div>
      <span
        className="text-[13px] font-bold tabular-nums"
        style={{ color: TONE[tone].fg, minWidth: 34, textAlign: "right" }}
      >
        {rate}%
      </span>
    </div>
  );
}

/** A metric cell: zeros are de-emphasised (muted, no chip); meaningful counts
 *  are coloured by meaning, optionally as a tinted chip. */
function MetricCell({
  value,
  tone,
  chip,
  zebra,
}: {
  value: number;
  tone: Tone;
  chip?: boolean;
  zebra: boolean;
}) {
  const isZero = value === 0;
  let inner: React.ReactNode;
  if (isZero) {
    inner = <span className="text-ink-subtle/50 tabular-nums">0</span>;
  } else if (chip && tone !== "neutral") {
    inner = (
      <span
        className="inline-flex items-center justify-center rounded-full px-2 py-0.5 font-bold tabular-nums"
        style={{
          fontSize: 12.5,
          background: TONE[tone].bg,
          color: TONE[tone].fg,
          minWidth: 26,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TONE[tone].fg} 16%, transparent)`,
        }}
      >
        {value}
      </span>
    );
  } else {
    const fg = tone === "neutral" ? "var(--color-ink-soft)" : TONE[tone].fg;
    inner = (
      <span className="font-bold tabular-nums" style={{ color: fg }}>
        {value}
      </span>
    );
  }
  return (
    <td
      className={`px-3 py-2.5 text-right whitespace-nowrap border-b border-hairline transition-colors ${
        zebra ? "bg-[rgba(15,23,42,0.012)]" : ""
      } group-hover:bg-[color-mix(in_srgb,var(--color-altus-red)_2.5%,transparent)]`}
      style={{ fontSize: 14 }}
    >
      {inner}
    </td>
  );
}

function HeadCell({
  children,
  align = "right",
  corner = false,
  short,
  hint,
  sortable,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  corner?: boolean;
  short?: string;
  hint?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: SortDir;
  onSort?: () => void;
}) {
  const base =
    "px-3 py-3 uppercase font-bold tracking-[0.06em] whitespace-nowrap sticky top-0 z-20";
  const corner_ = corner ? " left-0 z-30 px-4" : "";
  const content = (
    <span
      className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      <span className="inline-flex items-center gap-1" title={hint}>
        {children}
        {short && (
          <span
            className="rounded px-1 py-0.5 text-[9px] font-bold tracking-wide"
            style={{ background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}
          >
            {short}
          </span>
        )}
      </span>
      {sortable && (
        <span aria-hidden className="inline-flex w-3 justify-center" style={{ opacity: active ? 1 : 0.3 }}>
          {active && dir === "asc" ? (
            <ArrowUp size={12} strokeWidth={2.6} />
          ) : (
            <ArrowDown size={12} strokeWidth={2.6} />
          )}
        </span>
      )}
    </span>
  );
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`${base}${corner_}`}
      style={{
        fontSize: 10.5,
        letterSpacing: "0.08em",
        textAlign: align,
        color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
        // Opaque gradient so scrolled-under rows hide behind the pinned header.
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow:
          "inset 0 -1px 0 var(--color-hairline-strong), 0 6px 12px -10px rgba(15,23,42,0.10)",
      }}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center w-full ${align === "right" ? "justify-end" : "justify-start"} uppercase hover:text-ink-strong transition-colors ${FOCUS_RING}`}
          style={{ letterSpacing: "inherit", color: "inherit" }}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}
