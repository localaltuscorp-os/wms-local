"use client";

import * as React from "react";
import { Check, Loader2, Lock } from "lucide-react";
import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  buildSp1Grid,
  emptyCounts,
  formatCalc,
  type Sp1Column,
  type Sp1Counts,
  type Sp1Disposition,
  type Sp1LogRow,
} from "@/lib/dcc/sp1";
import { saveCallLog } from "@/app/(app)/dcc/call-log/actions";

/**
 * THE SP1 SHEET (DCC-SPEC §7, §8, §9) — Jeevan's Reference Calling Sheet,
 * rebuilt, and the whole of the Daily Compliance dashboard's top half.
 *
 * ── IT IS ALSO THE CALL LOG ────────────────────────────────────────────────
 * Account holder, 2026-09-17: the call log belongs on the dashboard and not in
 * the rail. So there is no second widget for entering the fifteen numbers —
 * YOU TYPE INTO THE SHEET, exactly as in the Google Sheet the screen replaces
 * (image "2. Mitul Call Log"). A separate entry form beside a grid of the same
 * fifteen rows would put two copies of one thing on one page and leave the
 * reader guessing which is authoritative.
 *
 * Open cells are the ones you are allowed to fill: one person selected, a day
 * that has not closed at 11:59 pm IST, and a table that actually exists. Every
 * other cell renders as plain text. The SERVER decides all three — `openDates`
 * and `fillFor` are computed in the page and re-checked inside `saveCallLog`,
 * so a client that lies gets a refusal, not a write.
 *
 * ── WHY IT LOOKS LIKE A SPREADSHEET AND NOT LIKE THE REST OF THE APP ───────
 * It is read side by side with the sheet it replaces, out loud, on the evening
 * call — "row 19 is down". So the reference image is followed to the letter: a
 * numbered gutter, a `Date` row over a lavender `Day` row, the sheet's own eight
 * label colours, hairline cell borders. Softening it into app furniture would
 * break the one thing it is for.
 *
 * ── WHY EVERY FIGURE IS DERIVED ON EACH RENDER ─────────────────────────────
 * The eight calculated rows AND the Weekly Total columns are pure functions of
 * the fifteen counts, so the component holds ONLY the fifteen and rebuilds the
 * rest with `buildSp1Grid` — the same function the 10 pm email uses. Keeping
 * totals in state and correcting them in an effect is how a weekly column comes
 * to disagree with the days it is made of.
 *
 * ── THE ONE LAYOUT RULE ────────────────────────────────────────────────────
 * A week plus its total is seven columns of figures and will not fit a phone.
 * The PAGE must never scroll sideways, so the overflow lives on this container
 * and nowhere else, and the gutter + label columns are sticky so you can still
 * tell which outcome you are reading after scrolling four days right.
 *
 * ── CELLS ARE KEYED BY COLUMN INDEX ───────────────────────────────────────
 * Not by label and date. A Weekly Total column has NO date and every one of them
 * is labelled "Weekly Total", so a two-week window produced two columns with
 * byte-identical keys and React dropped cells from the render. The index is the
 * only thing unique across the row.
 *
 * ── WHY `border-separate` AND NOT `border-collapse` ────────────────────────
 * Under `border-collapse` the borders belong to the TABLE, not to the cell, so a
 * `position: sticky` cell scrolls out from under its own rules and the frozen
 * label column bleeds into the figures. Every cell therefore draws its own right
 * and bottom edge, and the first row and first column close the box.
 */

/** The sheet's grid lines. Hairline grey inside, darker where a rule is meant. */
const LINE = "#B7B7B7";
const LINE_STRONG = "#666666";
/** The `Day` header strip — the sheet's lavender. */
const DAY_BG = "#D9D2E9";
/** An open cell: faintly warm, so "you can type here" is visible at a glance. */
const OPEN_BG = "#FFFDF5";

/**
 * The calculated block, rows 16–23.
 *
 * PLAIN WHITE except Total Calls, because that is what the sheet does. The row
 * tones in lib/dcc/sp1.ts still mark which rows are headline figures — the 10 pm
 * email uses them — but here only row 16 is given emphasis, as in the image.
 */
