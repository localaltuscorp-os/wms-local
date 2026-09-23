import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth/current";
import { apiViewDenial } from "@/lib/permissions/api-guard";
import { listActivityLogs } from "@/lib/queries/logs";
import { parseLogFilters, type LogFilters } from "@/lib/logs/filters";
import { auditLog } from "@/lib/logs/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 10_000;

/**
 * GET /admin/logs/export — the Logs view as an Excel workbook.
 *
 * Honours the SAME filter parser the page uses, so the exported rows are exactly
 * what the administrator sees on screen. `?month=YYYY-MM` exports a whole IST
 * month (other filters still apply on top of it). The file is generated
 * server-side from the filtered query — the browser never loads the month.
 *
 * Exporting is itself audited: on success and on failure an EXPORT log is
 * written (who, when, the applied filters, the date range, the row count, the
 * format and the outcome) — immutable like every other log.
 */

interface FieldChange {
  field?: string;
  before?: unknown;
  after?: unknown;
}

function changesText(changes: unknown): { before: string; after: string } {
  if (Array.isArray(changes)) {
    const arr = changes as FieldChange[];
    return {
      before: arr.map((c) => `${c.field ?? ""}: ${fmtVal(c.before)}`).join("\n"),
      after: arr.map((c) => `${c.field ?? ""}: ${fmtVal(c.after)}`).join("\n"),
    };
  }
  return { before: "", after: "" };
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function estMin(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && "estimatedMs" in (metadata as object)) {
    const ms = Number((metadata as { estimatedMs?: number }).estimatedMs ?? 0);
    return ms > 0 ? Math.round(ms / 60_000).toString() : "";
  }
  return "";
}

export async function GET(request: Request): Promise<Response> {
  // The MODULE gate — a route handler renders no layout, so `requirePathView`
  // never runs for it. Refuse a denied admin before any work, matching the other
  // admin export handlers.
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  const me = await requireAdmin();

  const url = new URL(request.url);
  const sp: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of url.searchParams) sp[k] = v;

  const filters = parseLogFilters(sp);

  // Whole-month mode: constrain to the IST month named, on top of other filters.
  const month = url.searchParams.get("month");
  let applied: LogFilters = filters;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00+05:30`);
    const end = new Date(start);
    // `start` is the PREVIOUS day in UTC (month start IST = prior-day 18:30Z), so
    // stepping the UTC month alone keeps its day number and over/under-shoots the
    // month end (Mar→Mar 28, Sep→Oct 1). Pin to the 1st first, then step.
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1);
    applied = { ...filters, from: start.toISOString(), to: end.toISOString() };
  }

  const page = await listActivityLogs({ ...applied, page: 1, pageSize: MAX_EXPORT_ROWS });
  const before = applied.from ?? "";
  const after = applied.to ?? "";

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Altus Corp WMS";
    const ws = wb.addWorksheet("Logs");

    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Time", key: "time", width: 10 },
      { header: "Person", key: "person", width: 22 },
      { header: "Employee ID", key: "employeeId", width: 38 },
      { header: "Function", key: "fn", width: 18 },
      { header: "Designation", key: "designation", width: 18 },
      { header: "Entity", key: "entity", width: 18 },
      { header: "Module", key: "module", width: 16 },
      { header: "Page", key: "page", width: 18 },
      { header: "Route", key: "route", width: 30 },
      { header: "Event Type", key: "eventType", width: 16 },
      { header: "Action", key: "action", width: 20 },
      { header: "Resource Type", key: "resourceType", width: 16 },
      { header: "Resource ID", key: "resourceId", width: 38 },
      { header: "Resource Name", key: "resourceName", width: 24 },
      { header: "Status", key: "status", width: 10 },
      { header: "Reason", key: "reason", width: 30 },
      { header: "Estimated Time (min)", key: "estMin", width: 12 },
      { header: "Before Changes", key: "before", width: 40 },
      { header: "After Changes", key: "after", width: 40 },
      { header: "Actor Type", key: "actorType", width: 12 },
    ];

    const ist = (d: Date) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    for (const r of page.rows) {
      const d = ist(r.eventAt);
      const chg = changesText(r.changes);
      ws.addRow({
        date: d.toISOString().slice(0, 10),
        time: d.toISOString().slice(11, 19),
        person: r.employeeName ?? "",
        employeeId: r.employeeId ?? "",
        fn: r.functionName ?? "",
        designation: r.designationName ?? "",
        entity: r.entityName ?? "",
        module: r.module ?? "",
        page: r.page ?? "",
        route: r.route ?? "",
        eventType: r.eventType,
        action: r.action ?? "",
        resourceType: r.resourceType ?? "",
        resourceId: r.resourceId ?? "",
        resourceName: r.resourceName ?? "",
        status: r.status ?? "",
        reason: r.reason ?? "",
        estMin: estMin(r.metadata),
        before: chg.before,
        after: chg.after,
        actorType: r.actorType ?? "",
      });
    }

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    ws.autoFilter = { from: "A1", to: "U1" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const body = Buffer.from(buf as ArrayBuffer);

    await auditLog({
      eventType: "EXPORT",
      employeeId: me.id,
      route: "/admin/logs",
      module: "Admin Panel",
      page: "Logs",
      resourceType: "logs",
      resourceName: `logs-export.xlsx`,
      action: "export",
      status: "SUCCESS",
      metadata: {
        format: "xlsx",
        rows: page.rows.length,
        month: month ?? null,
        filters: {
          q: applied.q,
          functionIds: applied.functionIds,
          employeeIds: applied.employeeIds,
          entityIds: applied.entityIds,
          nodes: applied.nodes,
          eventTypes: applied.eventTypes,
          statuses: applied.statuses,
          from: before,
          to: after,
        },
      },
    });

    const name = month
      ? `Altus-Corp-logs-${month}.xlsx`
      : `Altus-Corp-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    await auditLog({
      eventType: "EXPORT",
      employeeId: me.id,
      route: "/admin/logs",
      module: "Admin Panel",
      page: "Logs",
      action: "export",
      status: "FAILED",
      reason: err instanceof Error ? err.message : "export failed",
      metadata: { format: "xlsx", from: before, to: after },
    }).catch(() => {});
    return new Response("Export failed", { status: 500 });
  }
}
