/**
 * Pure parser for the "PAID LEAVE CALCULATION" tab of the HR "Attendance log"
 * Google Sheet → typed cycle rows for the paid_leave_cycle upsert
 * (lib/attendance-log/paid-leave-sync.ts).
 *
 * VERIFIED structure — EMPLOYEE-BLOCKED, not a flat table:
 *   · A block starts with a row whose col 0 matches
 *       "<Employee Name> DOJ - dd/mm/yyyy"   (e.g. "Dattaram Kap DOJ - 01/03/2019")
 *   · The next row is a header (Period, Status, Leaves, Remarks) — skipped.
 *   · Then N cycle rows:
 *       [0] Period (e.g. "Mar 2019 – Aug 2019") · [1] Status (e.g. "Probation"
 *       / "Leave cycle 1") · [2] Leaves (number) · [3..] remarks free text.
 *   · The block ends at the next DOJ row or a fully-blank row.
 *
 * DOJ is parsed by digit groups (day-first, Indian locale) — never new Date()
 * string parsing, which is locale/tz dependent.
 *
 * Dependency-free + TOTAL: malformed rows are skipped and counted, never
 * thrown. Trailing empty cells are NOT padded by the Sheets API — indexed
 * defensively.
 */

/** "<Name> DOJ - dd/mm/yyyy" (also tolerates the en-dash and "–"). */
const DOJ_RE = /^(.+?)\s+DOJ\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/i;

/** One parsed cycle row, 1:1 with paid_leave_cycle. */
export interface PaidLeaveCycleRow {
  employeeName: string;
  /** 'YYYY-MM-DD' from the block header; null when the header date is bogus. */
  doj: string | null;
  /** The cycle label exactly as written, e.g. "Mar 2019 – Aug 2019". */
  period: string;
  status: string | null;
  leaves: number | null;
  remarks: string | null;
}

export interface PaidLeaveBlock {
  employeeName: string;
  doj: string | null;
  cycles: PaidLeaveCycleRow[];
  /** Sum of the block's numeric Leaves cells. */
  totalLeaves: number;
}

export interface PaidLeaveMapResult {
  blocks: PaidLeaveBlock[];
  /** Flat view of every cycle row (deduped on employee+period, last wins). */
  cycles: PaidLeaveCycleRow[];
  /** Non-blank rows that belonged to no block / had no period label. */
  skipped: number;
  /** Later duplicates of an already-seen (employee_name, period) key. */
  duplicates: number;
}

const txt = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/[,\s]/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** dd/mm/yyyy digit groups → 'YYYY-MM-DD' (null when out of range). */
function dojToIso(dd: string, mm: string, yyyy: string): string | null {
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (!(d >= 1 && d <= 31) || !(mo >= 1 && mo <= 12) || !(y >= 1900 && y <= 2200)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** True when the row is the per-block "Period / Status / Leaves…" header. */
function isBlockHeader(col0: string): boolean {
  return /^periods?$/i.test(col0.trim());
}

/**
 * Scan the whole tab for DOJ block headers and collect each employee's DOJ +
 * cycle rows. Robustness rules:
 *  · a fully-blank row closes the current block;
 *  · a new DOJ row closes the previous block implicitly;
 *  · non-blank rows outside any block (titles, legends) are counted skipped;
 *  · cycle rows without a Period label (col 0) are counted skipped;
 *  · duplicate (employee, period) keys keep the LAST occurrence (counted) so
 *    the batched upsert never hits the same unique key twice per statement.
 */
export function mapPaidLeaveRows(matrix: string[][]): PaidLeaveMapResult {
  let current: { employeeName: string; doj: string | null } | null = null;
  const byKey = new Map<string, PaidLeaveCycleRow>();
  const blockOrder: string[] = []; // employee names in first-seen order
  const dojByEmployee = new Map<string, string | null>();
  let skipped = 0;
  let duplicates = 0;

  for (const r of matrix) {
    const row = r ?? [];
    const blank = row.every((c) => String(c ?? "").trim() === "");
    if (blank) {
      current = null; // a fully-blank row ends the block
      continue;
    }

    const col0 = String(row[0] ?? "").replace(/\s+/g, " ").trim();

    const dojMatch = DOJ_RE.exec(col0);
    if (dojMatch) {
      const employeeName = dojMatch[1]!.replace(/\s+/g, " ").trim();
      current = { employeeName, doj: dojToIso(dojMatch[2]!, dojMatch[3]!, dojMatch[4]!) };
      if (!dojByEmployee.has(employeeName)) {
        dojByEmployee.set(employeeName, current.doj);
        blockOrder.push(employeeName);
      }
      continue;
    }

    if (!current) {
      skipped++; // titles/legends above or between blocks
      continue;
    }
    if (isBlockHeader(col0)) continue; // the Period/Status/Leaves header row

    const period = txt(col0);
    if (!period) {
      skipped++; // in-block row with no period label
      continue;
    }

    // Remarks: every trailing non-empty cell from col 3 onward, joined.
    const remarkCells = row
      .slice(3)
      .map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
      .filter((s) => s !== "");
    const cycle: PaidLeaveCycleRow = {
      employeeName: current.employeeName,
      doj: current.doj,
      period,
      status: txt(row[1]),
      leaves: numOrNull(row[2]),
      remarks: remarkCells.length ? remarkCells.join("; ") : null,
    };

    const key = `${current.employeeName.toLowerCase()}|${period.toLowerCase()}`;
    if (byKey.has(key)) duplicates++;
    byKey.set(key, cycle); // last occurrence wins
  }

  const cycles = [...byKey.values()];
  const blocks: PaidLeaveBlock[] = blockOrder.map((employeeName) => {
    const own = cycles.filter((c) => c.employeeName === employeeName);
    return {
      employeeName,
      doj: dojByEmployee.get(employeeName) ?? null,
      cycles: own,
      totalLeaves: own.reduce((sum, c) => sum + (c.leaves ?? 0), 0),
    };
  });

  return { blocks, cycles, skipped, duplicates };
}