const CALC_STYLE: Record<string, { bg: string; fg: string }> = {
  head: { bg: "#434343", fg: "#FFFFFF" },
  good: { bg: "#FFFFFF", fg: "#1F2937" },
  none: { bg: "#FFFFFF", fg: "#1F2937" },
};

const HAIRLINE = `1px solid ${LINE}`;
const RULE = `1px solid ${LINE_STRONG}`;

/** Every cell closes its own right and bottom edge; see the header comment. */
const CELL: React.CSSProperties = { borderRight: HAIRLINE, borderBottom: HAIRLINE };

/** Total columns are the sheet's summary stripe: greyed, bold, darker left rule. */
function totalStyle(c: Sp1Column): React.CSSProperties {
  return c.kind === "total" ? { borderLeft: RULE, background: "#EFEFEF" } : {};
}

type Draft = Record<Sp1Disposition, string>;
type Drafts = Record<string, Draft>;

/** "" and any non-number read as 0 — a blank cell means none landed here. */
function numeric(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The rows as they arrived, folded into one draft per day. */
function seedDrafts(dates: readonly string[], rows: readonly Sp1LogRow[]): Drafts {
  const counts: Record<string, Sp1Counts> = {};
  for (const d of dates) counts[d] = emptyCounts();
  for (const r of rows) {
    const c = counts[r.logDate];
    if (c) c[r.disposition] += r.count;
  }
  const out: Drafts = {};
  for (const d of dates) {
    const draft = {} as Draft;
    // A zero shows as an empty cell, the way the sheet shows one you have not
    // filled. `0` typed deliberately still saves as 0 — both mean none.
    for (const k of SP1_DISPOSITIONS) draft[k] = counts[d]![k] === 0 ? "" : String(counts[d]![k]);
    out[d] = draft;
  }
  return out;
}

export interface Sp1SheetProps {
  /** The working days across the top, Monday→Saturday, Sunday omitted. */
  dates: string[];
  rows: Sp1LogRow[];
  /** Whose numbers may be typed into; null makes the whole sheet read-only. */
  fillFor: string | null;
  /** Which of `dates` have not closed for this viewer. Empty = nothing is open. */
  openDates: string[];
  /** Today, so the sheet can open scrolled to the column people actually want. */
  today: string;
  /** One line explaining why nothing can be typed — usually with a way out. */
  readOnlyNote?: React.ReactNode;
}

export function Sp1Sheet({
  dates,
  rows,
  fillFor,
  openDates,
  today,
  readOnlyNote,
}: Sp1SheetProps) {
  const open = React.useMemo(() => new Set(openDates), [openDates]);
  const canType = fillFor !== null && open.size > 0;

  const [drafts, setDrafts] = React.useState<Drafts>(() => seedDrafts(dates, rows));
  const [baseline, setBaseline] = React.useState<Drafts>(drafts);
  const [saving, startSaving] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* The window or the person can change under us — both are URL state, and Next
     re-renders this component rather than remounting it. Re-seeding on that is
     the difference between "the sheet followed the filter" and "the sheet still
     shows last week's numbers under this week's headings". */
  const signature = `${fillFor ?? ""}|${dates.join(",")}|${rows.length}`;
  const [seenSignature, setSeenSignature] = React.useState(signature);
  if (signature !== seenSignature) {
    const fresh = seedDrafts(dates, rows);
    setDrafts(fresh);
    setBaseline(fresh);
    setSeenSignature(signature);
    setError(null);
  }

  /** Which days have been typed into since the last save. */
  const dirtyDates = React.useMemo(
    () => dates.filter((d) => JSON.stringify(drafts[d]) !== JSON.stringify(baseline[d])),
    [dates, drafts, baseline],
  );

  /* The whole grid — day columns, Weekly Totals and the calculated block — is
     rebuilt from the drafts by the SAME function the server and the email use,
     so a number typed here lands in row 16 and in the weekly column at once. */
  const columns = React.useMemo(() => {
    const live: Sp1LogRow[] = [];
    for (const date of dates) {
      for (const d of SP1_DISPOSITIONS) {
        const n = numeric(drafts[date]?.[d] ?? "");
        if (n > 0) live.push({ employeeId: fillFor ?? "", logDate: date, disposition: d, count: n });
      }
    }
    return buildSp1Grid(dates, live);
  }, [dates, drafts, fillFor]);

  /* Open scrolled to today rather than to the oldest Monday. A two-week window
     is fourteen columns wide and the one people came to fill is the last. */
  const scroller = React.useRef<HTMLDivElement>(null);
  const todayCell = React.useRef<HTMLTableCellElement>(null);
  React.useEffect(() => {
    const box = scroller.current;
    const cell = todayCell.current;
    if (!box || !cell) return;
    // `offsetLeft` is relative to the scroller because it is the positioned
    // ancestor. 260px keeps the frozen gutter and label column in view.
    box.scrollLeft = Math.max(0, cell.offsetLeft - 260);
  }, [seenSignature]);

  function save() {
    if (!fillFor || dirtyDates.length === 0) return;
    setError(null);
    startSaving(async () => {
      for (const date of dirtyDates) {
        const counts = emptyCounts();
        for (const d of SP1_DISPOSITIONS) counts[d] = numeric(drafts[date]![d]);
        const res = await saveCallLog({ employeeId: fillFor, date, counts });
        if (!res.ok) {
          // STOP ON THE FIRST REFUSAL and keep every day dirty from here on, so
          // a rejected Tuesday cannot be silently dropped while Wednesday saves.
          setError(res.error);
          return;
        }
        setBaseline((b) => ({ ...b, [date]: drafts[date]! }));
      }
      setSaved(true);
      // A confirmation, not a state — it should fade rather than sit there
      // implying the sheet is still "saved" after the next keystroke.
      window.setTimeout(() => setSaved(false), 2200);
    });
  }

  const setCell = (date: string, d: Sp1Disposition, v: string) =>
    setDrafts((p) => ({ ...p, [date]: { ...p[date]!, [d]: v } }));

  return (
    <section className="rounded-xl bg-white" style={{ border: RULE }}>
      {/* ── THE TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <div className="mr-auto min-w-0">
          <h2 className="text-[14px] font-bold text-ink-strong">Call Log</h2>
          <p className="text-[12px] text-ink-muted">
            {canType
              ? "Type straight into the sheet. Blank means none; every total recalculates as you go."
              : (readOnlyNote ?? "This sheet is read-only.")}
          </p>
        </div>

        {canType ? (
          <button
            type="button"
            onClick={save}
            disabled={saving || dirtyDates.length === 0}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : saved ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
            {saving
              ? "Saving…"
              : dirtyDates.length === 0
                ? "Saved"
                : `Save ${dirtyDates.length} ${dirtyDates.length === 1 ? "day" : "days"}`}
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] font-semibold text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Read-only
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-b border-slate-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
        >
          {error}
        </p>
      )}

      {/* ── THE SHEET ───────────────────────────────────────────────────── */}
      <div ref={scroller} className="relative overflow-x-auto p-3">
        <table className="border-separate text-[12.5px]" style={{ borderSpacing: 0 }}>
          <caption className="sr-only">
            Call outcomes by day, with a weekly total after each Saturday. Rows 1–15 are the
            outcomes; rows 16–23 are calculated.
            {canType ? " Open days can be typed into." : ""}
          </caption>

          <thead>
            {/* DATE, then DAY — two header rows, as the sheet has them. The
                gutter is deliberately blank and borderless here: the sheet's
                numbering starts at the first outcome, not above the date. */}
            <tr>
              <th className="sticky left-0 z-20 w-10 bg-white" aria-hidden />
              <th
                scope="col"
                className="sticky left-10 z-20 min-w-[230px] bg-white px-3 py-1.5 text-left font-bold text-slate-900"
                style={{ ...CELL, borderTop: HAIRLINE, borderLeft: HAIRLINE }}
              >
                Date
              </th>
              {columns.map((c, ci) => (
                <th
                  key={`date-${ci}`}
                  ref={c.date === today ? todayCell : undefined}
                  scope="col"
                  className="min-w-[116px] whitespace-nowrap px-3 py-1.5 text-center font-bold tabular-nums text-slate-900"
                  style={{ ...CELL, borderTop: HAIRLINE, ...totalStyle(c) }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-white" aria-hidden />
              <th
                scope="col"
                className="sticky left-10 z-20 bg-white px-3 py-1.5 text-left font-bold text-slate-900"
                style={{ ...CELL, borderLeft: HAIRLINE }}
              >
                Day
              </th>
              {columns.map((c, ci) => (
                <th
                  key={`day-${ci}`}
                  scope="col"
                  className="whitespace-nowrap px-3 py-1.5 text-center font-bold text-slate-900"
                  style={{ ...CELL, background: DAY_BG, ...totalStyle(c) }}
                >
                  {/* A non-breaking space on the total column, so the strip keeps
                      its height and the two header rows stay aligned. */}
                  {c.weekday || " "}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {SP1_DISPOSITIONS.map((d, i) => {
              const tone = SP1_TONE_STYLE[SP1_TONE[d]];
              return (
                <tr key={d}>
                  {/* The sheet numbers its rows 1–23 and people refer to them by
                      number on the call, so the number is content and gets its
                      own column rather than being tucked inside the label. */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-10 bg-white px-2 py-1 text-right font-bold tabular-nums text-slate-900"
                    style={{ ...CELL, borderLeft: HAIRLINE }}
                  >
                    {i + 1}
                  </th>
                  <td
                    className="sticky left-10 z-10 px-3 py-1 text-left font-semibold"
                    style={{ ...CELL, background: tone.bg, color: tone.fg }}
                  >
                    {SP1_LABEL[d]}
                  </td>
                  {columns.map((c, ci) => {
                    const editable = canType && c.date !== null && open.has(c.date);
                    const key = `${d}-${ci}`;
                    if (editable) {
                      const date = c.date!;
                      return (
                        <td
                          key={key}
                          className="p-0"
                          style={{ ...CELL, background: OPEN_BG }}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`${SP1_LABEL[d]} on ${c.label}`}
                            value={drafts[date]?.[d] ?? ""}
                            placeholder="0"
                            disabled={saving}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setCell(date, d, e.target.value.replace(/[^\d]/g, ""))}
                            className="h-full w-full bg-transparent px-3 py-1 text-center tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-[color:var(--color-altus-red)]"
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={key}
                        className={`px-3 py-1 text-center tabular-nums ${
                          c.kind === "total" ? "font-bold" : ""
                        } ${c.counts[d] === 0 ? "text-slate-300" : "text-slate-900"}`}
                        style={{ ...CELL, ...totalStyle(c) }}
                      >
                        {c.counts[d]}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {SP1_CALC_ROWS.map((row, i) => {
              const s = CALC_STYLE[row.tone]!;
              /* The calculated block is ruled off from the fifteen, the way the
                 sheet separates "what was counted" from "what was worked out".
                 It is never typed into — every figure in it is derived. */
              const top = i === 0 ? { borderTop: RULE } : {};
              return (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white px-2 py-1 text-right font-bold tabular-nums text-slate-900"
                    style={{ ...CELL, borderLeft: HAIRLINE, ...top }}
                  >
                    {SP1_DISPOSITIONS.length + i + 1}
                  </th>
                  <td
                    className="sticky left-10 z-10 px-3 py-1 text-left font-semibold"
                    style={{ ...CELL, background: s.bg, color: s.fg, ...top }}
                  >
                    {row.label}
                  </td>
                  {columns.map((c, ci) => (
                    <td
                      key={`${row.key}-${ci}`}
                      className={`px-3 py-1 text-center font-semibold tabular-nums text-slate-900 ${
                        c.kind === "total" ? "font-bold" : ""
                      }`}
                      style={{ ...CELL, ...totalStyle(c), ...top }}
                    >
                      {formatCalc(row, c.metrics)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
