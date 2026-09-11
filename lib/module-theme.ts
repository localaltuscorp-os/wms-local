import {
  ShieldCheck,
  LayoutGrid,
  Users,
  TrendingUp,
  BriefcaseBusiness,
  GraduationCap,
  CalendarDays,
  Target,
  ReceiptIndianRupee,
  type LucideIcon,
  Gauge,
  Users2,
  FolderTree,
  ShieldAlert,
} from "lucide-react";
import type { Route } from "next";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * THE module identity + color system (meeting 2026-06-29: "every module has a
 * specific color so we know which module we're in"). One source of truth for
 * each workspace's accent, deep accent, hero photo, icon, label and tagline —
 * consumed by the Hub front door AND by each module's own bespoke chrome, so a
 * module is instantly recognizable by color everywhere inside it.
 *
 * WMS keeps the Altus red identity (its existing look is unchanged). Every other
 * module gets a distinct, accessible accent.
 */
export interface ModuleTheme {
  id: WorkspaceId;
  label: string;
  tagline: string;
  href: Route;
  Icon: LucideIcon;
  /** Primary accent (buttons, active states, headers). */
  accent: string;
  /** Darker accent for text-on-tint + gradients. */
  accentDeep: string;
  /** Hero photo for the Hub card (public/hub/*). WMS has none — the founder is
   *  designing its logo treatment, so its card stays a branded logo card. */
  image: string | null;
}

export const MODULE_THEME: Record<WorkspaceId, ModuleTheme> = {
  wms: {
    id: "wms",
    label: "WMS",
    tagline: "The work dashboard - tasks, goals & the daily loop.",
    href: "/ws/wms" as Route,
    Icon: LayoutGrid,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
  admin: {
    id: "admin",
    label: "Accounts",
    tagline: "Accounts, compliance & the control room.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3A32A6",
    image: "/hub/admin.png",
  },
  employees: {
    id: "employees",
    label: "Employees",
    tagline: "Attendance, performance, salary, incentives & people ops.",
    href: "/ws/employees" as Route,
    Icon: Users,
    accent: "#16a34a",
    accentDeep: "#0F5B2E",
    image: "/hub/employees.png",
  },
  // HR — the paperwork room: dossier, agreements, policies, letters, queries &
  // support. Teal identity — distinct from Employees green and Events cyan.
  hr: {
    id: "hr",
    label: "HR",
    tagline: "Dossier, agreements, policies, letters & employee support.",
    href: "/ws/hr" as Route,
    Icon: BriefcaseBusiness,
    accent: "#0d9488",
    accentDeep: "#0B5A54",
    image: null,
  },
  sales: {
    id: "sales",
    label: "Sales",
    tagline: "Collections, references & breakthroughs.",
    href: "/ws/sales" as Route,
    Icon: TrendingUp,
    accent: "#7c3aed",
    accentDeep: "#5b21b6",
    image: "/hub/sales.png",
  },
  // Marketing retired as a room (2026-07): its only surface (/index-hub) now
  // lives inside WMS as "Important Links".
  training: {
    id: "training",
    label: "Training",
    tagline: "Material library, tests, induction & feedback.",
    href: "/ws/training" as Route,
    Icon: GraduationCap,
    accent: "#2563eb",
    accentDeep: "#1d4ed8",
    image: "/hub/training.png",
  },
  // Accounts is no longer a top-level hub card — it now lives INSIDE the Admin
  // module (which opens to it). It inherits Admin's indigo identity so the two
  // read as one module. Kept here so MODULE_THEME covers every WorkspaceId.
  accounts: {
    id: "accounts",
    label: "Accounts",
    tagline: "Compliance, trackers & the accountant's checklist.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3A32A6",
    image: null,
  },
  // Monthly Events Master — cyan identity, distinct from the other rooms. Sir's
  // monthly Event Master planning sheet, rebuilt in the WMS.
  events: {
    id: "events",
    label: "Monthly Events Master",
    tagline: "The company calendar - batches, holidays & obligations in one grid.",
    href: "/ws/events" as Route,
    Icon: CalendarDays,
    accent: "#0891b2",
    accentDeep: "#0B5567",
    image: null,
  },
  // Goals — Sir's yearly-goal sheet as a live Y→Q→M→W cascade + the Saturday
  // commit / Monday approve / Plan-Your-Day daily loop. Deep amber-gold identity,
  // distinct from WMS red and Employees green.
  goals: {
    id: "goals",
    label: "Goals",
    tagline: "Yearly → quarterly → monthly → weekly, committed and delivered daily.",
    href: "/ws/goals" as Route,
    Icon: Target,
    accent: "#b45309",
    accentDeep: "#7C3D09",
    image: null,
  },
  // Productivity Dashboard — a top-level module of its own, sitting beside Goals
  // rather than inside it. Distinct slate/indigo accent so the hub reads it as a
  // separate room, not a Goals sub-surface.
  productivity: {
    id: "productivity",
    label: "Team Productivity",
    tagline: "One cockpit per person - incentive, goals, tasks, training at a glance.",
    href: "/ws/productivity" as Route,
    Icon: Gauge,
    accent: "#4338ca",
    accentDeep: "#312e81",
    image: null,
  },
  // Billing — invoices, payments, billing cycles & revenue. Purple identity:
  // adjacent to Sales' violet (they share the money story) but a clearly
  // distinct hue, so the two rooms never read as one.
  billing: {
    id: "billing",
    label: "Billing",
    tagline: "Invoices, payments, billing cycles & revenue management.",
    href: "/billing" as Route,
    Icon: ReceiptIndianRupee,
    accent: "#9333ea",
    accentDeep: "#7e22ce",
    image: null,
  },
  // Hand-holding — who is staffed on which client. Orange, its own identity:
  // it left Billing and should not read as a purple annex of it.
  "people-allocation": {
    id: "people-allocation",
    label: "HandHolding",
    tagline: "Who is staffed on which client, product and team.",
    href: "/people-allocation" as Route,
    Icon: Users2,
    accent: "#ea580c",
    accentDeep: "#c2410c",
    image: null,
  },
  // Project — the planning hierarchy (Project → Milestone → Result → Action).
  // The WMS red on purpose: its executable rows ARE WMS tasks (one `tasks`
  // record, shown from a second angle), so the two rooms are meant to read as
  // one family rather than as neighbours.
  "project-plan": {
    id: "project-plan",
    label: "Project",
    tagline: "Projects, milestones, results & the actions under them.",
    href: "/project-plan" as Route,
    Icon: FolderTree,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
};

/** Hub display order. */
// The hub grid renders THIS list, not MODULE_THEME's keys — a module with a
// theme entry but no place here is fully configured and still invisible, which
// is exactly how Productivity shipped without a card. Adding a room means adding
// it in both places.
//
// The order below is the account holder's own (2026-09-10) and it is also what
// hands out the keyboard letters: position 1 gets "q", position 2 "w", and so on
// down SHORTCUT_KEYS. Re-ordering this list therefore RE-LETTERS the modules —
// that is the intended behaviour (one list, no second mapping), but it means an
// insert in the middle shifts every letter after it, so add to the end unless a
// re-lettering is what you actually want.
export const MODULE_ORDER: WorkspaceId[] = [
  "wms",               // q
  "goals",             // w
  "project-plan",      // e  — "Project"
  "productivity",      // r  — "Team Productivity"
  "billing",           // t
  "hr",                // y
  "sales",             // u
  "admin",             // i  — the card labelled "Accounts"
  "training",          // o
  "employees",         // p
  "events",            // a  — "Monthly Events Master"
  "people-allocation", // s  — "HandHolding"
];

/**
 * THE SHORTCUT ALPHABET — the top keyboard row left to right, then two home-row
 * keys that continue it. Twelve letters for twelve modules, so every room has one
 * (the old 1–9/0 digits ran out at ten and left HandHolding and Project with no
 * shortcut at all).
 *
 * Letters rather than digits at the account holder's request (2026-09-10). They
 * are positional, not mnemonic: "q" is WMS because WMS is first, not because of
 * anything in the word. That is deliberate — the row reads left to right in the
 * same order the hub cards do, so the hub itself is the legend.
 *
 * ── WHY THE TAIL IS "df" AND NOT "as" (2026-09-11) ─────────────────────────
 * The ADMIN PANEL was given a standalone entry with the letter A, and A was
 * already this list's eleventh key — Monthly Events Master. Both are admin-only
 * surfaces, so that was a collision for exactly the people who would use either
 * one: whichever listener answered first won, and the hub badge would have
 * promised one of them a key that opened the other.
 *
 * So the two tail modules moved one pair of home-row keys to the right and A
 * was vacated. Monthly Events Master is now D, HandHolding is F. Editing this
 * string is all it took: the hub badges, the footer dock, the module bar, the
 * ? cheatsheet and both key listeners derive their letters from here, which is
 * the property this list exists to have.
 *
 * A is DELIBERATELY ABSENT from this alphabet rather than mapped to the Admin
 * Panel inside it. The panel is not a workspace — `workspaceForPath` returns
 * null for `/admin`, alongside `/inbox` and `/profile` — so it cannot sit in
 * MODULE_ORDER without inventing a room that has no nav and no `aw` cookie
 * value. It carries its own letter on {@link ADMIN_PANEL_ENTRY}; keeping A out
 * of here is what stops `moduleForShortcut("a")` from resolving and lets the
 * two listeners share one keystroke without both firing.
 */
const SHORTCUT_KEYS = [..."qwertyuiopdf"] as const;

/**
 * Keyboard shortcut letter for the module at `index` in MODULE_ORDER, uppercased
 * for display ("Q", "W", …).
 *
 * Derived from POSITION rather than stored per module, so MODULE_ORDER stays the
 * only thing anyone edits — the hub badges, the footer prefixes, the cheatsheet
 * and the key handler all read the same list and cannot drift apart. A module
 * past the alphabet's end returns null and renders unlettered rather than
 * repeating someone else's key.
 */
export function moduleShortcut(index: number): string | null {
  const key = SHORTCUT_KEYS[index];
  return key ? key.toUpperCase() : null;
}

/**
 * The COMPACT badge for the tight rows — the module footer dock and the module
 * bar — as "⌥Q".
 *
 * The modifier is part of the shortcut, not decoration: a bare letter cannot
 * navigate (see ModuleShortcuts for why), so a dock that advertised a lone "Q"
 * would be advertising something that does nothing.
 *
 * WHY THE GLYPH AND NOT "Alt+Q". Both of those rows carry all twelve modules on
 * one line and scroll horizontally when they overrun. "⌥Q" is the same two
 * characters the digits' "⌃1" occupied, so the dock keeps the width it was
 * designed at; spelling out "Alt+" twelve times added roughly 200px and pushed
 * the tail of the row off-screen. The glyph is not left to explain itself — it
 * is the same ⌃/⌥ convention these rows already used, `moduleShortcutLabel`
 * spells it out in each entry's hover title, and the ? cheatsheet renders real
 * "Alt" + letter key caps.
 */
export function moduleShortcutHint(index: number): string | null {
  const key = moduleShortcut(index);
  return key ? `⌥${key}` : null;
}

/** The spelled-out form, for tooltips and anywhere with room — "Alt+Q". */
export function moduleShortcutLabel(index: number): string | null {
  const key = moduleShortcut(index);
  return key ? `Alt+${key}` : null;
}

/** The module a pressed letter should open, or undefined if none. */
export function moduleForShortcut(key: string): WorkspaceId | undefined {
  const i = SHORTCUT_KEYS.indexOf(key.toLowerCase() as (typeof SHORTCUT_KEYS)[number]);
  return i === -1 ? undefined : MODULE_ORDER[i];
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ADMIN PANEL — a module ENTRY that is not a workspace
   ════════════════════════════════════════════════════════════════════════════

   The Admin Panel now has a standalone entry beside the twelve rooms: a hub
   card, a place in the footer dock and the module bar, and the letter A. All of
   them point at `/admin`, the route that has always been there.

   ── NOTHING IS DUPLICATED, AND THIS IS THE FILE THAT GUARANTEES IT ─────────
   This descriptor carries a LABEL, an ICON, a COLOUR and an HREF. It carries no
   pages, no queries, no permission logic and no second copy of the panel. Every
   entry point renders `app/(admin)/admin/**` through `app/(admin)/admin/layout.tsx`,
   whose `requireUser()` + `me.isAdmin` guard is the only thing that decides who
   gets in. The user-menu "Admin panel" link, the new hub card and the A key are
   three doors onto one room.

   ── WHY IT IS NOT A WorkspaceId ───────────────────────────────────────────
   `/admin` is a SHARED PLATFORM SURFACE. `workspaceForPath` deliberately returns
   null for it (see the note there, which lists it with `/inbox`, `/archived` and
   `/profile`), so the nav keeps whatever room you came in through instead of
   snapping to a room the panel does not have. Adding it to WORKSPACE_IDS and
   MODULE_ORDER would mean: a landing entry, a `canAccessWorkspace` branch, an
   `aw` cookie value naming a room with no nav, a HUB_PASTEL row, a ModuleLogo
   glyph — and, because the alphabet above is positional, a RE-LETTERING of every
   module after its insert point. One descriptor is the smaller and more honest
   answer.

   ── `isAdmin`, NOT a capability ───────────────────────────────────────────
   Visibility everywhere reads `access.isAdmin`, which is exactly what the route
   guard and the existing user-menu entry already read. Hiding a card is
   presentation; the guard is the boundary, and it is untouched. */

/** The letter that opens the Admin Panel. Bare on the hub, Alt+A everywhere. */
export const ADMIN_PANEL_SHORTCUT = "A";

export interface AdminPanelEntry {
  label: string;
  tagline: string;
  href: Route;
  Icon: LucideIcon;
  accent: string;
  accentDeep: string;
  /** Uppercase, for the badges. */
  shortcut: string;
}

/**
 * The standalone Admin Panel entry, shaped like a {@link ModuleTheme} minus the
 * `id` — so the hub card, the dock and the bar can render it with the code they
 * already have instead of a parallel treatment.
 *
 * The red is the Altus brand red the user menu already tints its "Admin panel"
 * row with, and it is deliberately NOT the slate blue of the `admin` workspace:
 * that card is labelled "Accounts" and opens `/accounts`. Two different places
 * with confusingly adjacent names is precisely why they must not share a colour.
 */
export const ADMIN_PANEL_ENTRY: AdminPanelEntry = {
  label: "Admin",
  tagline: "The control room — employees, masters, settings & activity.",
  href: "/admin" as Route,
  Icon: ShieldAlert,
  accent: "#E10600",
  accentDeep: "#A80400",
  shortcut: ADMIN_PANEL_SHORTCUT,
};

/**
 * Did this keystroke ask for the Admin Panel?
 *
 * Case-insensitive, and the ONE place the letter is compared, so the hub
 * listener and the layout listener cannot drift from the badge.
 */
export function isAdminPanelShortcut(letter: string): boolean {
  return letter.toLowerCase() === ADMIN_PANEL_SHORTCUT.toLowerCase();
}
