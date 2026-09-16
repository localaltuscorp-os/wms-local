import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  formatCalc,
  type Sp1Column,
} from "@/lib/dcc/sp1";

/**
 * THE SP1 GRID (DCC-SPEC §8) — Jeevan's Reference Calling Sheet, rebuilt.
 *
 * Fifteen outcomes down the side in the sheet's own colours, working days
 * across the top, a Weekly Total after each Saturday, then the calculated block.
 *
 * A SERVER COMPONENT. It renders numbers and nothing is interactive, so there is
 * no reason to ship any of it to the browser.
 *
 * ── THE ONE LAYOUT RULE ────────────────────────────────────────────────────
 * A week plus its total is seven columns of figures and will not fit a phone.
 * The PAGE must never scroll sideways, so the overflow lives on this container
 * and nowhere else, and the row header is sticky so you can still tell which
 * outcome you are reading after scrolling four days right.
 */

/** Tones for the calculated block, matching the sheet's own emphasis. */
const CALC_STYLE: Record<string, { bg: string; fg: string; weight: string }> = {
  head: { bg: "#434343", fg: "#FFFFFF", weight: "800" },
  good: { bg: "#D9EAD3", fg: "#274E13", weight: "700" },
  none: { bg: "#F5F5F5", fg: "#3C4043", weight: "600" },
};

export function Sp1Grid({ columns }: { columns: Sp1Column[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-[12.5px]">
        <caption className="sr-only">
          Call outcomes by day, with a weekly total after each Saturday.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[230px] border-b border-slate-300 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"
            >
              Status
            </th>
            {columns.map((c) => (
              <th
                key={c.label + (c.date ?? "")}
                scope="col"
                className={`whitespace-nowrap border-b border-slate-300 px-3 py-2 text-right text-[11px] font-bold text-slate-600 ${
                  c.kind === "total"
                    ? "border-l-2 border-l-slate-400 bg-slate-100"
                    : "bg-slate-50"
                }`}
              >
                <span className="block tabular-nums">{c.label}</span>
                {/* A non-breaking space on the total column, so the header's
                    second line keeps its height and the two rows stay aligned. */}
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {c.weekday || " "}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {SP1_DISPOSITIONS.map((d, i) => {
            const tone = SP1_TONE_STYLE[SP1_TONE[d]];
            return (
              <tr key={d}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-white/40 px-3 py-1.5 text-left font-semibold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {/* The sheet numbers its rows 1–15 and people refer to them by
                      number in the daily call, so the number is content. */}
                  <span className="mr-2 inline-block w-4 text-right opacity-60 tabular-nums">
                    {i + 1}
                  </span>
                  {SP1_LABEL[d]}
                </th>
                {columns.map((c) => (
                  <td
                    key={c.label + (c.date ?? "")}
                    className={`border-b border-slate-100 px-3 py-1.5 text-right tabular-nums ${
                      c.kind === "total"
                        ? "border-l-2 border-l-slate-400 bg-slate-50 font-bold"
                        : ""
                    } ${c.counts[d] === 0 ? "text-slate-300" : "text-slate-800"}`}
                  >
                    {c.counts[d]}
                  </td>
                ))}
              </tr>
            );
          })}

          {SP1_CALC_ROWS.map((row, i) => {
            const s = CALC_STYLE[row.tone]!;
            return (
              <tr key={row.key} className={i === 0 ? "border-t-2 border-slate-400" : ""}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-white/40 px-3 py-1.5 text-left"
                  style={{ background: s.bg, color: s.fg, fontWeight: s.weight }}
                >
                  <span className="mr-2 inline-block w-4 text-right opacity-60 tabular-nums">
                    {SP1_DISPOSITIONS.length + i + 1}
                  </span>
                  {row.label}
                </th>
                {columns.map((c) => (
                  <td
                    key={c.label + (c.date ?? "")}
                    className={`border-b border-slate-100 px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700 ${
                      c.kind === "total"
                        ? "border-l-2 border-l-slate-400 bg-slate-100"
                        : "bg-slate-50"
                    }`}
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
  );
}
