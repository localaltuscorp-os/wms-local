/**
 * CLIENT ENGAGEMENT — the numbers behind the Emp Grid, the PCA Grid and the
 * capacity bar.
 *
 * ONE RULE FOR "THIS WEEK'S LOAD" everywhere: an account's weekly duration and
 * weekly calls are its engagements that actually run in the chosen week
 * (runsInWeek), and only for accounts that are not inactive. An account on hold
 * keeps its coach and its calls on file, but none of it is load.
 *
 * PURE + CLIENT-SAFE.
 */

import { accountLabel, groupOf, type CeGroup } from "./constants";
import { runsInWeek, slotMinutes, type SlotLike } from "./schedule";
import { isInactiveAccount } from "./status";

export interface GridMember {
  id: string;
  name: string;
  activeClientLimit: number;
}

export interface GridAccount {
  id: string;
  fullName: string;
  batchCode: string | null;
  category: string;
  assignedTo: string | null;
  lifecycleStatus: string;
  hhStatus: string;
}

export interface GridEngagement extends SlotLike {
  id: string;
  accountId: string;
}

export interface Load {
  minutes: number;
  calls: number;
}

/** Weekly minutes and calls per account, for the week starting `monday`. */
export function weeklyLoadByAccount(
  engagements: readonly GridEngagement[],
  monday: string,
): Map<string, Load> {
  const out = new Map<string, Load>();
  for (const e of engagements) {
    if (!runsInWeek(e, monday)) continue;
    const cur = out.get(e.accountId) ?? { minutes: 0, calls: 0 };
    cur.minutes += slotMinutes(e);
    cur.calls += 1;
    out.set(e.accountId, cur);
  }
  return out;
}

/* ── Emp Grid ─────────────────────────────────────────────────────────── */

export interface EmpGridRow {
  sr: number;
  accountId: string;
  /** "ABC Shah (79)". */
  label: string;
  hhStatus: string;
  minutes: number;
  calls: number;
}

export interface EmpGridTotal {
  /** How many accounts are listed — the brief's "number of participants". */
  participants: number;
  minutes: number;
  /** Total weekly calls — the brief's "number of engagements". */
  engagements: number;
}

export interface EmpGridSection {
  /** Null for the Unassigned pool. */
  memberId: string | null;
  memberName: string;
  rows: EmpGridRow[];
  total: EmpGridTotal;
}

export interface EmpGrid {
  sections: EmpGridSection[];
  grandTotal: EmpGridTotal;
}

function totalOf(rows: readonly EmpGridRow[]): EmpGridTotal {
  return {
    participants: rows.length,
    minutes: rows.reduce((s, r) => s + r.minutes, 0),
    engagements: rows.reduce((s, r) => s + r.calls, 0),
  };
}

/**
 * One section per team member (every active member, even with nothing yet, so
 * spare bandwidth is visible), then Unassigned if anything sits there. Rows are
 * the member's ACTIVE accounts in the chosen categories, alphabetical.
 */
export function buildEmpGrid(
  members: readonly GridMember[],
  accounts: readonly GridAccount[],
  engagements: readonly GridEngagement[],
  monday: string,
  categories: ReadonlySet<string>,
): EmpGrid {
  const load = weeklyLoadByAccount(engagements, monday);
  const eligible = accounts
    .filter((a) => categories.has(a.category) && !isInactiveAccount(a))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base", numeric: true }));

  const rowsFor = (list: readonly GridAccount[]): EmpGridRow[] =>
    list.map((a, i) => ({
      sr: i + 1,
      accountId: a.id,
      label: accountLabel(a.fullName, a.batchCode),
      hhStatus: a.hhStatus,
      minutes: load.get(a.id)?.minutes ?? 0,
      calls: load.get(a.id)?.calls ?? 0,
    }));

  const memberIds = new Set(members.map((m) => m.id));
  const sections: EmpGridSection[] = members.map((m) => {
    const rows = rowsFor(eligible.filter((a) => a.assignedTo === m.id));
    return { memberId: m.id, memberName: m.name, rows, total: totalOf(rows) };
  });

  // Unassigned, plus anything held by someone no longer on the roster — an
  // account must never silently drop out of the totals.
  const orphans = eligible.filter((a) => !a.assignedTo || !memberIds.has(a.assignedTo));
  if (orphans.length) {
    const rows = rowsFor(orphans);
    sections.push({ memberId: null, memberName: "Unassigned", rows, total: totalOf(rows) });
  }

  const all = sections.flatMap((s) => s.rows);
  return { sections, grandTotal: totalOf(all) };
}

