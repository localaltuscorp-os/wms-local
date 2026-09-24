import "server-only";

import { monthWeeks, parseDay, minToLabel } from "./grid";
import { monthName } from "./period";
import { categoryColors } from "./taxonomy";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * Build a standalone HTML document of one month, in the "Excel-sheet" shape
 * (dark weekday header, 7-column week rows, compact colour-coded pills) — for
 * headless-Chromium export to PDF/JPG (`lib/pdf/chromium.ts`). No client JS,
 * no external requests: every colour comes from `categoryColors`, inline.
 *
 * Deliberately plain HTML/CSS, not a server-rendered copy of the React month
 * view — the export only ever needs to look right printed once, not stay in
 * sync with every interactive affordance (hover, click, drag) the live grid
 * carries.
 */
export function buildMonthExportHtml(opts: {
  ownerName: string;
  anchor: string;
  events: ExecEventRow[];
}): string {
  const { ownerName, anchor, events } = opts;
  const weeks = monthWeeks(anchor);
  const byDay = new Map<string, ExecEventRow[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const rows = weeks
    .map((w) => {
      const cells = w.days
        .map((d) => {
          const list = (byDay.get(d.ymd) ?? []).sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1));
          const dateNum = parseDay(d.ymd).getUTCDate();
          const pills = list
            .map((e) => {
              const col = categoryColors(e.categoryKey);
              const time = e.allDay ? "" : e.startMin != null ? `${minToLabel(e.startMin)} · ` : "";
              return `<div style="background:${col.bg};color:${col.deep};border-left:3px solid ${col.base};border-radius:3px;padding:2px 4px;margin-bottom:2px;font-size:9px;font-weight:600;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${time}${escapeHtml(e.title)}</div>`;
            })
            .join("");
          const bg = d.inMonth ? "#ffffff" : "#f4f4f5";
          const color = d.inMonth ? "#0f172a" : "#a1a1aa";
          return `<td style="border:1px solid #e2e2e5;vertical-align:top;padding:4px;width:14.28%;height:92px;background:${bg};">
            <div style="font-size:10px;font-weight:700;color:${color};margin-bottom:3px;">${dateNum}</div>
            ${pills}
          </td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headerCells = WEEKDAYS.map(
    (d) =>
      `<th style="background:#0f172a;color:#ffffff;padding:6px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${d}</th>`,
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
</style>
</head>
<body>
  <div style="padding: 16px 18px 10px;">
    <div style="font-size:18px;font-weight:800;color:#A80400;">${escapeHtml(monthName(anchor, true))}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(ownerName)}'s calendar — Monthly Events Master</div>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
