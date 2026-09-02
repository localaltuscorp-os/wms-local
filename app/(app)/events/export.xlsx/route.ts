import ExcelJS from "exceljs";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { eventsAccess } from "@/lib/monthly-events/access";
import { formatDate } from "@/lib/format";
import { monthlyEventsEnabled } from "@/lib/monthly-events/flag";
import {
  getMonthEvents,
  listCategories,
  listObligations,
} from "@/lib/queries/monthly-events";
import {
  DAY_START_MIN,
  SLOT_MIN,
  SLOTS_PER_DAY,
  minToLabel,
  slotIndexFromMin,
} from "@/lib/monthly-events/types";
import type { CalendarEvent, EventCategory } from "@/lib/monthly-events/types";

/**
 * GET /events/export.xlsx?month=YYYY-MM
 *
 * Monthly Events Master workbook (design §9) — three sheets:
 *   1. "Month Grid"  — stacked weekly bands (rows = 30-min slots 07:00–21:00,
 *                      cols = Mon–Sun), event titles in coloured cells, all-day
 *                      event banner row per week.
 *   2. "Legend"      — every active category: swatch + name + live count.
 *   3. "Obligations" — the compulsory-session masters + this-month auto-count.
 *
 * Gated to any module viewer (`eventsAccess`); mirrors the salary export route's
 * attachment / Content-Disposition shape (exceljs instead of SheetJS).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current month "YYYY-MM" in IST. */
function currentMonthIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 7);
}

/** #rrggbb → "FFrrggbb" (exceljs ARGB); tolerant of missing/short hex. */
function toArgb(hex: string | null | undefined, fallback = "64748B"): string {
  const c = (hex ?? "").replace(/[^0-9a-fA-F]/g, "");
  const six = c.length >= 6 ? c.slice(0, 6) : fallback;
  return `FF${six.toUpperCase()}`;
}

/** Black or white text ARGB for a given background hex, by relative luminance. */
function readableArgb(hex: string | null | undefined): string {
  const c = (hex ?? "").replace(/[^0-9a-fA-F]/g, "");
  if (c.length < 6) return "FFFFFFFF";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? "FF1A1A1A" : "FFFFFFFF";
}

