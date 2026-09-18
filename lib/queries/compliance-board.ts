import "server-only";
import type { Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { isMissingTable, loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { loadComplianceFills, loadComplianceItems, loadCompliancePeople } from "@/lib/queries/compliance";
import {
  matchFills,
  mccOccurrences,
  shortDay,
  wccOccurrences,
  type ComplianceKind,
  type Occurrence,
} from "@/lib/compliance/schedule";
import { buildComplianceRows, summarise, type ComplianceRow, type ComplianceSummary } from "@/lib/compliance/rows";
import { teamGroups, type TeamGroup } from "@/lib/compliance/team";

/**
 * Everything a WCC or MCC page renders, for one viewer and one window.
 *
 * ── WHOSE (`who`) ────────────────────────────────────────────────────────
 *   "me"    — the viewer's own (the default)
 *   "team"  — the viewer and everyone below them, grouped team-wise
 *   <id>    — one person the viewer can see
 * Anything the viewer may not see falls back to "me".
 */

export interface BoardGroup {
  key: string;
  label: string;
  /** Row keys in display order. */
  rowKeys: string[];
}

export interface PickerOption {
  id: string;
  name: string;
  /** The team group they sit in, for the picker's headings. */
  group: string;
}

export interface ComplianceBoard {
  rows: ComplianceRow[];
  groups: BoardGroup[];
  summary: ComplianceSummary;
  /** Resolved `who`. */
  who: string;
  /** Whether the Employee column and team grouping are on. */
  multiPerson: boolean;
  /** People the scope picker offers, team-wise; empty for someone with no team. */
  picker: PickerOption[];
  /** People this viewer may add a compliance for. */
  manageable: { id: string; name: string }[];
}

export async function loadComplianceBoard(args: {
  me: Employee;
  kind: ComplianceKind;
  who: string | undefined;
  today: string;
  /** WCC: the window of deadlines. */
  from?: string;
  to?: string;
  /** MCC: the months shown. */
  monthKeys?: string[];
  /** How a single person's rows group — by deadline day (WCC) or by month (MCC). */
  personalGroup: "day" | "month";
}): Promise<ComplianceBoard> {
  const { me, today } = args;
  const [scope, everyone] = await Promise.all([loadDccScope(me), loadCompliancePeople()]);
  const visible = everyone.filter((p) => scope.visibleIds.has(p.id));
  if (!visible.some((p) => p.id === me.id)) {
    visible.unshift({ id: me.id, name: me.name, managerId: me.managerId, designation: null, address: null, email: me.email });
  }
  const names = new Map(visible.map((p) => [p.id, p.name]));

  const groups = teamGroups(me.id, visible);
  const picker: PickerOption[] =
    visible.length > 1
      ? groups.flatMap((g) => g.memberIds.map((id) => ({ id, name: names.get(id) ?? "—", group: g.label })))
      : [];

  const who =
    args.who === "team" && visible.length > 1
      ? "team"
      : args.who && args.who !== "me" && scope.visibleIds.has(args.who)
        ? args.who
        : "me";
  const ownerIds = who === "team" ? visible.map((p) => p.id) : [who === "me" ? me.id : who];

  // Both checklists' compliances come back; each occurrence builder keeps its own kind.
  const items = await loadComplianceItems(ownerIds);
  const occurrences: Occurrence[] =
    args.kind === "wcc"
      ? wccOccurrences(items, args.from!, args.to!)
      : mccOccurrences(items, args.monthKeys ?? []);

  const usedIds = [...new Set(occurrences.map((o) => o.itemId))];
  const spanFrom = occurrences.reduce((m, o) => (o.periodStart < m ? o.periodStart : m), "9999-12-31");
  const spanTo = occurrences.reduce((m, o) => (o.periodEnd > m ? o.periodEnd : m), "0000-01-01");
  const [fills, masters] = await Promise.all([
    usedIds.length ? loadComplianceFills(usedIds, spanFrom, spanTo) : Promise.resolve([]),
    loadMasterLinksForItems(usedIds).catch((e) => {
      if (isMissingTable(e)) return new Map<string, string>();
      throw e;
    }),
  ]);

  const rows = buildComplianceRows({
    occurrences,
    fills: matchFills(occurrences, fills),
    items: new Map(items.map((i) => [i.id, i])),
    names,
    masters,
    today,
    viewer: {
      id: me.id,
      isAdmin: me.isAdmin || isSuperAdmin(me.email),
      fillsForAnyone: isSuperAdmin(me.email) || canEditPastDccEntries(me.email),
      visibleIds: scope.visibleIds,
      canManageFor: (ownerId) => canManageItemsFor(scope, ownerId),
    },
  });

  const itemOrder = new Map(items.map((i, idx) => [i.id, idx]));
  const byItem = (a: ComplianceRow, b: ComplianceRow) =>
    (itemOrder.get(a.itemId) ?? 0) - (itemOrder.get(b.itemId) ?? 0);

  let boardGroups: BoardGroup[];
  if (who === "team") {
    boardGroups = groupsForTeam(rows, groups, byItem);
  } else if (args.personalGroup === "month") {
    boardGroups = groupsByMonth(rows, byItem);
  } else {
    boardGroups = groupsByDay(rows, today, byItem);
  }

  const manageable = visible.filter((p) => canManageItemsFor(scope, p.id)).map((p) => ({ id: p.id, name: p.name }));

  return {
    rows,
    groups: boardGroups,
    summary: summarise(rows, today),
    who,
    multiPerson: who === "team",
    picker,
    manageable,
  };
}

/** One person, WCC: today first, then what is coming up this week, then the past, newest first. */
function groupsByDay(rows: ComplianceRow[], today: string, byItem: (a: ComplianceRow, b: ComplianceRow) => number): BoardGroup[] {
  const days = [...new Set(rows.map((r) => r.deadline))];
  const rank = (d: string) => (d === today ? 0 : d > today ? 1 : 2);
  days.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.localeCompare(b) : b.localeCompare(a)));
  return days.map((d) => ({
    key: d,
    label: `${shortDay(d)}${d === today ? " · today" : d > today ? " · coming up this week" : ""}`,
    rowKeys: rows.filter((r) => r.deadline === d).sort(byItem).map((r) => r.key),
  }));
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** One person, MCC: a group per month, in order. */
function groupsByMonth(rows: ComplianceRow[], byItem: (a: ComplianceRow, b: ComplianceRow) => number): BoardGroup[] {
  const months = [...new Set(rows.map((r) => r.deadline.slice(0, 7)))].sort();
  return months.map((m) => ({
    key: m,
    label: `${MONTH[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`,
    rowKeys: rows
      .filter((r) => r.deadline.startsWith(m))
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || byItem(a, b))
      .map((r) => r.key),
  }));
}

/** The team: a group per team, people in reporting order, each person's rows by deadline. */
function groupsForTeam(
  rows: ComplianceRow[],
  groups: TeamGroup[],
  byItem: (a: ComplianceRow, b: ComplianceRow) => number,
): BoardGroup[] {
  const byOwner = new Map<string, ComplianceRow[]>();
  for (const r of rows) {
    const list = byOwner.get(r.ownerId);
    if (list) list.push(r);
    else byOwner.set(r.ownerId, [r]);
  }
  return groups
    .map((g) => ({
      key: g.key,
      label: g.label,
      rowKeys: g.memberIds.flatMap((id) =>
        (byOwner.get(id) ?? []).sort((a, b) => b.deadline.localeCompare(a.deadline) || byItem(a, b)).map((r) => r.key),
      ),
    }))
    .filter((g) => g.rowKeys.length > 0);
}
