import { requireUser } from "@/lib/auth/current";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import { listSalaryBreakup } from "@/lib/queries/salary-breakup";
import {
  toPayrollRows,
  toCompanySubtotals,
  PAYROLL_COLUMNS,
} from "@/lib/salary/payroll-rows";

/**
 * GET /salary/export.csv?month=YYYY-MM — admin-only payroll CSV of the on-screen
 * salary sheet (deduped, ex-staff excluded). Money as raw numbers so Sir can
 * total/pay in Excel/Sheets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonthIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** RFC-4180 field quoting. */
function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await isFinanceViewer(me))) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();

  const rows = toPayrollRows(await listSalaryBreakup(month));
  // Group the detail by paying-from entity, then by name — so each company's
  // people sit together and get their own subtotal row.
  const grouped = [...rows].sort(
    (a, b) => a.entity.localeCompare(b.entity) || a.employee.localeCompare(b.employee),
  );
  const companies = toCompanySubtotals(rows);

  const NCOL = PAYROLL_COLUMNS.length;
  const blank = Array<string>(NCOL).fill("").join(",");

  const lines: string[] = [];

  // ── Section 1: COMPANY BREAKDOWN (paying-from summary) ──
  lines.push(csvCell("COMPANY BREAKDOWN — paying from"));
  lines.push(
    ["Company", "Headcount", "Payable", "PT", "After PT", "Advance", "Prev. Pending", "Final Payment", "Net Payable (incl. wave-off)"]
      .map(csvCell)
      .join(","),
  );
  for (const c of companies) {
    lines.push(
      [
        csvCell(c.entity),
        csvCell(c.headcount),
        csvCell(c.payableAfterLeave.toFixed(2)),
        csvCell(c.pt.toFixed(2)),
        csvCell(c.payableAfterPt.toFixed(2)),
        csvCell(c.advance.toFixed(2)),
        csvCell(c.previousPending.toFixed(2)),
        csvCell(c.finalPayment.toFixed(2)),
        csvCell(c.netPayable.toFixed(2)),
      ].join(","),
    );
  }
  lines.push(
    [
      csvCell("ALL COMPANIES"),
      csvCell(rows.length),
      csvCell(companies.reduce((s, c) => s + c.payableAfterLeave, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.pt, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.payableAfterPt, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.advance, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.previousPending, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.finalPayment, 0).toFixed(2)),
      csvCell(companies.reduce((s, c) => s + c.netPayable, 0).toFixed(2)),
    ].join(","),
  );
  lines.push(blank);

  // ── Section 2: DETAIL — one row per person, grouped by entity w/ subtotals ──
  lines.push(PAYROLL_COLUMNS.map((c) => csvCell(c.label)).join(","));

  const subtotalRow = (c: (typeof companies)[number]): string =>
    PAYROLL_COLUMNS.map((col) => {
      if (col.key === "employee") return csvCell(`${c.entity} — subtotal (${c.headcount})`);
      if (col.key === "payableAfterLeave") return csvCell(c.payableAfterLeave.toFixed(2));
      if (col.key === "pt") return csvCell(c.pt.toFixed(2));
      if (col.key === "payableAfterPt") return csvCell(c.payableAfterPt.toFixed(2));
      if (col.key === "advance") return csvCell(c.advance.toFixed(2));
      if (col.key === "previousPending") return csvCell(c.previousPending.toFixed(2));
      if (col.key === "finalPayment") return csvCell(c.finalPayment.toFixed(2));
      if (col.key === "netPayable") return csvCell(c.netPayable.toFixed(2));
      return "";
    }).join(",");

  let curEntity: string | null = null;
  const byEntity = new Map(companies.map((c) => [c.entity, c]));
  for (const r of grouped) {
    const entity = r.entity?.trim() || "Unassigned";
    if (curEntity !== null && entity !== curEntity) {
      const sub = byEntity.get(curEntity);
      if (sub) lines.push(subtotalRow(sub));
    }
    curEntity = entity;
    lines.push(
      PAYROLL_COLUMNS.map((c) => {
        const v = r[c.key];
        return csvCell(v == null ? "" : v);
      }).join(","),
    );
  }
  if (curEntity !== null) {
    const sub = byEntity.get(curEntity);
    if (sub) lines.push(subtotalRow(sub));
  }

  // Grand totals row for the money columns (blank Sr).
  const totals = PAYROLL_COLUMNS.map((c) => {
    if (c.key === "employee") return csvCell("TOTAL — ALL");
    if (c.money) return csvCell(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0).toFixed(2));
    return "";
  });
  lines.push(totals.join(","));

  const body = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="Payroll-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