function chunkWeeks<T>(days: T[]): T[][] {
  const weeks: T[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function GET(request: Request): Promise<Response> {
  if (!monthlyEventsEnabled()) return new Response("Not found", { status: 404 });

  const access = await eventsAccess();
  if (!access) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();
  const [yr, mo] = month.split("-").map(Number);
  const anchor = new Date(yr!, mo! - 1, 1);
  // FY Apr–Mar: months Jan–Mar belong to the prior FY start year.
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const from = format(gridStart, "yyyy-MM-dd");
  const to = format(gridEnd, "yyyy-MM-dd");

  const [categories, events, obligations] = await Promise.all([
    listCategories(),
    getMonthEvents(from, to),
    listObligations(),
  ]);

  const catById = new Map<string, EventCategory>(categories.map((c) => [c.id, c]));
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.eventDate) ?? [];
    list.push(e);
    eventsByDate.set(e.eventDate, list);
  }

  const eventColor = (e: CalendarEvent): string => {
    if (e.colorOverride) return e.colorOverride;
    const cat = e.categoryId ? catById.get(e.categoryId) : undefined;
    return cat?.color ?? "#64748B";
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Altus Corp — Monthly Events Master";
  wb.created = new Date();

  // ── Sheet 1: Month Grid ────────────────────────────────────────────────
  const grid = wb.addWorksheet("Month Grid", {
    views: [{ state: "frozen", xSplit: 1 }],
  });
  grid.getColumn(1).width = 11;
  for (let c = 2; c <= 8; c++) grid.getColumn(c).width = 22;

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
    left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
    right: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
  };

  // Title row
  const titleRow = grid.addRow([`Monthly Events Master — ${format(anchor, "MMMM yyyy")}`]);
  grid.mergeCells(titleRow.number, 1, titleRow.number, 8);
  titleRow.getCell(1).font = { bold: true, size: 15, color: { argb: "FF0E7490" } };
  titleRow.height = 22;
  grid.addRow([]);

  const weeks = chunkWeeks(eachDayOfInterval({ start: gridStart, end: gridEnd }));

  for (const week of weeks) {
    const weekLabel = `Week of ${formatDate(week[0]!)}`;
    const wl = grid.addRow([weekLabel]);
    grid.mergeCells(wl.number, 1, wl.number, 8);
    wl.getCell(1).font = { bold: true, size: 11, color: { argb: "FF334155" } };
    wl.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };

    // Header: Time + 7 dated day columns
    const header = grid.addRow([
      "Time",
      ...week.map((d, i) => `${WEEKDAYS[i]} ${formatDate(d)}`),
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: "FF475569" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = thinBorder;
    });

    // All-day banner row (all-day events)
    const allDayCells: (string | null)[] = ["All-day"];
    const allDayFills: (string | null)[] = [null];
    for (const d of week) {
      const iso = format(d, "yyyy-MM-dd");
      const dayEvents = eventsByDate.get(iso) ?? [];
      const banners: string[] = [];
      let fill: string | null = null;
      for (const e of dayEvents.filter((x) => x.allDay)) {
        banners.push(e.title);
        if (!fill) fill = eventColor(e);
      }
      allDayCells.push(banners.length ? banners.join(" · ") : null);
      allDayFills.push(fill);
    }
    const adRow = grid.addRow(allDayCells);
    adRow.eachCell((cell, col) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.font = { size: 9, italic: true, color: { argb: "FF334155" } };
      const fill = allDayFills[col - 1];
      if (col > 1 && fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(fill) } };
        cell.font = { size: 9, italic: true, color: { argb: readableArgb(fill) } };
      }
    });
    if (adRow.getCell(1)) {
      adRow.getCell(1).font = { size: 9, bold: true, color: { argb: "FF64748B" } };
    }

    // 28 slot rows
    const firstSlotRowNum = grid.rowCount + 1;
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const min = DAY_START_MIN + s * SLOT_MIN;
      const isHour = min % 60 === 0;
      const row = grid.addRow([isHour ? minToLabel(min) : ""]);
      row.getCell(1).font = { size: 9, color: { argb: "FF94A3B8" }, bold: isHour };
      row.getCell(1).alignment = { vertical: "top", horizontal: "right" };
      for (let c = 2; c <= 8; c++) {
        row.getCell(c).border = {
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
          top: { style: isHour ? "thin" : "hair", color: { argb: "FFE2E8F0" } },
        };
      }
    }

    // Place timed events into their start-slot cell, tint the spanned rows.
    week.forEach((d, dayIdx) => {
      const iso = format(d, "yyyy-MM-dd");
      const col = 2 + dayIdx;
      const timed = (eventsByDate.get(iso) ?? [])
        .filter((e) => !e.allDay && e.startMin != null)
        .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
      for (const e of timed) {
        const startSlot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, slotIndexFromMin(e.startMin!)));
        const endMin = e.endMin ?? e.startMin! + SLOT_MIN;
        const endSlot = Math.max(
          startSlot + 1,
          Math.min(SLOTS_PER_DAY, Math.ceil((endMin - DAY_START_MIN) / SLOT_MIN)),
        );
        const color = eventColor(e);
        const argb = toArgb(color);
        const textArgb = readableArgb(color);
        for (let s = startSlot; s < endSlot; s++) {
          const cell = grid.getRow(firstSlotRowNum + s).getCell(col);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
        }
        const head = grid.getRow(firstSlotRowNum + startSlot).getCell(col);
        const tent = e.status === "tentative" ? " (TENT)" : "";
        const loc = e.location ? ` @ ${e.location}` : "";
        const existing = typeof head.value === "string" ? `${head.value} · ` : "";
        head.value = `${existing}${e.title}${loc}${tent}`;
        head.font = { size: 9, bold: true, color: { argb: textArgb } };
        head.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      }
    });

    grid.addRow([]); // separator
  }

  // ── Sheet 2: Legend ────────────────────────────────────────────────────
  const legend = wb.addWorksheet("Legend");
  legend.columns = [
    { header: "", key: "swatch", width: 6 },
    { header: "Category", key: "name", width: 28 },
    { header: "Colour", key: "hex", width: 12 },
    { header: "Events this month", key: "count", width: 18 },
  ];
  legend.getRow(1).font = { bold: true, color: { argb: "FF475569" } };
  const countByCat = new Map<string, number>();
  for (const e of events) {
    if (!e.categoryId) continue;
    countByCat.set(e.categoryId, (countByCat.get(e.categoryId) ?? 0) + 1);
  }
  for (const c of categories) {
    const row = legend.addRow({
      swatch: "",
      name: c.name,
      hex: c.color,
      count: countByCat.get(c.id) ?? 0,
    });
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: toArgb(c.color) },
    };
    row.getCell(1).border = thinBorder;
  }

  // ── Sheet 3: Obligations ───────────────────────────────────────────────
  const obl = wb.addWorksheet("Obligations");
  obl.columns = [
    { header: "Obligation", key: "name", width: 30 },
    { header: "Counterparty", key: "counterparty", width: 20 },
    { header: "Cadence", key: "cadence", width: 12 },
    { header: "Monthly Target", key: "target", width: 14 },
    { header: "Compulsory", key: "compulsory", width: 12 },
    { header: "This Month", key: "count", width: 12 },
    { header: "Penalty Note", key: "penalty", width: 36 },
  ];
  obl.getRow(1).font = { bold: true, color: { argb: "FF475569" } };
  const oblCount = new Map<string, number>();
  const monthPrefix = month; // YYYY-MM
  for (const e of events) {
    if (e.obligationId && e.eventDate.startsWith(monthPrefix)) {
      oblCount.set(e.obligationId, (oblCount.get(e.obligationId) ?? 0) + 1);
    }
  }
  for (const o of obligations) {
    obl.addRow({
      name: o.name,
      counterparty: o.counterparty ?? "",
      cadence: o.cadence,
      target: o.targetCount,
      compulsory: o.isCompulsory ? "Yes" : "No",
      count: oblCount.get(o.id) ?? 0,
      penalty: o.penaltyNote ?? "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Monthly-Events-${month}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
