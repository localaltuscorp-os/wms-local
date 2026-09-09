/**
 * THE SHORTCUT CATALOGUE — one list, read by the "?" help overlay AND the
 * "Keyboard shortcuts" sheet under the profile menu (Sir asked for that list to
 * live there).
 *
 * It is deliberately a plain data file with NO imports: the list can be rendered
 * anywhere, including a server component, and there is exactly ONE place to edit
 * when a binding changes — so the list a user reads can never drift from what is
 * actually bound.
 *
 * Every entry here is a REAL binding that exists in the code today:
 *   · components/layout/keyboard-shortcuts.tsx — the `g …` sequences and `?`
 *   · components/layout/module-shortcuts.tsx   — the 1-9 / 0 module digits
 *   · components/layout/focus-mode.tsx         — Ctrl+Q focus mode
 *   · components/header/global-search.tsx      — Ctrl/⌘+K global search
 *   · components/tasks/new-task-dialog.tsx     — N, new task
 * Nothing aspirational is listed. If a key is not bound, it is not in here.
 */

export interface ShortcutEntry {
  /** The keys, written the way a user would say them. */
  keys: string;
  /** What pressing them does. */
  does: string;
}

export interface ShortcutGroup {
  title: string;
  /** One line explaining when this group applies. */
  note?: string;
  items: ShortcutEntry[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Anywhere",
    note: "These work on every screen, unless you are typing in a field.",
    items: [
      { keys: "Ctrl + K", does: "Global search — tasks, clients, projects, people across the whole app" },
      { keys: "Ctrl + Q", does: "Focus mode — hide the rail, top bar and footer so the page fills the screen" },
      { keys: "Esc", does: "Leave focus mode (also closes any open dialog)" },
      { keys: "?", does: "Show this shortcut list" },
    ],
  },
  {
    title: "Jump to a module",
    note: "The number matches the badge on each module card in the footer.",
    items: [
      { keys: "1 … 9, 0", does: "Open that module — WMS, Goals, Team Productivity, Billing, HR, Sales, Accounts, Training, Employees, Monthly Events" },
    ],
  },
  {
    title: "Go to a page",
    note: "Press G, then the letter.",
    items: [
      { keys: "G then D", does: "Dashboard" },
      { keys: "G then T", does: "Tasks" },
      { keys: "G then K", does: "Kanban" },
      { keys: "G then M", does: "My Day" },
      { keys: "G then C", does: "Plan My Day" },
      { keys: "G then W", does: "Weekly Goals" },
      { keys: "G then P", does: "Projects" },
      { keys: "G then I", does: "Inbox" },
      { keys: "G then A", does: "Attendance" },
    ],
  },
  {
    title: "Tasks",
    items: [{ keys: "N", does: "New task" }],
  },
];

/** Flat list — handy for a compact rendering or a search box. */
export function allShortcuts(): ShortcutEntry[] {
  return SHORTCUT_GROUPS.flatMap((g) => g.items);
}
