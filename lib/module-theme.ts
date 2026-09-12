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
  Cog,
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
  /**
   * The keyboard letter that opens this module — a SINGLE uppercase A-Z.
   *
   * MNEMONIC, taken from the module's own name (account holder, 2026-09-12):
   * W is WMS because of the W in "WMS". It used to be positional — the top
   * keyboard row handed out left to right in hub order — which meant the letter
   * told you where a card sat, not what it was, and every re-order silently
   * re-lettered everything after it.
   *
   * It lives HERE, on the module, for the property the positional scheme had
   * and a separate lookup table would lose: one place per module. Re-ordering
   * MODULE_ORDER now moves cards around and changes nothing about which key
   * opens what.
   *
   * Uniqueness is not something this type can express, so it is asserted
   * instead — see MODULE_SHORTCUT_COLLISIONS below, which also covers the Admin
   * Panel's letter, and tests/unit/module-shortcut-letters.test.ts.
   */
  shortcut: string;
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
    shortcut: "W",
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
    shortcut: "A",
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
    shortcut: "E",
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
    shortcut: "H",
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
    shortcut: "S",
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
    /* No hub card, so no keyboard letter: the listener scans MODULE_ORDER,
       which this module is not in. */
    shortcut: "",
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
    /* No hub card, so no keyboard letter: the listener scans MODULE_ORDER,
       which this module is not in. */
    shortcut: "",
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
    /* No hub card, so no keyboard letter: the listener scans MODULE_ORDER,
       which this module is not in. */
    shortcut: "",
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
    shortcut: "G",
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
    shortcut: "R",
    label: "Performance",
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
    shortcut: "B",
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
  // OPERATIONS — the two-tier room holding Hand-holding, Monthly Events Master,
  // Checklist and Guidelines.
  //
  // IT WEARS THE WMS RED (account holder, 2026-09-11), the same accent pair
  // `wms` carries above — not a hue of its own, and not the orange Hand-holding
  // brought with it.
  //
  // This is the ONE place that decides it. Every surface inside the room reads
  // the same two values: the hub card and the footer glyph take them from here,
  // and the pages inside (Hand-holding, Monthly Events Master, Checklist) each
  // declare them as their local ACCENT / ACCENT_DEEP constants — Tailwind
  // arbitrary values like `ring-[#E10600]/40` have to be literal strings, so
  // they cannot import a constant. Change the room's colour and those literals
  // have to move with it; they are listed in the Operations section of the
  // theme notes for exactly that reason.
  //
  // The two absorbed entries below keep their OWN themes, unchanged: they are
  // still valid WorkspaceIds (old /ws/<id> links resolve) but no longer appear
  // in MODULE_ORDER, so nothing renders them — they are history, not live
  // identity.
  operations: {
    id: "operations",
    shortcut: "O",
    label: "Operations",
    tagline: "Hand-holding, the events calendar, checklists & guidelines in one room.",
    href: "/ws/operations" as Route,
    Icon: Cog,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
  "people-allocation": {
    id: "people-allocation",
    /* No hub card, so no keyboard letter: the listener scans MODULE_ORDER,
       which this module is not in. */
    shortcut: "",
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
    shortcut: "P",
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
// The order below is the account holder's own (2026-09-10). It decides the hub
// layout and NOTHING ELSE: since 2026-09-12 the keyboard letters are mnemonic
// and each module names its own on MODULE_THEME[id].shortcut, so re-ordering
// this list, inserting into the middle of it, or removing an entry no longer
// disturbs a single shortcut. It used to hand out letters positionally, which
// is why the entries below carry their letter as a trailing comment — those are
// a reader's convenience now, not the source.
export const MODULE_ORDER: WorkspaceId[] = [
  "wms",               // W
  "goals",             // G
  "project-plan",      // P  — "Project"
  "productivity",      // R  — "Performance" (P went to Project)
  "billing",           // B
  "hr",                // H
  "sales",             // S
  "admin",             // A  — the card labelled "Accounts"
  "employees",         // E
  // Monthly Events Master and HandHolding are NOT here any more (2026-09-11),
  // and TRAINING left the same way on 2026-09-12: all three moved inside
  // Operations, so they are reached from its front door rather than from a hub
  // card of their own.
  //
  // Each of those departures used to re-letter every module behind it, because
  // the keys were positional. That is what finally retired the positional
  // scheme: three moves in two days, each one shuffling keys nobody had asked
  // to change. Letters are mnemonic now and a fourth move would cost none.
  "operations",        // O  — "Operations" (D belongs to the Admin Panel)
];

/**
 * THE SHORTCUT LETTERS — mnemonic, and owned by each module.
 *
 * ── WHAT CHANGED (account holder, 2026-09-12) ────────────────────────────
 * They used to be POSITIONAL: a fixed alphabet, "qwertyuiopdf", handed out left
 * to right down MODULE_ORDER, so WMS was Q because WMS was first. That had one
 * real virtue — a single list to edit, with no second mapping to keep in sync —
 * and two costs that finally outweighed it:
 *
 *   1. The letter described a POSITION, not a module. Nothing about "Q" says
 *      WMS, so the row had to be learned by rote and the hub itself was the
 *      only legend.
 *   2. Re-ordering the hub silently re-lettered every module after the change,
 *      and so did REMOVING one. Three modules moved inside Operations in two
 *      days; each departure shuffled the keys of everything behind it.
 *
 * Now each module names its own letter on {@link ModuleTheme.shortcut}, taken
 * from its label: W for WMS, G for Goals, B for Billing. MODULE_ORDER is free
 * to change without touching a single shortcut.
 *
 * ── THE TWO COLLISIONS, AND HOW THEY WERE SETTLED ────────────────────────
 * Ten labels do not yield ten distinct first letters:
 *
 *   Project vs Performance — Project takes P. Performance keeps R (the letter
 *   it already had under the positional scheme, and a letter in the word), so
 *   the people using it did not have to relearn anything.
 *
 *   Accounts vs Admin Panel — Accounts takes A. The Admin Panel moved to D
 *   (aDmin), which the Operations move had just left vacant. The panel is not a
 *   workspace — `workspaceForPath` returns null for /admin, alongside /inbox and
 *   /profile — so it cannot sit in MODULE_ORDER and carries its own letter on
 *   {@link ADMIN_PANEL_ENTRY} instead. The two key listeners share one keyboard,
 *   so its letter must not also resolve through `moduleForShortcut`.
 *
 * A module with an empty `shortcut` has no hub card and is unreachable by key —
 * `moduleForShortcut` never matches "", so an empty string cannot be pressed.
 */

/**
 * Every letter handed out twice, module letters and the Admin Panel's together.
 * EMPTY is the only correct value.
 *
 * A duplicate is not a type error and not a crash: two listeners answer one
 * keystroke and whichever runs first wins, so the hub badge promises a key that
 * opens something else. That is invisible until someone presses it, which is
 * why it is computed here and asserted in
 * tests/unit/module-shortcut-letters.test.ts rather than left to review.
 */
export const MODULE_SHORTCUT_COLLISIONS: string[] = (() => {
  const seen = new Map<string, number>();
  for (const letter of [...MODULE_ORDER.map((id) => MODULE_THEME[id].shortcut), "D"]) {
    if (!letter) continue;
    seen.set(letter.toUpperCase(), (seen.get(letter.toUpperCase()) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([l]) => l);
})();

/**
 * Keyboard shortcut letter for the module at `index` in MODULE_ORDER, uppercased
 * for display ("W", "G", …).
 *
 * Still INDEXED, though the letter is no longer derived from the index: every
 * caller — the hub badges, the footer dock, the module bar, the cheatsheet —
 * already walks MODULE_ORDER with an index in hand, and changing them all to
 * pass an id would have been a wide edit for no gain. A module past the end of
 * the list, or one with no letter, returns null and renders unlettered rather
 * than repeating someone else's key.
 */
export function moduleShortcut(index: number): string | null {
  const id = MODULE_ORDER[index];
  const key = id ? MODULE_THEME[id].shortcut : "";
  return key ? key.toUpperCase() : null;
}

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
  const want = key.trim().toUpperCase();
  // An empty `shortcut` means "no hub card, not reachable by key" — guard it,
  // or "" would match the modules that deliberately have no letter.
  if (!want) return undefined;
  return MODULE_ORDER.find((id) => MODULE_THEME[id].shortcut.toUpperCase() === want);
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
   `aw` cookie value naming a room with no nav, a HUB_PASTEL row and a ModuleLogo
   glyph. One descriptor is the smaller and more honest answer.

   (It used to cost one thing more: the alphabet was positional, so an insert
   re-lettered every module after it. That is no longer true — letters are
   mnemonic and owned per module — but none of the reasons above have changed.)

   ── `isAdmin`, NOT a capability ───────────────────────────────────────────
   Visibility everywhere reads `access.isAdmin`, which is exactly what the route
   guard and the existing user-menu entry already read. Hiding a card is
   presentation; the guard is the boundary, and it is untouched. */

/**
 * The letter that opens the Admin Panel. Bare on the hub, Alt+D everywhere.
 *
 * D, not A, since 2026-09-12: the shortcut letters became mnemonic and Accounts
 * claimed A as its own first letter. D is for aDmin, and it was free — it had
 * been Operations' key until Training left the hub and pulled everything up.
 *
 * It must never equal a module's letter. Both listeners are bound to the same
 * keyboard, so a shared letter means whichever answers first wins and the hub
 * badge promises a key that opens the other thing.
 * MODULE_SHORTCUT_COLLISIONS counts this letter alongside the modules' for
 * exactly that reason.
 */
export const ADMIN_PANEL_SHORTCUT = "D";

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
