/**
 * BILLING — financial years and document numbers.
 *
 * The helpers here are pure and unit-tested; `allocateDocNo` is the one piece
 * that touches the database, and it does so in ONE atomic statement so two
 * people clicking Generate at the same instant cannot be handed the same
 * number. A tax-invoice series with a gap or a collision in it is an audit
 * finding, not a cosmetic bug — which is why nothing about this is "read, then
 * increment".
 */

import { sql, type SQL } from "drizzle-orm";
import { localDateString } from "@/lib/format";
import type { BillingDocType } from "@/db/enums";

/** India's financial year runs 1 April → 31 March. Everything here assumes it. */
export const FY_START_MONTH = 4;

/** The app's calendar timezone. Server runs UTC; billing dates are Indian. */
export const BILLING_TZ = "Asia/Kolkata";

/**
 * Today as YYYY-MM-DD in Indian local time.
 *
 * NOT `toISOString().slice(0,10)`: before 05:30 IST that returns yesterday, so
 * an invoice raised at 9am on the 1st would be dated the previous month — and
 * in April, the previous financial year.
 */
export function todayISO(): string {
  return localDateString(BILLING_TZ);
}

/**
 * The financial year label for an ISO date: `"26-27"` for any day between
 * 1 Apr 2026 and 31 Mar 2027. That is exactly the suffix in `90001-26-27`.
 */
export function financialYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return financialYear(todayISO());
  const startYear = m >= FY_START_MONTH ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(startYear)}-${two(startYear + 1)}`;
}

/** 1 Apr … 31 Mar for a `"26-27"` label — the date filter behind a FY picker. */
export function financialYearRange(finYear: string): { from: string; to: string } {
  const [a] = finYear.split("-").map(Number);
  // "26" → 2026. The registry only ever spans this century.
  const startYear = 2000 + (a ?? 0);
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

/** The last N financial years, newest first — the list behind the FY filter. */
export function recentFinancialYears(count = 4, fromIso = todayISO()): string[] {
  const current = financialYear(fromIso);
  const [a] = current.split("-").map(Number);
  const start = 2000 + (a ?? 0);
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return Array.from({ length: count }, (_, i) => {
    const y = start - i;
    return `${two(y)}-${two(y + 1)}`;
  });
}

/** `90001-26-27`, or `PI-0042-26-27` when a prefix and padding are configured. */
export function formatDocNo(args: {
  prefix: string;
  seq: number;
  padWidth: number;
  finYear: string;
}): string {
  const body = args.padWidth > 0 ? String(args.seq).padStart(args.padWidth, "0") : String(args.seq);
  return `${args.prefix ?? ""}${body}-${args.finYear}`;
}

/**
 * The default series base per document type, used the first time an entity
 * issues that type in a financial year. Quotations start at 90001 — the number
 * the business already uses — and the other two series get their own space so
 * a proforma and a tax invoice can never share a number.
 *
 * These are DEFAULTS, overridable per entity from the Admin Panel
 * (`billing_series_defaults`); nothing downstream assumes them.
 */
export const SERIES_BASE: Record<BillingDocType, number> = {
  quotation: 90001,
  proforma_invoice: 50001,
  tax_invoice: 10001,
};

/** A minimal drizzle handle — the db client or a transaction, either works. */
type Executor = { execute: (query: SQL) => Promise<unknown> };

export interface AllocatedNumber {
  docNo: string;
  seq: number;
  finYear: string;
  prefix: string;
  padWidth: number;
}

/**
 * Take the next number in a series, atomically.
 *
 * One INSERT … ON CONFLICT DO UPDATE: the row is created with the configured
 * base on first use of a (entity, type, financial year), and bumped by one
 * every time after. Postgres serialises the conflicting writers on the unique
 * index, so fifty parallel callers get fifty distinct, contiguous numbers.
 *
 * Call it INSIDE the same transaction as the document insert — that is what
 * makes a rolled-back generate give its number back.
 */
export async function allocateDocNo(
  tx: Executor,
  args: { entityId: string; docType: BillingDocType; docDate: string },
): Promise<AllocatedNumber> {
  const finYear = financialYear(args.docDate);

  // The per-entity override for this type, if the Admin Panel has set one.
  const defaultsRows = (await tx.execute(sql`
    SELECT prefix, start_seq, pad_width
      FROM billing_series_defaults
     WHERE entity_id = ${args.entityId} AND doc_type = ${args.docType}
     LIMIT 1
  `)) as unknown as { prefix: string; start_seq: number; pad_width: number }[];

  const d = defaultsRows?.[0];
  const prefix = d?.prefix ?? "";
  const base = d?.start_seq ?? SERIES_BASE[args.docType];
  const padWidth = d?.pad_width ?? 0;

  const rows = (await tx.execute(sql`
    INSERT INTO billing_number_series (entity_id, doc_type, fin_year, prefix, next_seq, pad_width)
    VALUES (${args.entityId}, ${args.docType}, ${finYear}, ${prefix}, ${base + 1}, ${padWidth})
    ON CONFLICT (entity_id, doc_type, fin_year)
    DO UPDATE SET next_seq = billing_number_series.next_seq + 1, updated_at = now()
    RETURNING next_seq - 1 AS seq, prefix, pad_width
  `)) as unknown as { seq: number | string; prefix: string; pad_width: number }[];

  const row = rows?.[0];
  if (!row) throw new Error("Could not allocate a document number");
  const seq = Number(row.seq);

  return {
    seq,
    finYear,
    prefix: row.prefix ?? "",
    padWidth: row.pad_width ?? 0,
    docNo: formatDocNo({ prefix: row.prefix ?? "", seq, padWidth: row.pad_width ?? 0, finYear }),
  };
}

/** Document date + the term's due days. `null` days (e.g. "DP") → no due date. */
export function dueDateFor(docDate: string, dueDays: number | null | undefined): string | null {
  if (dueDays === null || dueDays === undefined) return null;
  const [y, m, d] = docDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Built in UTC and read back in UTC — pure calendar arithmetic, no timezone
  // in the middle to shift the day.
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dueDays);
  return base.toISOString().slice(0, 10);
}

/**
 * WHICH CONVERSIONS ARE LEGAL.
 *
 * Forward down the chain — quotation → proforma → tax invoice — and, since
 * 2026-09-20, BACKWARDS out of a tax invoice too (Manan, on a generated tax
 * invoice: "once the document is generated then give option there as well
 * convert"). A tax invoice used to be the end of the line and its action bar
 * carried a sentence saying so.
 *
 * What a backwards conversion is NOT: an edit, an amendment or a credit note.
 * `convertBillingDocument` never touches the source's number or its figures —
 * it copies them into a NEW draft and freezes the source as `converted`, with
 * the two linked both ways. So the tax invoice that was issued stays exactly as
 * issued and stays in the audit trail; what changes is that it can now spawn a
 * proforma or a quotation from the same lines rather than nothing at all.
 *
 * A document still converts ONCE — the child check in convertBillingDocument is
 * what keeps the chain a line rather than a fan, and it is unchanged.
 */
export const CONVERSION_TARGETS: Record<BillingDocType, BillingDocType[]> = {
  quotation: ["proforma_invoice", "tax_invoice"],
  proforma_invoice: ["tax_invoice"],
  tax_invoice: ["proforma_invoice", "quotation"],
};

export function canConvert(from: BillingDocType, to: BillingDocType): boolean {
  return CONVERSION_TARGETS[from].includes(to);
}
