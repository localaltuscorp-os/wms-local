"use client";

import * as React from "react";
import { CalendarDays, LogIn, LogOut, Clock, AlertTriangle, MapPin } from "lucide-react";
import { PunchEditControl } from "@/components/attendance/punch-edit-control";
import { formatDate } from "@/lib/format";
import { dayCodeStyle, UPCOMING_STYLE } from "@/lib/attendance/day-code-view";
import { weeklyWorkedMinutes } from "@/lib/attendance/hour-balance";

/**
 * Current-month attendance calendar — one colour-coded cell per graded day
 * (P / H·D / A / W-O / holiday / leave), with late/early markers and a per-week
 * worked-hours bar toward the 54h weekly target (Sir's rule). Grading comes
 * pre-computed from `getEmployeeMonthStatus` so it never re-derives.
 *
 * Each day reveals an ANIMATED popover on hover (pointer) / tap (touch) / focus
 * (keyboard) showing the real check-in, check-out, total hours and status.
 */

export interface MonthCell {
  date: string;
  day: number;
  weekday: number; // 0=Sun..6=Sat
  code: string;
  late: boolean;
  leftEarly: boolean;
  isWeeklyOff: boolean;
  inAt: string | null;
  outAt: string | null;
  workedMinutes: number;
  future: boolean;
  /**
   * APPROVED remote work for this day — "wfh" | "field" | "client_site", or
   * null/undefined for an ordinary office day.
   *
   * A marker, never a grade. The day keeps whatever code the hours earned it;
   * this only says the office absence was sanctioned, which is the difference
   * between a Tuesday at a client site and an unexplained Tuesday.
   */
  remoteMode?: string | null;
}

/** Short badge letter + tooltip for an approved remote-work day. */
const REMOTE_BADGE: Record<string, { mark: string; label: string }> = {
  wfh: { mark: "H", label: "Approved work from home" },
  field: { mark: "F", label: "Approved on field" },
  client_site: { mark: "C", label: "Approved client site" },
};

/**
 * Fallback ONLY. The real figure is the viewer's own weekly target, passed in
 * as `weekTargetMinutes` — a part-timer's week is 27h and must never be shown
 * or scored against 54h (spec §2/§10). This constant exists so the component
 * still renders if a caller has not been updated yet.
 */
const DEFAULT_WEEK_TARGET_MIN = 54 * 60;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon-first index (0..6) for a JS weekday (0=Sun..6=Sat). */
function monIndex(weekday: number): number {
  return (weekday + 6) % 7;
}

interface CellStyle {
  bg: string;
  fg: string;
  label: string;
}
/**
 * Codes that are a declared day OFF or an approved absence. A holiday is NOT
 * evaluated for lateness or an early exit (spec §6) — the deviation chips below
 * are suppressed for these, so a company holiday can never read as a violation.
 */
const NON_EVALUATED_CODES = new Set(["H", "W/O", "PL", "CO", "LWP"]);

/**
 * The tile's colours, read from the app's ONE attendance palette
 * (lib/attendance/day-code-view.ts).
 *
 * This used to be a `switch` with the hex values inline. It moved out unchanged
 * — every colour and every label here is byte-identical to what it was — when
 * the Daily Salary Report started drawing the same graded days: two copies of
 * the palette is how two screens showing the same August come to disagree about
 * what orange means.
 *
 * The tile keeps the STRONGER fills (a weekly off is solid slate) while table
 * rows elsewhere take the same hue as a light tint. Both come from one entry;
 * see the TILE vs ROW note in that module for why they must differ.
 */
function codeStyle(c: MonthCell): CellStyle {
  const st = c.future ? UPCOMING_STYLE : dayCodeStyle(c.code);
  return { bg: st.tile, fg: st.tileInk, label: st.label };
}

