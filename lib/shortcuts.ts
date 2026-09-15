/**
 * Single source of truth for the app's keyboard shortcuts. Rendered by both
 * the global help overlay (press `?`) and the Profile → Appearance cheatsheet,
 * so the two never drift. Keep this list in sync with what's actually wired:
 *   - Global `?` / G-sequences   → components/layout/keyboard-shortcuts.tsx
 *   - ⌘K command palette         → components/header/global-search.tsx
 *   - N new task                 → components/tasks/new-task-dialog.tsx
 *   - J/K/Enter/F task-list nav  → components/tasks/task-table.tsx
 *   - Alt+Q…Alt+S module switch  → components/layout/module-shortcuts.tsx
 */
import {
  ADMIN_PANEL_ENTRY,
  ADMIN_PANEL_SHORTCUT,
  MODULE_ORDER,
  MODULE_THEME,
  moduleShortcut,
} from "@/lib/module-theme";

export interface Shortcut {
  /** Each entry renders as one <kbd>. A two-key entry like ["G","D"] reads as
   *  the press-then-press sequence "G then D"; ["⌘","K"] is a chord. */
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  rows: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    rows: [
      { keys: ["?"], description: "Show this shortcut sheet" },
      { keys: ["⌘", "K"], description: "Open the command palette" },
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "T"], description: "Go to Tasks" },
      { keys: ["G", "M"], description: "Go to Plan My Day" },
      { keys: ["G", "P"], description: "Go to Projects" },
      { keys: ["G", "I"], description: "Go to Inbox" },
      { keys: ["G", "W"], description: "Go to Weekly Goals" },
      // The Daily Checklist merged into the planner long ago; G-C is now a
      // second key for the same destination as G-M.
      { keys: ["G", "C"], description: "Go to Plan My Day" },
      { keys: ["G", "K"], description: "Go to Kanban" },
      { keys: ["G", "A"], description: "Go to Attendance" },
    ],
  },
  {
    title: "Task list",
    rows: [
      { keys: ["N"], description: "New task" },
      { keys: ["J"], description: "Move down the list" },
      { keys: ["K"], description: "Move up the list" },
      { keys: ["Enter"], description: "Open the highlighted task" },
      { keys: ["F"], description: "Focus mode on the highlighted task" },
    ],
  },
  {
    title: "Forms & editing",
    rows: [
      { keys: ["⌘", "Enter"], description: "Submit a form / send a comment" },
      { keys: ["Esc"], description: "Close a dialog or cancel an inline edit" },
    ],
  },
  {
    title: "Modules",
    // DERIVED from MODULE_ORDER, not typed out: the letters, the hub card
    // badges, the footer prefixes and the key handler all read that one list,
    // so re-ordering the modules updates this sheet in the same commit instead
    // of leaving it describing last month's arrangement.
    //
    // Two <kbd>s rather than the "Alt+Q" string the footer shows: this sheet
    // renders each entry as its own key cap, which is what a chord looks like
    // here (see ["⌘","K"] above).
    rows: [
      ...MODULE_ORDER.flatMap((id, i) => {
        const key = moduleShortcut(i);
        return key ? [{ keys: ["Alt", key], description: `Open ${MODULE_THEME[id].label}` }] : [];
      }),
      // THE ADMIN PANEL — listed last because it is not one of the modules.
      // Shown to everyone rather than gated on `isAdmin`: this sheet is a static
      // list with no access context, and it already advertises rooms a given
      // reader cannot enter (every module row does). The key simply does nothing
      // for a non-admin, and `/admin` refuses them regardless.
      {
        keys: ["Alt", ADMIN_PANEL_SHORTCUT],
        description: `Open ${ADMIN_PANEL_ENTRY.label} Panel`,
      },
    ],
  },
];
