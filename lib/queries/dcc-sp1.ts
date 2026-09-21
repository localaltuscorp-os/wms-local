import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccCallLogs, employees } from "@/db/schema";
import {
  SP1_DISPOSITIONS,
  emptyCounts,
  isSp1Disposition,
  type Sp1Counts,
  type Sp1LogRow,
} from "@/lib/dcc/sp1";

/**
 * READING AND WRITING THE SP1 CALL LOG (DCC-SPEC §7).
 *
 * ── WHY EVERY READ DEGRADES INSTEAD OF THROWING ────────────────────────────
 * `dcc_call_logs` arrives with migration 0235, and this repository applies
 * migrations BY HAND in the Supabase SQL editor — so there is a real window in
 * which the code is deployed and the table is not there. A throw takes the whole
 * page down and reads as a broken feature; returning `{ missing: true }` lets
 * the grid render its true shape with zeros and say, in one line, that a
 * migration is outstanding. That is the honest failure.
 */

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column). */
export function isMissingSp1Table(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  return hit(code) || hit(cause);
}

export interface Sp1Read {
  rows: Sp1LogRow[];
  /** True when 0235 has not been applied — the page says so rather than lying. */
  missing: boolean;
}

export async function loadSp1Logs(args: {
  employeeIds: readonly string[];
  from: string;
  to: string;
}): Promise<Sp1Read> {
  if (args.employeeIds.length === 0) return { rows: [], missing: false };
  try {
    const rows = await db
      .select({
        employeeId: dccCallLogs.employeeId,
        logDate: dccCallLogs.logDate,
        disposition: dccCallLogs.disposition,
        count: dccCallLogs.count,
      })
      .from(dccCallLogs)
      .where(
        and(
          inArray(dccCallLogs.employeeId, [...args.employeeIds]),
          gte(dccCallLogs.logDate, args.from),
          lte(dccCallLogs.logDate, args.to),
        ),
      );
    return {
      missing: false,
      // An unrecognised outcome is dropped HERE rather than in the grid, so the
      // grid never has to defend against a value it has no row for.
      rows: rows.filter((r) => isSp1Disposition(r.disposition)) as Sp1LogRow[],
    };
  } catch (e) {
    if (isMissingSp1Table(e)) return { rows: [], missing: true };
    throw e;
  }
}

/** One person's fifteen numbers for one day — what the fill screen opens on. */
export async function loadSp1Day(
  employeeId: string,
  date: string,
): Promise<{ counts: Sp1Counts; missing: boolean }> {
  const { rows, missing } = await loadSp1Logs({ employeeIds: [employeeId], from: date, to: date });
  const counts = emptyCounts();
  for (const r of rows) counts[r.disposition] = r.count;
  return { counts, missing };
}

/**
 * Save a whole day in one statement.
 *
 * ALL FIFTEEN ROWS ARE WRITTEN, including the zeros. A zero is meaningful — it
 * says "asked, none landed here" — and writing only the non-zeros would make
 * clearing a number impossible: the old value would simply survive the save.
 *
 * One multi-row upsert rather than fifteen round trips, so a half-saved day is
 * not a state the database can be left in.
 */
export async function saveSp1Day(args: {
  employeeId: string;
  date: string;
  counts: Sp1Counts;
  filledById: string;
}): Promise<void> {
  const values = SP1_DISPOSITIONS.map(
    (d) =>
      sql`(${args.employeeId}::uuid, ${args.date}::date, ${d}, ${Math.max(0, Math.trunc(args.counts[d] || 0))}, ${args.filledById}::uuid)`,
  );
  await db.execute(sql`
    INSERT INTO dcc_call_logs (employee_id, log_date, disposition, count, filled_by_id)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (employee_id, log_date, disposition)
    DO UPDATE SET count = EXCLUDED.count,
                  filled_by_id = EXCLUDED.filled_by_id,
                  updated_at = now()
  `);
}

/** Names for the people filter, in roster order. */
export async function loadSp1People(
  employeeIds: readonly string[],
): Promise<{ id: string; name: string }[]> {
  if (employeeIds.length === 0) return [];
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(inArray(employees.id, [...employeeIds]), eq(employees.isActive, true)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
