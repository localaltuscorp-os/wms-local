import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  describeDay,
  formatCalc,
  metricsOf,
  type Sp1Counts,
} from "@/lib/dcc/sp1";

/**
 * THE SP1 DAY CARD — image 2 of the brief, "SP 5 — Sales Dashboard".
 *
 * One date, twenty-three numbered rows down the side, one value column. The same
 * numbers the grid shows across a fortnight, narrowed to the single day a
 * dashboard opens on — which is the view people actually read out loud on the
 * evening call.
 *
 * Deliberately NOT built from the grid component. The grid's job is comparison
 * across days and it earns its horizontal scroll; this is one column and must
 * fit a phone without scrolling at all.
 */
export function Sp1DayCard({ date, counts }: { date: string; counts: Sp1Counts }) {
  const { label, weekday } = describeDay(date);
  const metrics = metricsOf(counts);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-[13px] font-bold text-ink-strong">Call outcomes</h2>
        <p className="text-[12px] font-semibold text-ink-muted">
          {label} · {weekday}
        </p>
      </header>

      <table className="w-full border-collapse text-[12.5px]">
        <caption className="sr-only">
          The fifteen call outcomes and the calculated block for {label}.
        </caption>
        <tbody>
          {SP1_DISPOSITIONS.map((d, i) => {
            const tone = SP1_TONE_STYLE[SP1_TONE[d]];
            return (
              <tr key={d}>
                <th
                  scope="row"
                  className="border-b border-white/40 px-3 py-1 text-left font-semibold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  <span className="mr-2 inline-block w-4 text-right opacity-60 tabular-nums">
                    {i + 1}
                  </span>
                  {SP1_LABEL[d]}
                </th>
                <td
                  className={`w-24 border-b border-slate-100 px-3 py-1 text-right tabular-nums ${
                    counts[d] === 0 ? "text-slate-300" : "text-slate-800"
                  }`}
                >
                  {counts[d]}
                </td>
              </tr>
            );
          })}
          {SP1_CALC_ROWS.map((row, i) => (
            <tr key={row.key} className={i === 0 ? "border-t-2 border-slate-400" : ""}>
              <th
                scope="row"
                className={`border-b border-white/40 px-3 py-1 text-left font-bold ${
                  row.tone === "head"
                    ? "bg-[#434343] text-white"
                    : row.tone === "good"
                      ? "bg-[#D9EAD3] text-[#274E13]"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                <span className="mr-2 inline-block w-4 text-right opacity-60 tabular-nums">
                  {SP1_DISPOSITIONS.length + i + 1}
                </span>
                {row.label}
              </th>
              <td className="border-b border-slate-100 bg-slate-50 px-3 py-1 text-right font-semibold tabular-nums text-slate-700">
                {formatCalc(row, metrics)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
