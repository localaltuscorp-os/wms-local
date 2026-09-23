import "server-only";
import type { Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { isMissingTable, loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { loadComplianceFills, loadComplianceItems, loadCompliancePeople } from "@/lib/queries/compliance";
import {
  addDays,
  matchFills,
  mccOccurrences,
  wccOccurrences,
  type ComplianceKind,
  type Occurrence,
} from "@/lib/compliance/schedule";
import {
  buildComplianceRows,
  withCarryForward,
  type ComplianceRow,
} from "@/lib/compliance/rows";
import { teamGroups, type TeamGroup } from "@/lib/compliance/team";
import { wccDayGroups, wccTeamGroups } from "@/lib/compliance/wcc-groups";

/**
 * Everything a WCC or MCC page renders, for one viewer and one window.
 *
 * ── WHOSE (`who`) ────────────────────────────────────────────────────────
 *   "me"    — the viewer's own (the default)
 *   "team"  — the viewer and everyone below them, grouped team-wise
 *   <id>    — one person the viewer can see
 * Anything the viewer may not see falls back to "me".
 *
 * ── CARRIED FORWARD ──────────────────────────────────────────────────────
 * A WCC window also shows the rows from the days before it that were still
 * open at its start (lib/compliance/rows.ts `withCarryForward`) — a Tuesday
 * compliance not done on Tuesday is in Wednesday's "Today" until it is Done or
 * lapses. Nothing carries across a Sunday, so looking back six days is enough.
 *
 * ── HOW THE ROWS GROUP ───────────────────────────────────────────────────
 *   WCC, one person   Daily first, then each day of the week, then Once a
 *                     week (lib/compliance/wcc-groups.ts)
 *   WCC, the team     team-wise, and inside each team the same Daily-then-days
 *                     sections, everyone's rows together, person by person
 *   MCC, one person   a group per month
 *   MCC, the team     team-wise, each person's rows by deadline
 */

export interface BoardSection {
  key: string;
  label: string;
  /** Row keys in display order. */
  rowKeys: string[];
}

export interface BoardGroup extends BoardSection {
  /** WCC's team view: the team's rows by day — Daily, then each day of the week.
   *  `rowKeys` is then every section's rows, in order. */
  sections?: BoardSection[];
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
  /** Resolved `who`. */
  who: string;
  /** Whether the Employee column and team grouping are on. */
  multiPerson: boolean;
  /** People the scope picker offers, team-wise; empty for someone with no team. */
  picker: PickerOption[];
  /** Who the Add dialog and the bulk template offer: every active employee, the viewer first. */
  manageable: ManageablePerson[];
}

export interface ManageablePerson {
  id: string;
  name: string;
  email: string | null;
}

/**
 * Everyone who may be GIVEN a WCC or MCC compliance — the viewer first, then A–Z.
 *
 * The two checklists are administrative. A weekly or monthly compliance is set
 * up by whoever is preparing the roster — an HR admin, a coordinator, an intern
 * handed the job — and not necessarily by that person's manager.
 *
 * This used to filter on `canManageItemsFor`, the manager-downline rule. That
 * rule is right for the DAILY checklist, where a KPI is authored by whoever
 * owns the work, and wrong here: it left the Employee picker showing a single
 * name to anyone with no reports, which reads as a broken screen rather than as
 * a permission. Reported by Vinal on 2026-09-23 — "it is only showing my name",
 * on both WCC and MCC.
 *
 * The server guards in `saveComplianceItem` and `bulkAddCompliances` were
 * opened to match, so every person this offers is one the save accepts.
 *
 * TWO RULES ARE DELIBERATELY NOT CHANGED. Editing or archiving a compliance
 * that already exists still follows the manager rule (`canManageFor`, below),
 * and so does setting its Mins: assigning work to a colleague is a different
 * act from changing work they now hold.
 */
function assignableOf(me: Employee, people: readonly { id: string; name: string; email: string | null }[]): ManageablePerson[] {
  return people
    .map((p) => ({ id: p.id, name: p.name, email: p.email }))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
}

/** The people the bulk-upload template's Employee list offers this viewer. */
export async function loadManageablePeople(me: Employee): Promise<ManageablePerson[]> {
  const everyone = await loadCompliancePeople();
  const all = [...everyone];
  if (!all.some((p) => p.id === me.id)) {
    all.unshift({ id: me.id, name: me.name, managerId: me.managerId, designation: null, address: null, email: me.email });
  }
  return assignableOf(me, all);
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
  /** How a single person's rows group — Daily, then each day (WCC), or by month (MCC). */
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
      ? wccOccurrences(items, addDays(args.from!, -6), args.to!)
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

  const built = buildComplianceRows({
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
      editsPast: canEditPastDccEntries(me.email),
      visibleIds: scope.visibleIds,
      canManageFor: (ownerId) => canManageItemsFor(scope, ownerId),
    },
  });
  const rows = args.kind === "wcc" ? withCarryForward(built, args.from!) : built;

  const itemOrder = new Map(items.map((i, idx) => [i.id, idx]));
  const byItem = (a: ComplianceRow, b: ComplianceRow) =>
    (itemOrder.get(a.itemId) ?? 0) - (itemOrder.get(b.itemId) ?? 0);

  let boardGroups: BoardGroup[];
  if (who === "team") {
    boardGroups =
      args.kind === "wcc"
        ? wccTeamGroups(rows, groups, { today, from: args.from ?? today, byItem })
        : groupsForTeam(rows, groups, byItem);
  } else if (args.personalGroup === "month") {
    boardGroups = groupsByMonth(rows, byItem);
  } else {
    boardGroups = wccDayGroups(rows, { today, from: args.from ?? today, order: byItem });
  }

  /* Whose rows the board SHOWS is still `visible` — the manager rule. Whose
     name the Add dialog OFFERS is everyone active. The two are deliberately
     different: reading a colleague's checklist is not the same as being able
     to give them work, and the other way round. */
  const assignable = [...everyone];
  if (!assignable.some((p) => p.id === me.id)) {
    assignable.unshift({ id: me.id, name: me.name, managerId: me.managerId, designation: null, address: null, email: me.email });
  }
  const manageable = assignableOf(me, assignable);

  return {
    rows,
    groups: boardGroups,
    who,
    multiPerson: who === "team",
    picker,
    manageable,
  };
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

/** The team on MCC: a group per team, people in reporting order, each person's rows by deadline. */
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
