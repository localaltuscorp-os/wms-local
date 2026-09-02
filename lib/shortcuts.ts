/**
 * Single source of truth for the app's keyboard shortcuts. Rendered by both
 * the global help overlay (press `?`) and the Profile → Appearance cheatsheet,
 * so the two never drift. Keep this list in sync with what's actually wired:
 *   - Global `?` / G-sequences   → components/layout/keyboard-shortcuts.tsx
 *   - ⌘K command palette         → components/header/global-search.tsx
 *   - N new task                 → components/tasks/new-task-dialog.tsx
 *   - J/K/Enter/F task-list nav  → components/tasks/task-table.tsx
 */

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
      { keys: ["G", "M"], description: "Go to My Day" },
      { keys: ["G", "P"], description: "Go to Projects" },
      { keys: ["G", "I"], description: "Go to Inbox" },
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
];
