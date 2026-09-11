/**
 * THE SHORTCUT CATALOGUE — one list, read by the "?" help overlay AND the
 * "Keyboard shortcuts" sheet under the profile menu (Sir asked for that list to
 * live there).
 *
 * It is deliberately a plain data file with NO imports: the list can be rendered
 * anywhere, including a server component, and there is exactly ONE place to edit
 * when a binding changes.
 *
 * BEING A COPY, IT CAN DRIFT — and it did. This file went on advertising the
 * 1-9/0 digits for months after the module keys became Alt+letters (2026-09-10),
 * because nothing checked it against the binding. The module rows below are now
 * pinned by tests/unit/shortcuts-catalog.test.ts, which reads MODULE_ORDER and
 * the shortcut alphabet and fails if this list stops agreeing with them. Keep
 * the file import-free; let the test be what guards it.
 *
 * Every entry here is a REAL binding that exists in the code today:
 *   · components/layout/keyboard-shortcuts.tsx — the `g …` sequences and `?`
 *   · components/layout/module-shortcuts.tsx   — the Alt+letter module keys
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
    /* ONE ROW PER MODULE, the way "Go to a page" below lists its sequences.
       The previous single row crammed every module name into one sentence, and
       a reader wanting "which letter is Sales?" had to count words to find out.
       The letters are POSITIONAL — they follow the top keyboard row across the
       hub's own card order — so the list doubles as the legend. */
    title: "Jump to a module",
    note: "Hold Alt and press the letter shown on the module's card. The letters run along the top row, in hub order.",
    items: [
      { keys: "Alt + Q", does: "WMS" },
      { keys: "Alt + W", does: "Goals" },
      { keys: "Alt + E", does: "Project" },
      { keys: "Alt + R", does: "Performance" },
      { keys: "Alt + T", does: "Billing" },
      { keys: "Alt + Y", does: "HR" },
      { keys: "Alt + U", does: "Sales" },
      { keys: "Alt + I", does: "Accounts" },
      { keys: "Alt + O", does: "Training" },
      { keys: "Alt + P", does: "Employees" },
      { keys: "Alt + A", does: "Operations" },
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
