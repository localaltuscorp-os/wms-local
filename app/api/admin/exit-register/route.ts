import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current";
import { listExitRegister } from "@/lib/queries/offboarding";

/**
 * EXIT REGISTER — every departure in a period, as CSV.
 *
 * What HR needs at year end and what an auditor asks for first. Admin-gated,
 * because it carries reason-for-leaving and rehire eligibility for every person
 * who has ever left — among the most sensitive rows the company holds.
 *
 * Optional `?from=YYYY-MM-DD&to=YYYY-MM-DD`; unbounded when absent.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC-4180 quoting. Everything is quoted rather than only the fields that need
 * it: exit reasons and notes routinely contain commas, and a rule that fires
 * conditionally is one that eventually does not fire when it should.
 *
 * The leading-apostrophe guard defuses CSV injection — a cell beginning
 * `=`, `+`, `-` or `@` is executed as a formula by Excel and Sheets, and these
 * cells contain free text an admin typed.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADERS = [
  "Name",
  "Email",
  "Department",
  "Role",
  "Date of joining",
  "Resignation date",
  "Last working day",
  "Notice served",
  "Notice days",
  "Paid in lieu",
  "Exit reason",
  "Exit reason (other)",
  "Rehire eligibility",
  "Rehire note",
  "Work transferred to",
  "Offboarded on",
  "Offboarded by",
  "Legal hold",
];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  const rows = await listExitRegister(from, to);

  const body = [
    HEADERS.map(cell).join(","),
    ...rows.map((r) =>
      [
        r.name,
        r.email,
        r.department,
        r.role,
        r.joinedAt,
        r.resignationDate,
        r.lastWorkingDay,
        r.noticeServed === null ? "" : r.noticeServed ? "Yes" : "No",
        r.noticeDays,
        r.paidInLieu ? "Yes" : "No",
        r.exitReason,
        r.exitReasonOther,
        r.rehireEligibility,
        r.rehireNote,
        r.successorName,
        r.archivedAt,
        r.archivedBy,
        r.legalHold ? "Yes" : "No",
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the
  // system codepage, which otherwise mangles every non-ASCII name in the file.
  return new NextResponse("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="exit-register-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
