/**
 * THE DASHBOARD'S WIDGET REGISTRY — what can go on the home screen, how wide it
 * may be, and what it starts as.
 *
 * The layout itself is the USER'S, not this file's: they reorder, resize, add
 * and remove, and the result is stored per browser. This is only the catalogue
 * and the starting arrangement.
 *
 * NO SERVER IMPORTS. The client grid reads this to render its "add a widget"
 * list and to validate a stored layout, so it must stay free of anything that
 * would drag `server-only` across the boundary.
 */

export type WidgetSize = "s" | "m" | "l";

export const WIDGET_IDS = [
  "wms-loop",
  "goals-week",
  "quick-actions",
  "hours-ledger",
  "upcoming",
  "attendance",
  "open-work",
  "outcomes",
  "work-shape",
  "team",
  "delegated",
  "inbox",
  "anniversaries",
  "open-table",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export interface WidgetSpec {
  id: WidgetId;
  /** Shown in the "add a widget" list and on the edit-mode handle. */
  title: string;
  /** One line explaining what it shows, for the add list. */
  blurb: string;
  /** The sizes this widget is legible at. Never empty. */
  sizes: readonly WidgetSize[];
  /** Where it starts, for someone who has never customised anything. */
  defaultSize: WidgetSize;
}

/**
 * THREE SIZES, on a six-column grid:
 *
 *   s   2 of 6   a third of the row   — three across
 *   m   3 of 6   half the row         — two across
 *   l   6 of 6   the full width
 *
 * A widget declares only the sizes it stays READABLE at. The donuts and the
 * bloom are square-ish and go muddy stretched full width; the table needs the
 * width and is unreadable in a third. `sizes` is what stops someone choosing a
 * shape that makes their own dashboard worse.
 */
export const WIDGETS: Record<WidgetId, WidgetSpec> = {
  "wms-loop": {
    id: "wms-loop",
    title: "WMS · daily loop",
    blurb: "What is due or overdue on you today, and the next three by name.",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
  "goals-week": {
    id: "goals-week",
    title: "Goals · this week",
    blurb: "This week's score, your weekly and cascade counts, and the FY average.",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
  "quick-actions": {
    id: "quick-actions",
    title: "Quick actions",
    blurb: "New task, plan your day, attendance, goals, inbox — one click each.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  "hours-ledger": {
    id: "hours-ledger",
    title: "Hours",
    blurb: "This week against your target, and the month so far, from your punches.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  upcoming: {
    id: "upcoming",
    title: "What's coming",
    blurb: "The next company holidays, with how far away they are.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  attendance: {
    id: "attendance",
    title: "Attendance — today",
    blurb: "Your punch and your week. Admins also see the roster counters.",
    sizes: ["m", "l"],
    defaultSize: "l",
  },
  "open-work": {
    id: "open-work",
    title: "Where your work sits",
    blurb: "Everything still assigned to you, split by priority.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  outcomes: {
    id: "outcomes",
    title: "This month's outcomes",
    blurb: "What was due this month: delivered, in progress, not started, overdue.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  "work-shape": {
    id: "work-shape",
    title: "Your work shape",
    blurb: "A petal per day sized by the hours you actually worked.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  team: {
    id: "team",
    title: "Your team",
    blurb: "Each direct report's open and overdue count, heaviest first.",
    sizes: ["m", "l"],
    defaultSize: "m",
  },
  delegated: {
    id: "delegated",
    title: "Waiting on",
    blurb: "Tasks you handed out that are still open, by person.",
    sizes: ["s", "m"],
    defaultSize: "m",
  },
  inbox: {
    id: "inbox",
    title: "Inbox",
    blurb: "Unread updates, and a way into the inbox and the archive.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  anniversaries: {
    id: "anniversaries",
    title: "Joined this month",
    blurb: "Work anniversaries falling in this calendar month.",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  "open-table": {
    id: "open-table",
    title: "Open on you",
    blurb: "Every task still on you, soonest first, with who gave it to you.",
    sizes: ["l"],
    defaultSize: "l",
  },
};

export interface WidgetPlacement {
  id: WidgetId;
  size: WidgetSize;
}

/**
 * The arrangement someone sees before they have touched anything.
 *
 * Ordered so the grid packs into full rows at the default sizes: 3+3, then
 * 2+2+2, then 6, then 2+2+2, then the wide ones. A widget the viewer has no
 * data or permission for is dropped by the page, not here.
 */
export const DEFAULT_LAYOUT: readonly WidgetPlacement[] = [
  { id: "wms-loop", size: "m" },
  { id: "goals-week", size: "m" },
  { id: "hours-ledger", size: "s" },
  { id: "upcoming", size: "s" },
  { id: "attendance", size: "l" },
  { id: "open-work", size: "s" },
  { id: "outcomes", size: "s" },
  { id: "work-shape", size: "s" },
  { id: "team", size: "m" },
  { id: "delegated", size: "m" },
  { id: "inbox", size: "s" },
  { id: "anniversaries", size: "s" },
  { id: "quick-actions", size: "s" },
  { id: "open-table", size: "l" },
];

/** How many of the six columns a size spans. */
export const SPAN: Record<WidgetSize, number> = { s: 2, m: 3, l: 6 };

export const SIZE_LABEL: Record<WidgetSize, string> = {
  s: "Small",
  m: "Medium",
  l: "Large",
};

/**
 * What gets written to storage.
 *
 * `removed` is the reason this is an object and not just an array. Without it
 * there is no way to tell "a widget you have never seen" from "a widget you
 * deliberately took off your dashboard" — and the reconcile below, which has to
 * append widgets added since you last saved, would put every removed one
 * straight back on your next visit.
 */
export type Density = "comfortable" | "compact";

export interface StoredLayout {
  v: 1;
  shown: WidgetPlacement[];
  removed: WidgetId[];
  /** Padding and gaps. `compact` fits roughly a third more on a screen. */
  density?: Density;
  /** Whether the date + greeting block shows above the grid. */
  greeting?: boolean;
}

export const DENSITY_LABEL: Record<Density, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

/** Everything about the dashboard that is not the widget list itself. */
export interface Preferences {
  density: Density;
  greeting: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { density: "comfortable", greeting: true };

/** Read the non-widget preferences out of whatever storage handed back. */
export function readPreferences(stored: unknown): Preferences {
  const box = (stored ?? {}) as Partial<StoredLayout>;
  return {
    density: box.density === "compact" ? "compact" : "comfortable",
    greeting: box.greeting !== false,
  };
}

export const LAYOUT_STORAGE_KEY = "altus.dashboard.layout";

/**
 * Repair a layout read from storage.
 *
 * Storage is a string a browser wrote, possibly against an older version of
 * this file: it can name a widget that no longer exists, give one a size it is
 * no longer legible at, list the same widget twice, or be outright corrupt.
 * Every one of those is dropped rather than trusted.
 *
 * `available` is what this particular viewer can be shown at all. Anything
 * outside it is filtered from the RESULT but left alone in storage, so a
 * manager who temporarily has no reports does not lose the team widget's place
 * in their layout the day it comes back.
 */
export function reconcileLayout(
  stored: unknown,
  available: readonly WidgetId[],
): WidgetPlacement[] {
  const allow = new Set(available);
  const seen = new Set<WidgetId>();
  const out: WidgetPlacement[] = [];

  const box = (stored ?? {}) as Partial<StoredLayout>;
  const shown = Array.isArray(box.shown) ? box.shown : [];
  const removed = new Set<WidgetId>(
    (Array.isArray(box.removed) ? box.removed : []).filter(
      (id): id is WidgetId => typeof id === "string" && id in WIDGETS,
    ),
  );

  for (const raw of shown) {
    if (!raw || typeof raw !== "object") continue;
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== "string" || !(id in WIDGETS)) continue;
    const wid = id as WidgetId;
    if (seen.has(wid)) continue;
    seen.add(wid);
    if (!allow.has(wid)) continue;
    const spec = WIDGETS[wid];
    const size = (raw as { size?: unknown }).size;
    const ok = typeof size === "string" && (spec.sizes as readonly string[]).includes(size);
    out.push({ id: wid, size: ok ? (size as WidgetSize) : spec.defaultSize });
  }

  // Widgets the stored layout never mentioned: new since it was written, or —
  // on a first visit, when there is nothing stored — all of them. That is how
  // DEFAULT_LAYOUT becomes the default without being a special case.
  for (const d of DEFAULT_LAYOUT) {
    if (seen.has(d.id) || removed.has(d.id) || !allow.has(d.id)) continue;
    out.push({ ...d });
  }

  return out;
}

/** Everything this viewer could add that is not already on their dashboard. */
export function hiddenWidgets(
  layout: readonly WidgetPlacement[],
  available: readonly WidgetId[],
): WidgetSpec[] {
  const on = new Set(layout.map((w) => w.id));
  return available.filter((id) => !on.has(id)).map((id) => WIDGETS[id]);
}
