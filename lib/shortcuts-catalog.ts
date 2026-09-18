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
 * each module's own letter and fails if this list stops agreeing with them. Keep
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

       THE LETTERS ARE MNEMONIC (2026-09-12) — each one comes from the module's
       own name, and each module names its own on MODULE_THEME[id].shortcut.
       They used to be positional, running along the top keyboard row in hub
       order; this note said so, and the order below still matches the hub so
       the sheet reads the way the cards do.

       Two of them are not first letters, because two pairs of names collide:
       Performance keeps R (it had R already, and it is in the word) so Project
       can take P, and the Admin Panel takes D (aDmin) so Accounts can take A.

       tests/unit/shortcuts-catalog.test.ts pins this list against MODULE_ORDER
       and moduleShortcut, which is what stops it drifting the way it did when
       it still advertised the retired 1-9/0 digits. */
    title: "Jump to a module",
    note: "Hold Alt and press the module's own letter — W for WMS, G for Goals. The card shows it.",
    items: [
      { keys: "Alt + W", does: "WMS" },
      { keys: "Alt + G", does: "Goals" },
      { keys: "Alt + P", does: "Project" },
      // R, not P — Project took that. R is in "peRformance" and is the key this
      // module already had under the positional scheme, so nobody relearned it.
      { keys: "Alt + R", does: "Performance" },
      { keys: "Alt + B", does: "Billing" },
      { keys: "Alt + H", does: "HR" },
      { keys: "Alt + S", does: "Sales" },
      { keys: "Alt + A", does: "Accounts" },
      { keys: "Alt + E", does: "Employees" },
      { keys: "Alt + O", does: "Operations" },
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
