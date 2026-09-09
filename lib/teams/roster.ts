/**
 * THE SIX TEAMS — the site-wide Team filter's entire option list.
 *
 * A team is a MANAGER PLUS THEIR WHOLE BRANCH: that person, their reports,
 * their reports' reports, all the way down. So T1 (Manan) contains every other
 * team lead and everyone under them, and the smaller teams nest inside it.
 * Picking two teams is a UNION, not an intersection — see `resolveTeamScopes`.
 *
 * ── KEYED BY EMAIL, NOT BY NAME OR ID ──────────────────────────────────────
 * `employees.email` is unique and is what a person keeps across a rename; the
 * uuid would be unreadable here and would differ between environments, and the
 * display name drifts (the roster spells it "Rohan Choudhary", the request that
 * created this list spelled it "Chaudhary"). The lookup is by email so neither
 * of those can silently empty out a team.
 *
 * ── THE STORED VALUE IS "t1", NOT THE EMAIL ────────────────────────────────
 * `?team=t1` is what lands in URLs, bookmarks and shared links. Keeping the
 * slug opaque means re-pointing a team at a different manager is a one-line
 * edit here that leaves every existing link working, and it keeps staff email
 * addresses out of URLs people paste into chats.
 *
 * PURE + CLIENT-SAFE — no DB, no server-only import. The client filter renders
 * from this list and the server resolver reads the same one, so an option can
 * never exist in the dropdown without the resolver knowing how to scope it.
 */

export interface TeamOption {
  /** URL/slug value, e.g. "t1". Stable — never re-key an existing team. */
  value: string;
  /** Dropdown + chip label. */
  label: string;
  /** The manager this team is rooted at, matched case-insensitively. */
  managerEmail: string;
}

export const TEAM_ROSTER: readonly TeamOption[] = [
  // T1 is the whole company branch: every manager below Manan, and everyone
  // reporting to them, at any depth.
  { value: "t1", label: "T1 — Manan Vasa", managerEmail: "manan@unleashed.in" },
  { value: "t2", label: "T2 — Ruchita Ambre", managerEmail: "ruchitaambre.altuscorp@gmail.com" },
  { value: "t3", label: "T3 — Jeevan Bharambe", managerEmail: "jeevanbharambe.altuscorp@gmail.com" },
  { value: "t4", label: "T4 — Rutvisha Mehta", managerEmail: "rutvishamehta.altuscorp@gmail.com" },
  { value: "t5", label: "T5 — Rohan Choudhary", managerEmail: "rohanchoudhary.altuscorp@gmail.com" },
  { value: "t6", label: "T6 — Mitul Mehta", managerEmail: "mitulmehta.altuscorp@gmail.com" },
] as const;

const BY_VALUE = new Map(TEAM_ROSTER.map((t) => [t.value, t]));

export function teamOption(value: string): TeamOption | undefined {
  return BY_VALUE.get(value.trim().toLowerCase());
}

/**
 * Chip label for a selected value. Falls back to the raw value so a stale
 * bookmark (`?team=Sales`, from the old department-based filter) still renders
 * a removable chip instead of a blank one.
 */
export function teamLabel(value: string): string {
  return teamOption(value)?.label ?? value;
}