/* ── PCA Grid ─────────────────────────────────────────────────────────── */

export interface PcaCell {
  count: number;
  minutes: number;
  calls: number;
}

export interface PcaMatrixRow {
  memberId: string | null;
  memberName: string;
  P: PcaCell;
  C: PcaCell;
  A: PcaCell;
  all: PcaCell;
}

export interface PcaBoardEntry {
  accountId: string;
  label: string;
  hhStatus: string;
  group: CeGroup;
}

export interface PcaColumn {
  memberId: string | null;
  memberName: string;
  entries: PcaBoardEntry[];
  cells: PcaMatrixRow;
}

const emptyCell = (): PcaCell => ({ count: 0, minutes: 0, calls: 0 });

function addTo(cell: PcaCell, l: Load | undefined): void {
  cell.count += 1;
  cell.minutes += l?.minutes ?? 0;
  cell.calls += l?.calls ?? 0;
}

/**
 * The transpose of the Emp Grid: for every team member (and Unassigned), how
 * many participants, clients and ambassadors they carry and what that costs a
 * week — plus the names themselves, for the board view. Active accounts only.
 */
export function buildPca(
  members: readonly GridMember[],
  accounts: readonly GridAccount[],
  engagements: readonly GridEngagement[],
  monday: string,
): { columns: PcaColumn[]; total: PcaMatrixRow } {
  const load = weeklyLoadByAccount(engagements, monday);
  const memberIds = new Set(members.map((m) => m.id));

  const make = (memberId: string | null, memberName: string): PcaColumn => ({
    memberId,
    memberName,
    entries: [],
    cells: { memberId, memberName, P: emptyCell(), C: emptyCell(), A: emptyCell(), all: emptyCell() },
  });

  const columns = members.map((m) => make(m.id, m.name));
  const unassigned = make(null, "Unassigned");
  const byId = new Map(columns.map((c) => [c.memberId, c] as const));

  const active = accounts
    .filter((a) => !isInactiveAccount(a))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base", numeric: true }));

  for (const a of active) {
    const col = a.assignedTo && memberIds.has(a.assignedTo) ? byId.get(a.assignedTo)! : unassigned;
    const group = groupOf(a.category);
    const l = load.get(a.id);
    addTo(col.cells[group], l);
    addTo(col.cells.all, l);
    col.entries.push({ accountId: a.id, label: accountLabel(a.fullName, a.batchCode), hhStatus: a.hhStatus, group });
  }

  // Unassigned is always shown — the brief asks for the row even when it is empty.
  columns.push(unassigned);

  const total: PcaMatrixRow = { memberId: null, memberName: "Total", P: emptyCell(), C: emptyCell(), A: emptyCell(), all: emptyCell() };
  for (const c of columns) {
    for (const k of ["P", "C", "A", "all"] as const) {
      total[k].count += c.cells[k].count;
      total[k].minutes += c.cells[k].minutes;
      total[k].calls += c.cells[k].calls;
    }
  }
  return { columns, total };
}

/* ── Capacity ─────────────────────────────────────────────────────────── */

export type CapacityTone = "green" | "amber" | "red";

export interface MemberCapacity {
  memberId: string;
  name: string;
  active: number;
  limit: number;
  /** active / limit, 0..∞; null when the limit is 0 (no cap set). */
  ratio: number | null;
  tone: CapacityTone;
  weeklyMinutes: number;
}

/**
 * Green under 80% of the cap, amber from 80% up to the cap, red once over it.
 * A cap of 0 means "no cap set": green unless they carry anyone, then amber, so
 * it is noticed rather than hidden.
 */
export function capacityTone(active: number, limit: number): CapacityTone {
  if (limit <= 0) return active > 0 ? "amber" : "green";
  if (active > limit) return "red";
  return active / limit >= 0.8 ? "amber" : "green";
}

export function buildCapacity(
  members: readonly GridMember[],
  accounts: readonly GridAccount[],
  engagements: readonly GridEngagement[],
  monday: string,
): MemberCapacity[] {
  const load = weeklyLoadByAccount(engagements, monday);
  return members.map((m) => {
    const mine = accounts.filter((a) => a.assignedTo === m.id && !isInactiveAccount(a));
    return {
      memberId: m.id,
      name: m.name,
      active: mine.length,
      limit: m.activeClientLimit,
      ratio: m.activeClientLimit > 0 ? mine.length / m.activeClientLimit : null,
      tone: capacityTone(mine.length, m.activeClientLimit),
      weeklyMinutes: mine.reduce((s, a) => s + (load.get(a.id)?.minutes ?? 0), 0),
    };
  });
}
