import * as XLSX from "xlsx";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCcCards, listCcMonths } from "@/lib/queries/accounts-cc";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

/**
 * GET /accounts/cc-tracker/export?fy=YYYY  (downloads an .xlsx)
 *
 * The whole Credit Cards Master for one financial year as a spreadsheet that
 * mirrors the source sheet: 9 static card columns, then 12 monthly blocks of 9
 * fields (Apr→Mar). A safety-blanket backup now that the app is the source of
 * truth.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_FIELDS = [
  "Hard Copy", "Google Drive", "Tally Entry", "Balance Tally",
  "CC Paid Date", "CC Paid Amt", "Int + Fin Chgs", "Chg Reversed?", "Notes",
] as const;
const STATIC_HEADERS = [
  "S. No", "Entity Name", "Card Name", "ECS", "ECS From?",
  "Stmt Period", "St Dt", "Due Dt", "Soft Copy Auto Email?",
] as const;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAccountsAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(url.searchParams.get("fy") ?? ""), 10);
  const fy = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [cards, months] = await Promise.all([listCcCards(fy), listCcMonths(fy)]);
  const cols = fyMonthCols(fy); // Apr→Mar, each { month, yearLabel }
  // month record lookup: `${cardId}:${month}` → row
  const byKey = new Map(months.map((m) => [`${m.cardId}:${m.month}`, m]));

  // Two header rows: month-group band (blank over the static block), then the
  // field names.
  const groupRow: string[] = STATIC_HEADERS.map(() => "");
  const fieldRow: string[] = [...STATIC_HEADERS];
  for (const c of cols) {
    for (let i = 0; i < MONTH_FIELDS.length; i++) {
      groupRow.push(i === 0 ? c.yearLabel : "");
      fieldRow.push(MONTH_FIELDS[i]!);
    }
  }

  const dataRows: (string | number)[][] = cards.map((c) => {
    const row: (string | number)[] = [
      c.code ?? "", c.entityName ?? "", c.cardName, c.ecs ?? "", c.ecsFrom ?? "",
      c.stmtPeriod ?? "", c.stmtStartDay ?? "", c.dueDay ?? "", c.softCopyAutoEmail ?? "",
    ];
    for (const col of cols) {
      const m = byKey.get(`${c.id}:${col.month}`);
      row.push(
        m?.hardCopy ?? "", m?.googleDrive ?? "", m?.tallyEntry ?? "", m?.balanceTally ?? "",
        m?.ccPaidDate ?? "", m?.ccPaidAmt ?? "", m?.intFinChgs ?? "", m?.chgReversed ?? "", m?.notes ?? "",
      );
    }
    return row;
  });

  const aoa: (string | number)[][] = [
    [`Credit Cards Master · ${fyLabel(fy)}`],
    groupRow,
    fieldRow,
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 }, { wch: 16 }, { wch: 22 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 16 },
    ...Array(cols.length * MONTH_FIELDS.length).fill({ wch: 12 }),
  ];
  // Freeze the 9 static columns + 3 header rows, matching the sheet.
  ws["!freeze"] = { xSplit: 9, ySplit: 3 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `CC Master ${fyLabel(fy)}`);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CC-Master-${fyLabel(fy).replace(/[^0-9A-Za-z-]/g, "")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
