/**
 * WCC / MCC — WHOSE CHECKLIST, AND GROUPED HOW.
 *
 * PURE. The pages and Manan Sir's Wednesday/Saturday email group people the
 * same way, so the grid in the email reads like the screen.
 *
 * ── WHO SEES WHOM (account holder, 2026-09-18) ───────────────────────────
 *   · Everyone sees their own.
 *   · A Team Lead sees their own, and their whole team — everyone below them,
 *     however many levels down.
 *   · Manan Sir sees his own, and everybody below him, TEAM-WISE.
 * The reporting line is `employees.manager_id`, which the rest of the app
 * already uses; the visible set comes from lib/dcc/access.ts.
 *
 * ── TEAM-WISE ────────────────────────────────────────────────────────────
 *   1. You.
 *   2. Each person reporting to you who has a team of their own — a Team
 *      Lead — followed by everyone below them, in reporting order.
 *   3. The people reporting to you with no team, together.
 * Somebody visible whose manager is not (a super-admin looking across the
 * company) is treated as reporting to the viewer, so nobody drops out.
 */

export interface TeamPerson {
  id: string;
  name: string;
  managerId: string | null;
}

export interface TeamGroup {
  key: string;
  /** "You", "Aarti Mehta's team", "Reporting directly to Manan Vasa". */
  label: string;
  /** In display order — the Team Lead first, then their team depth-first. */
  memberIds: string[];
  /** The group's Team Lead, when it has one. */
  leadId: string | null;
}

const byName = (a: TeamPerson, b: TeamPerson) => a.name.localeCompare(b.name);

/**
 * Group the visible people under the viewer, team-wise. `people` is the
 * visible set and must include the viewer.
 */
export function teamGroups(viewerId: string, people: readonly TeamPerson[]): TeamGroup[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const viewer = byId.get(viewerId);
  const children = new Map<string, TeamPerson[]>();
  for (const p of people) {
    if (p.id === viewerId) continue;
    // Reporting to someone outside the visible set → treated as the viewer's.
    const parent = p.managerId && byId.has(p.managerId) && p.managerId !== p.id ? p.managerId : viewerId;
    const list = children.get(parent);
    if (list) list.push(p);
    else children.set(parent, [p]);
  }
  for (const list of children.values()) list.sort(byName);

  /** Depth-first, a Team Lead then their people. Guarded against a cycle. */
  const walk = (id: string, seen: Set<string>, out: string[]) => {
    for (const c of children.get(id) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id, seen, out);
    }
  };

  const groups: TeamGroup[] = [];
  if (viewer) groups.push({ key: "self", label: "You", memberIds: [viewer.id], leadId: null });

  const lone: string[] = [];
  const seen = new Set<string>([viewerId]);
  for (const top of children.get(viewerId) ?? []) {
    seen.add(top.id);
    if ((children.get(top.id) ?? []).length > 0) {
      const ids = [top.id];
      walk(top.id, seen, ids);
      groups.push({ key: `team:${top.id}`, label: `${top.name}'s team`, memberIds: ids, leadId: top.id });
    } else {
      lone.push(top.id);
    }
  }
  if (lone.length > 0) {
    groups.push({
      key: "direct",
      label: viewer ? `Reporting directly to ${viewer.name}` : "Reporting directly",
      memberIds: lone,
      leadId: null,
    });
  }
  return groups;
}

/** Everyone below `leadId`, however far down — a Team Lead's whole team. */
export function downlineOf(leadId: string, people: readonly TeamPerson[]): string[] {
  const children = new Map<string, string[]>();
  for (const p of people) {
    if (!p.managerId || p.managerId === p.id) continue;
    const list = children.get(p.managerId);
    if (list) list.push(p.id);
    else children.set(p.managerId, [p.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>([leadId]);
  const stack = [...(children.get(leadId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}
