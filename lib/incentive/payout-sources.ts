/**
 * WS-6 — Incentive payout SOURCE RESOLUTION (PURE fold, no I/O). Turns the raw
 * incentive ledger rows (permanent entries, project legs, team-split
 * participants) for a month into flat `ResolvedSource` payable legs, applying
 * the SAME rules the canonical PAID producer (`getIncentivePaidByPerson`) uses:
 *
 *   - When a parent (entry/project) HAS participants, those participants REPLACE
 *     the parent's own leg amounts — no double-count.
 *   - Operational actors (EXCLUDED) and the literal name "none" are dropped.
 *
 * Kept PURE (no `server-only`, only type-imports from the schema) so the fold +
 * per-person filter + aggregation are unit-testable in the node env. The DB
 * reads that feed it live in the server-only `lib/incentive/payout.ts`.
 */

import type {
  IncentiveEntry,
  IncentiveParticipant,
  IncentiveProject,
} from "@/db/schema";

// Mirrors the operational-actor exclusion in lib/queries/incentives.ts. These
// names exist in the ledger for bookkeeping but must never be paid a payout.
const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);

export function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalised key for matching ledger names to employee names. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** First-of-NEXT-month YYYY-MM-DD for a "YYYY-MM" key (exclusive upper bound). */
export function monthEndExclusive(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad2(nm)}-01`;
}

/** Drizzle `date` columns come back as strings, but guard for a Date instance. */
function toISODate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : v.toISOString().slice(0, 10);
}

function payable(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = name.trim();
  if (!t) return false;
  if (EXCLUDED.has(t)) return false;
  return t.toLowerCase() !== "none";
}

/** One payable leg of the ledger, carrying both the planner numbers and the
 *  write-back coordinates (table + row id + leg + FK for the salary ledger). */
export interface ResolvedSource {
  /** Which ledger table the payable leg lives in. */
  table: "entry" | "project" | "participant";
  /** DB row id (the PROJECT id for a project leg). */
  rowId: string;
  /** Which leg of a project row; null for entries/participants. */
  leg: "supervisor" | "intern" | null;
  /** Stable planner key. */
  key: string;
  employeeId: string | null;
  empName: string;
  /** For `salary_payments.incentiveEntryId` — the parent entry id when this leg
   *  belongs to a permanent entry (entry itself, or a participant under one). */
  incentiveEntryId: string | null;
  /** First-of-month YYYY-MM-DD, or null. */
  periodMonth: string | null;
  approved: number;
  booked: number;
  accrued: number;
  paid: number;
}

/**
 * Fold a month's raw ledger rows into flat payable legs (participants replace
 * their parent's own amounts; excluded names dropped).
 */
export function foldIncentiveSources(
  entries: IncentiveEntry[],
  projects: IncentiveProject[],
  participants: IncentiveParticipant[],
): ResolvedSource[] {
  const partByEntry = new Map<string, IncentiveParticipant[]>();
  const partByProject = new Map<string, IncentiveParticipant[]>();
  for (const p of participants) {
    if (p.entryId) {
      const arr = partByEntry.get(p.entryId) ?? [];
      arr.push(p);
      partByEntry.set(p.entryId, arr);
    } else if (p.projectId) {
      const arr = partByProject.get(p.projectId) ?? [];
      arr.push(p);
      partByProject.set(p.projectId, arr);
    }
  }

  const out: ResolvedSource[] = [];

  const pushParticipant = (p: IncentiveParticipant, periodFallback: string | Date | null) => {
    if (!payable(p.empName)) return;
    const accrued = num(p.accruedAmt);
    out.push({
      table: "participant",
      rowId: p.id,
      leg: null,
      key: `participant:${p.id}`,
      employeeId: p.employeeId,
      empName: p.empName.trim(),
      // A participant under an ENTRY carries that entry's id; under a project, null.
      incentiveEntryId: p.entryId ?? null,
      periodMonth: toISODate(p.periodMonth ?? periodFallback),
      // Participants have no "approved" column — fall back to accrued so the
      // "approved" basis never pays MORE than accrued for a split leg.
      approved: accrued,
      booked: num(p.bookedAmt),
      accrued,
      paid: num(p.paidAmt),
    });
  };

  for (const e of entries) {
    const parts = partByEntry.get(e.id);
    if (parts && parts.length) {
      for (const p of parts) pushParticipant(p, e.periodMonth);
      continue;
    }
    if (!payable(e.empName)) continue;
    out.push({
      table: "entry",
      rowId: e.id,
      leg: null,
      key: `entry:${e.id}`,
      employeeId: e.employeeId,
      empName: e.empName.trim(),
      incentiveEntryId: e.id,
      periodMonth: toISODate(e.periodMonth),
      approved: num(e.approvedAmt),
      booked: num(e.bookedAmt),
      accrued: num(e.accruedAmt),
      paid: num(e.paidAmt),
    });
  }

  for (const pr of projects) {
    const parts = partByProject.get(pr.id);
    if (parts && parts.length) {
      for (const p of parts) pushParticipant(p, pr.periodMonth);
      continue;
    }
    if (payable(pr.supervisorName)) {
      out.push({
        table: "project",
        rowId: pr.id,
        leg: "supervisor",
        key: `project:${pr.id}:sup`,
        employeeId: pr.supervisorId,
        empName: (pr.supervisorName as string).trim(),
        incentiveEntryId: null,
        periodMonth: toISODate(pr.periodMonth),
        approved: num(pr.empApprovedAmt),
        booked: num(pr.empBookedAmt),
        accrued: num(pr.empAccruedAmt),
        paid: num(pr.empPaidAmt),
      });
    }
    if (payable(pr.internName)) {
      out.push({
        table: "project",
        rowId: pr.id,
        leg: "intern",
        key: `project:${pr.id}:int`,
        employeeId: pr.internId,
        empName: (pr.internName as string).trim(),
        incentiveEntryId: null,
        periodMonth: toISODate(pr.periodMonth),
        approved: num(pr.internApprovedAmt),
        booked: num(pr.internBookedAmt),
        accrued: num(pr.internAccruedAmt),
        paid: num(pr.internPaidAmt),
      });
    }
  }

  return out;
}

/** Filter folded legs to one person, matched by employeeId OR normalised name. */
export function sourcesForPerson(
  sources: ResolvedSource[],
  who: { employeeId?: string | null; name?: string | null },
): ResolvedSource[] {
  const key = nameKey(who.name);
  return sources.filter(
    (s) =>
      (who.employeeId != null && s.employeeId === who.employeeId) ||
      (key !== "" && nameKey(s.empName) === key),
  );
}

export interface PersonAggregate {
  /** employeeId when known, else the normalised name key. */
  key: string;
  employeeId: string | null;
  name: string;
  approved: number;
  booked: number;
  accrued: number;
  paid: number;
  sourceCount: number;
}

/**
 * Aggregate folded legs per person (keyed by employeeId when present, else
 * name). Sums approved/booked/accrued/paid. Used to build the payout board.
 */
export function aggregateByPerson(sources: ResolvedSource[]): PersonAggregate[] {
  const byKey = new Map<string, PersonAggregate>();
  for (const s of sources) {
    const key = s.employeeId ?? nameKey(s.empName);
    if (!key) continue;
    let a = byKey.get(key);
    if (!a) {
      a = {
        key,
        employeeId: s.employeeId,
        name: s.empName,
        approved: 0,
        booked: 0,
        accrued: 0,
        paid: 0,
        sourceCount: 0,
      };
      byKey.set(key, a);
    }
    if (!a.employeeId && s.employeeId) a.employeeId = s.employeeId;
    a.approved += s.approved;
    a.booked += s.booked;
    a.accrued += s.accrued;
    a.paid += s.paid;
    a.sourceCount += 1;
  }
  return [...byKey.values()];
}
