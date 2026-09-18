/**
 * DCC MASTERS — the Daily Compliance template for a position (account holder,
 * 2026-09-15).
 *
 * Like the Job Description: a MASTER belongs to a position — the employee's
 * designation — and every employee in that position carries its KPIs; on top of
 * that each employee may have KPIs SPECIFIC to them.
 *
 * LIVE-LINKED: a holder's master KPIs are real `dcc_kpi_items` rows (so filling,
 * history, the dashboard, the report and the calendar need nothing new), tied to
 * their master item by `dcc_master_links`. They change only through the master.
 *
 * Pure: `planMasterSync` decides what to create, update and archive from the
 * roster, the masters and the existing links. lib/dcc/master-sync.ts loads and
 * applies it.
 */
import { parseFrequency } from "./util";

/** Master KPIs sort ahead of a person's specific KPIs in the same section. */
export const MASTER_SORT_BASE = -100_000;

export interface MasterItem {
  id: string;
  designationId: string;
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  targetNumber: string | null;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  createdById: string | null;
}

/** An active employee and their position. */
export interface MasterHolder {
  id: string;
  designationId: string | null;
}

/** The KPI columns a master decides. */
export interface KpiFields {
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  weekdays: number | null;
  scheduleKind: string;
  needsReview: boolean;
  targetNumber: string | null;
  unit: string | null;
  sortOrder: number;
}

/** A person's KPI that is linked to a master item. */
export interface LinkedItem extends KpiFields {
  itemId: string;
  masterItemId: string;
  ownerEmployeeId: string;
  archived: boolean;
}

export function masterKpiFields(m: MasterItem): KpiFields {
  const pf = parseFrequency(m.frequency);
  return {
    section: m.section,
    code: m.code,
    title: m.title,
    frequency: m.frequency,
    weekdays: pf.weekdays,
    scheduleKind: pf.scheduleKind,
    needsReview: pf.needsReview,
    targetNumber: m.targetNumber,
    unit: m.unit,
    sortOrder: MASTER_SORT_BASE + m.sortOrder,
  };
}

const blank = (v: string | null) => v === null || v.trim() === "";

/** numeric(14,2) comes back as "5.00"; compare the number, not the spelling. */
function sameNumber(a: string | null, b: string | null): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  return Number(a) === Number(b);
}

export function sameKpiFields(a: KpiFields, b: KpiFields): boolean {
  return (
    a.section === b.section &&
    a.code === b.code &&
    a.title === b.title &&
    a.frequency === b.frequency &&
    a.weekdays === b.weekdays &&
    a.scheduleKind === b.scheduleKind &&
    a.needsReview === b.needsReview &&
    sameNumber(a.targetNumber, b.targetNumber) &&
    a.unit === b.unit &&
    a.sortOrder === b.sortOrder
  );
}

export type MasterSyncOp =
  | { kind: "create"; ownerEmployeeId: string; masterItemId: string; createdById: string | null; fields: KpiFields }
  | { kind: "update"; itemId: string; ownerEmployeeId: string; fields: KpiFields }
  | { kind: "archive"; itemId: string; ownerEmployeeId: string };

/**
 * What it takes to make every holder's master KPIs match the masters.
 *
 *   · A holder without a linked KPI for an active master item → create it.
 *   · A linked KPI that differs, or was archived while the item is live → update
 *     (and restore) it, so its history stays attached.
 *   · A linked KPI whose master item is retired or gone, or whose owner left the
 *     position or the company → archive it. Never deleted: its entries are the
 *     record.
 */
export function planMasterSync(
  holders: readonly MasterHolder[],
  masters: readonly MasterItem[],
  linked: readonly LinkedItem[],
): MasterSyncOp[] {
  const ops: MasterSyncOp[] = [];
  const mastersById = new Map(masters.map((m) => [m.id, m]));
  const holderById = new Map(holders.map((h) => [h.id, h]));
  const linkByKey = new Map(linked.map((l) => [`${l.ownerEmployeeId}|${l.masterItemId}`, l]));

  const activeByDesignation = new Map<string, MasterItem[]>();
  for (const m of masters) {
    if (!m.isActive) continue;
    const list = activeByDesignation.get(m.designationId);
    if (list) list.push(m);
    else activeByDesignation.set(m.designationId, [m]);
  }

  for (const h of holders) {
    if (!h.designationId) continue;
    for (const m of activeByDesignation.get(h.designationId) ?? []) {
      const fields = masterKpiFields(m);
      const link = linkByKey.get(`${h.id}|${m.id}`);
      if (!link) {
        ops.push({ kind: "create", ownerEmployeeId: h.id, masterItemId: m.id, createdById: m.createdById, fields });
      } else if (link.archived || !sameKpiFields(link, fields)) {
        ops.push({ kind: "update", itemId: link.itemId, ownerEmployeeId: h.id, fields });
      }
    }
  }

  for (const l of linked) {
    if (l.archived) continue;
    const m = mastersById.get(l.masterItemId);
    const h = holderById.get(l.ownerEmployeeId);
    if (!m || !m.isActive || !h || h.designationId !== m.designationId) {
      ops.push({ kind: "archive", itemId: l.itemId, ownerEmployeeId: l.ownerEmployeeId });
    }
  }
  return ops;
}

export function masterLockedMessage(designation: string): string {
  return `This KPI comes from the ${designation} DCC Master. Change it in DCC Master.`;
}

/* ── Reading a frequency back to the author ─────────────────────────────── */

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function daysLabel(mask: number | null): string {
  if (!mask || mask === 0b1111111) return "every day";
  if (mask === 0b111111) return "Mon–Sat";
  return DAY.filter((_, i) => (mask & (1 << i)) !== 0).join(", ");
}

/**
 * What the DCC board will do with this frequency, in words — so the author sees
 * "Daily checklist · Mon–Sat" before saving, not a KPI that silently landed in
 * the wrong tray on twelve people's boards.
 */
export function describeSchedule(frequency: string | null | undefined): { label: string; warn: boolean } {
  if (!frequency || !frequency.trim()) {
    return { label: "No frequency — it will show under When It Happens", warn: true };
  }
  const pf = parseFrequency(frequency);
  if (pf.needsReview) return { label: "Not understood — it will show under When It Happens", warn: true };
  switch (pf.scheduleKind) {
    case "scheduled":
      return { label: `Daily checklist · ${daysLabel(pf.weekdays)}`, warn: false };
    case "weekly":
      return { label: pf.weekdays ? `This Week · ${daysLabel(pf.weekdays)}` : "This Week", warn: false };
    case "monthly":
      return { label: "This Month", warn: false };
    default:
      return { label: "When It Happens", warn: false };
  }
}