function fmtHrs(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** "2026-08-05" → "05 Aug 2026" (canonical, no tz drift). */
function fmtFullDate(iso: string): string {
  return formatDate(iso);
}

export function MonthCalendar({ cells, monthLabel, compact, canEdit, employeeId, weekTargetMinutes }: { cells: MonthCell[]; monthLabel: string; compact?: boolean; canEdit?: boolean; employeeId?: string; /** This employee's own weekly target in minutes. */ weekTargetMinutes?: number }) {
  const weekTargetMin = weekTargetMinutes && weekTargetMinutes > 0 ? weekTargetMinutes : DEFAULT_WEEK_TARGET_MIN;
  if (cells.length === 0) {
    return null;
  }
  const wkCol = compact ? "38px" : "84px";
  // Build a Mon-first grid with leading blanks for the 1st's offset.
  const lead = monIndex(cells[0]!.weekday);
  const slots: (MonthCell | null)[] = [...Array(lead).fill(null), ...cells];
  const weeks: (MonthCell | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  return (
    <section
      className={`wg-rise att-cal bg-surface-card ${compact ? "rounded-[20px] p-4" : "rounded-[22px] p-6 max-md:p-4"}`}
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)", animationDelay: "120ms" }}
    >
      <style>{POPOVER_CSS}</style>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-grid size-7 place-items-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}>
          <CalendarDays size={15} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {monthLabel}
          </h2>
          {/* THIS employee's week, not a constant. The copy said "54h" for
              everyone while the bar beside it already scored against
              `weekTargetMin` — so a 27h part-timer was shown a full-timer's
              target above a bar that (correctly) filled at 27h. */}
          <p className="text-[11px] font-medium text-ink-subtle">
            Each week totals toward {fmtHrs(weekTargetMin)}
          </p>
        </div>
      </div>

      {/* weekday header */}
      <div className="grid gap-1 pb-1" style={{ gridTemplateColumns: `repeat(7,minmax(0,1fr)) ${wkCol}` }}>
        {DOW.map((d) => (
          <div key={d} className="text-center text-[9px] font-black uppercase tracking-wide text-ink-subtle">{d.slice(0, 1)}</div>
        ))}
        <div className="text-right text-[9px] font-black uppercase tracking-wide text-ink-subtle">Wk</div>
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => {
          // THE canonical weekly figure — the same function the salary engine
          // reconciles against (lib/attendance/hour-balance.weeklyWorkedMinutes),
          // so this number and the one on the payslip cannot drift apart. Future
          // cells are dropped first: they have no hours, and the week is "so
          // far", not "eventually".
          const worked = weeklyWorkedMinutes(week.filter((c) => c && !c.future) as MonthCell[]);
          const pct = Math.min(100, Math.round((worked / weekTargetMin) * 100));
          const hit = worked >= weekTargetMin;
          return (
            <div key={wi} className="grid gap-1" style={{ gridTemplateColumns: `repeat(7,minmax(0,1fr)) ${wkCol}` }}>
              {week.map((c, ci) => {
                if (!c) return <div key={ci} className={`${compact ? "h-9" : "aspect-square"} rounded-md`} />;
                // Anchor the popover so it never spills off the card at edge columns.
                const anchor = ci <= 1 ? "left" : ci >= 5 ? "right" : "center";
                // DOWNWARD, EVERY ROW. This was `wi === 0 ? "below" : "above"`,
                // so only the top week opened down and the other four to six
                // opened up, over the days you had just read. One direction for
                // the whole grid is what makes the gesture predictable.
                const place = "below" as const;
                return <DayCell key={ci} c={c} compact={compact} anchor={anchor} place={place} canEdit={canEdit} employeeId={employeeId} />;
              })}
              {/* week 54h bar */}
              <div className="flex flex-col justify-center gap-0.5 pl-0.5">
                <span className="text-right text-[10px] font-black tabular-nums leading-none" style={{ color: hit ? "#15803d" : "var(--color-ink-soft)" }}>{fmtHrs(worked)}</span>
                <div className="h-1 overflow-hidden rounded-full bg-surface-track">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: hit ? "linear-gradient(90deg,#16a34a,#15803d)" : "#94a3b8" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold text-ink-muted">
        <LegendDot c="#15803d" label="Present" />
        <LegendDot c="#d97706" label="Half day" />
        <LegendDot c="#dc2626" label="Absent" />
        {/* One swatch for both — the calendar paints holidays and weekly offs
            identically, so two dots would imply a distinction that is not there. */}
        <LegendDot c="#475569" label="Holiday / weekly off" />
        <LegendDot c="#15803d" label="Worked an off day" />
        <LegendDot c="#7c3aed" label="Leave" />
        <LegendDot c="#cbd5e1" label="W-off" />
      </div>
    </section>
  );
}

/** One calendar day — coloured tile + an animated in/out/hours popover. For a
 *  super-admin viewing their own month (`canEdit` + `employeeId`), clicking a day
 *  PINS the popover and turns the times into inline editors. */
function DayCell({
  c,
  compact,
  anchor,
  place,
  canEdit,
  employeeId,
}: {
  c: MonthCell;
  compact?: boolean;
  anchor: "left" | "center" | "right";
  place: "above" | "below";
  canEdit?: boolean;
  employeeId?: string;
}) {
  const [hover, setHover] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const editable = !!(canEdit && employeeId && !c.future);
  const open = hover || pinned;
  const st = codeStyle(c);
  const total = c.workedMinutes > 0 ? fmtHrs(c.workedMinutes) : null;
  // A holiday / weekly off / approved leave is never graded for punctuality.
  const evaluated = !c.future && !NON_EVALUATED_CODES.has(c.code);
  const showLate = evaluated && c.late;
  const showEarly = evaluated && c.leftEarly;
  // APPROVED REMOTE WORK — a corner mark, not a colour. The tile must keep the
  // colour its attendance earned (a WFH day the person worked in full is still
  // Present, green); all this adds is that the office absence was sanctioned.
  // Suppressed on a future day, which has nothing to report yet, and on the
  // declared days off, where "approved WFH" would be noise on a closed office.
  const remote =
    !c.future && c.remoteMode && !NON_EVALUATED_CODES.has(c.code)
      ? REMOTE_BADGE[c.remoteMode]
      : undefined;

  return (
    <div
      className="att-day relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={`${fmtFullDate(c.date)} — ${st.label}${remote ? ` · ${remote.label}` : ""}`}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(e) => e.key === "Escape" && (setPinned(false), setHover(false))}
        className={`relative flex w-full ${compact ? "h-9" : "aspect-square"} items-center justify-center rounded-md border text-center outline-none transition-transform focus-visible:ring-2 focus-visible:ring-altus-red/50 hover:scale-[1.06]`}
        style={{
          background: st.bg,
          borderColor: c.future ? "var(--color-hairline)" : "color-mix(in srgb, " + st.fg + " 22%, transparent)",
          opacity: c.future ? 0.5 : 1,
        }}
      >
        {/* Late ABOVE the date, Left Early BELOW it (spec §8/§9). Both are
            additions, never replacements: the date stays legible and the tile
            keeps its attendance colour, so "Late" and "Present" can be read at
            the same time. Suppressed entirely on holidays / offs / leave, which
            are not evaluated for deviations. */}
        <span className="flex flex-col items-center justify-center leading-none">
          {showLate && (
            <span
              className={`${compact ? "text-[6.5px]" : "text-[8px]"} font-black uppercase tracking-tight leading-none`}
              style={{ color: "#92400e" }}
            >
              Late
            </span>
          )}
          <span
            className="text-[11px] font-bold tabular-nums leading-none"
            style={{ color: c.future ? "var(--color-ink-subtle)" : st.fg }}
          >
            {c.day}
          </span>
          {showEarly && (
            <span
              className={`${compact ? "text-[6.5px]" : "text-[8px]"} font-black uppercase tracking-tight leading-none`}
              style={{ color: "#be123c" }}
            >
              Left Early
            </span>
          )}
        </span>
        {remote && (
          <span
            aria-hidden
            title={remote.label}
            className="absolute right-[2px] top-[2px] grid size-[11px] place-items-center rounded-[3px] text-[7px] font-black leading-none"
            style={{ background: "color-mix(in srgb, #1d4ed8 16%, #fff)", color: "#1d4ed8" }}
          >
            {remote.mark}
          </span>
        )}
      </button>

      {/* click-away catcher while pinned (below the popover) */}
      {pinned && <span className="fixed inset-0 z-[45]" aria-hidden onClick={() => setPinned(false)} />}

      {open && (
        <div
          role="tooltip"
          className={`att-pop att-pop-${place} att-pop-${anchor}${pinned ? " att-pop-pinned" : ""}`}
          style={{ ["--pop-fg" as string]: st.fg }}
        >
          <div className="att-pop-head">
            <span className="att-pop-date">{fmtFullDate(c.date)}</span>
            <span className="att-pop-status" style={{ color: st.fg, background: `color-mix(in srgb, ${st.fg} 12%, transparent)` }}>{st.label}</span>
          </div>
          {c.future ? (
            <p className="att-pop-empty">Upcoming day — not graded yet.</p>
          ) : editable && pinned ? (
            <>
              <div className="att-pop-erow">
                <span className="att-pop-k"><LogIn size={12} strokeWidth={2.4} style={{ color: "#15803d" }} /> Check-in</span>
                <PunchEditControl employeeId={employeeId!} logDate={c.date} kind="in" current={c.inAt} compact />
              </div>
              <div className="att-pop-erow">
                <span className="att-pop-k"><LogOut size={12} strokeWidth={2.4} style={{ color: "#b91c1c" }} /> Check-out</span>
                <PunchEditControl employeeId={employeeId!} logDate={c.date} kind="out" current={c.outAt} compact />
              </div>
              <div className="att-pop-row att-pop-total">
                <span className="att-pop-k"><Clock size={12} strokeWidth={2.4} /> Total hours</span>
                <span className="att-pop-v">{total ?? "—"}</span>
              </div>
            </>
          ) : (
            <>
              <div className="att-pop-row">
                <span className="att-pop-k"><LogIn size={12} strokeWidth={2.4} style={{ color: "#15803d" }} /> Check-in</span>
                <span className="att-pop-v">{c.inAt ?? "— no punch"}</span>
              </div>
              <div className="att-pop-row">
                <span className="att-pop-k"><LogOut size={12} strokeWidth={2.4} style={{ color: "#b91c1c" }} /> Check-out</span>
                <span className="att-pop-v">{c.outAt ?? "— no punch"}</span>
              </div>
              <div className="att-pop-row att-pop-total">
                <span className="att-pop-k"><Clock size={12} strokeWidth={2.4} /> Total hours</span>
                <span className="att-pop-v">{total ?? "—"}</span>
              </div>
              {remote && (
                <div className="att-pop-flags">
                  <span
                    className="att-pop-flag"
                    style={{ color: "#1d4ed8", background: "color-mix(in srgb,#1d4ed8 12%,transparent)" }}
                  >
                    <MapPin size={10} strokeWidth={2.6} /> {remote.label}
                  </span>
                </div>
              )}
              {(c.late || c.leftEarly) && (
                <div className="att-pop-flags">
                  {c.late && <span className="att-pop-flag" style={{ color: "#b45309", background: "color-mix(in srgb,#b45309 12%,transparent)" }}><AlertTriangle size={10} strokeWidth={2.6} /> Late arrival</span>}
                  {c.leftEarly && <span className="att-pop-flag" style={{ color: "#be123c", background: "color-mix(in srgb,#be123c 12%,transparent)" }}><AlertTriangle size={10} strokeWidth={2.6} /> Left early</span>}
                </div>
              )}
              {editable && <p className="att-pop-hint">Click the day to edit times</p>}
            </>
          )}
          <span className={`att-pop-caret att-pop-caret-${place}`} aria-hidden />
        </div>
      )}
    </div>
  );
}

function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

const POPOVER_CSS = `
.att-cal{position:relative;overflow:visible;}
.att-day{z-index:0;}
.att-day:hover,.att-day:focus-within{z-index:40;}
.att-pop{
  position:absolute;left:50%;width:210px;z-index:50;
  padding:12px 13px;border-radius:14px;pointer-events:none;
  background:var(--color-surface-card,#fff);
  box-shadow:0 1px 0 0 color-mix(in srgb,var(--pop-fg) 26%,transparent) inset, 0 18px 44px -20px rgba(15,23,42,.55), 0 0 0 1px var(--color-hairline);
  transform-origin:center bottom;
  animation:attPopIn .17s cubic-bezier(.16,1.2,.3,1) both;
}
.att-pop-above{bottom:calc(100% + 9px);transform-origin:center bottom;}
.att-pop-below{top:calc(100% + 9px);transform-origin:center top;}
.att-pop-center{transform:translateX(-50%);}
.att-pop-left{left:0;transform:none;}
.att-pop-right{left:auto;right:0;transform:none;}
@keyframes attPopIn{from{opacity:0;transform:translateX(var(--tx,-50%)) translateY(6px) scale(.9);}to{opacity:1;transform:translateX(var(--tx,-50%)) translateY(0) scale(1);}}
.att-pop-center{--tx:-50%;}
.att-pop-left,.att-pop-right{--tx:0;}
.att-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;}
.att-pop-date{font-size:12.5px;font-weight:800;letter-spacing:-.01em;color:var(--color-ink-strong);}
.att-pop-status{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:999px;white-space:nowrap;}
.att-pop-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 0;}
.att-pop-k{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--color-ink-muted);}
.att-pop-v{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--color-ink-strong);}
.att-pop-total{margin-top:4px;padding-top:7px;border-top:1px solid var(--color-hairline);}
.att-pop-total .att-pop-v{color:var(--pop-fg);}
.att-pop-empty{font-size:12px;color:var(--color-ink-subtle);margin:2px 0 0;}
.att-pop-pinned{pointer-events:auto;width:224px;}
.att-pop-erow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;}
.att-pop-hint{font-size:10.5px;font-weight:600;color:var(--color-ink-subtle);margin:8px 0 0;text-align:center;}
.att-pop-flags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}
.att-pop-flag{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:999px;}
.att-pop-caret{position:absolute;left:50%;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);background:var(--color-surface-card,#fff);}
.att-pop-left .att-pop-caret{left:22px;}
.att-pop-right .att-pop-caret{left:auto;right:17px;transform:rotate(45deg);}
.att-pop-caret-above{bottom:-5px;box-shadow:2px 2px 0 0 color-mix(in srgb,var(--color-hairline) 100%,transparent);}
.att-pop-caret-below{top:-5px;box-shadow:-1px -1px 0 0 color-mix(in srgb,var(--color-hairline) 100%,transparent);}
@media (prefers-reduced-motion:reduce){.att-pop{animation:none;}.att-day button{transition:none;}}
`;
