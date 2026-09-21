import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  emptyCounts,
  formatCalc,
  metricsOf,
  type Sp1Counts,
  type Sp1LogRow,
} from "@/lib/dcc/sp1";
import { escapeHtml } from "@/lib/dcc/daily-report";

/**
 * THE SP1 BLOCK OF THE 10 PM EMAIL (DCC-SPEC §10).
 *
 * The brief asks for the report in "Jeevan SP1 Google report format", so the
 * email leads with the sheet: fifteen outcomes in their own colours, then the
 * calculated block. The compliance summary follows it.
 *
 * ── WHY EVERY STYLE IS INLINE ──────────────────────────────────────────────
 * Gmail strips `<style>` blocks and every class with them. A colour that only
 * exists in a stylesheet arrives as black on white, which for THIS table is not
 * a cosmetic loss — the bands are how the sheet is read. So each cell carries
 * its own `style`, exactly as an email must.
 *
 * ── WHY IT SHARES lib/dcc/sp1.ts AND DEFINES NOTHING ITSELF ────────────────
 * The email and the screen must never disagree about what "Connected" means.
 * Every label, colour and formula here comes from the one module that owns them.
 */

/** One person's fifteen numbers for the day, from the day's rows. */
export function countsForPerson(rows: readonly Sp1LogRow[], employeeId: string): Sp1Counts {
  const c = emptyCounts();
  for (const r of rows) if (r.employeeId === employeeId) c[r.disposition] += r.count;
  return c;
}

/** Everybody's numbers summed — the team block at the top of a team report. */
export function countsForAll(rows: readonly Sp1LogRow[], ids: ReadonlySet<string>): Sp1Counts {
  const c = emptyCounts();
  for (const r of rows) if (ids.has(r.employeeId)) c[r.disposition] += r.count;
  return c;
}

const TD = "padding:3px 8px;border-bottom:1px solid #EEE;font-size:12px";

/**
 * The SP1 table for one set of counts.
 *
 * A zero is greyed so the eye lands on the rows that actually happened — on a
 * normal day eleven of the fifteen are zero, and an undimmed column of 0s reads
 * as noise rather than as information.
 */
export function sp1EmailTable(counts: Sp1Counts, heading: string): string {
  const m = metricsOf(counts);

  const rows = SP1_DISPOSITIONS.map((d, i) => {
    const tone = SP1_TONE_STYLE[SP1_TONE[d]];
    const n = counts[d];
    return `<tr>
      <td style="${TD};background:${tone.bg};color:${tone.fg};font-weight:600">
        <span style="opacity:.55">${i + 1}.</span> ${escapeHtml(SP1_LABEL[d])}
      </td>
      <td style="${TD};text-align:right;font-variant-numeric:tabular-nums;color:${n === 0 ? "#C6CBD2" : "#202124"}">${n}</td>
    </tr>`;
  }).join("");

  const calc = SP1_CALC_ROWS.map((row, i) => {
    const bg = row.tone === "head" ? "#434343" : row.tone === "good" ? "#D9EAD3" : "#F1F3F4";
    const fg = row.tone === "head" ? "#FFFFFF" : row.tone === "good" ? "#274E13" : "#3C4043";
    return `<tr>
      <td style="${TD};background:${bg};color:${fg};font-weight:700${i === 0 ? ";border-top:2px solid #9AA0A6" : ""}">
        <span style="opacity:.55">${SP1_DISPOSITIONS.length + i + 1}.</span> ${escapeHtml(row.label)}
      </td>
      <td style="${TD};text-align:right;font-weight:600;font-variant-numeric:tabular-nums;background:#FAFAFA${i === 0 ? ";border-top:2px solid #9AA0A6" : ""}">${escapeHtml(formatCalc(row, m))}</td>
    </tr>`;
  }).join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:460px;border-collapse:collapse;border:1px solid #E0E0E0;border-radius:8px;overflow:hidden;margin:0 0 16px">
    <tr><td colspan="2" style="padding:8px 10px;background:#FFF;border-bottom:1px solid #E0E0E0;font-size:12px;font-weight:700;color:#202124">${escapeHtml(heading)}</td></tr>
    ${rows}${calc}
  </table>`;
}

/**
 * The whole SP1 section of one email.
 *
 * A self report gets one table. A team or all-employee report gets the combined
 * table FIRST and then each person's — the manager's question is "how did the
 * team do", and making them add up nine tables to answer it is how a daily
 * report stops being read.
 */
export function sp1EmailSection(args: {
  rows: readonly Sp1LogRow[];
  people: { id: string; name: string }[];
  dayLabel: string;
}): string {
  const { rows, people, dayLabel } = args;
  if (people.length === 0) return "";

  const ids = new Set(people.map((p) => p.id));
  const anyCalls = rows.some((r) => ids.has(r.employeeId) && r.count > 0);
  if (!anyCalls) {
    return `<p style="margin:0 0 16px;font-size:12.5px;color:#5F6368">No calls were logged on ${escapeHtml(dayLabel)}.</p>`;
  }

  if (people.length === 1) {
    const p = people[0]!;
    return sp1EmailTable(countsForPerson(rows, p.id), `${p.name} · Call outcomes`);
  }

  const combined = sp1EmailTable(countsForAll(rows, ids), `Everyone · Call outcomes`);
  const each = people
    .filter((p) => rows.some((r) => r.employeeId === p.id && r.count > 0))
    .map((p) => sp1EmailTable(countsForPerson(rows, p.id), `${p.name} · Call outcomes`))
    .join("");
  return combined + each;
}
