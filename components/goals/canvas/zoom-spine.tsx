"use client";

/**
 * Goals Canvas — SPINE (the sticky top navigator).
 *
 * Reshaped to an EXPLICIT, menu-style model (no more drill-by-breadcrumb):
 *
 *   ┌ LEVEL SELECTOR ─────────────┐   what am I planning right now?
 *   │  Quarters · Months · Weeks   │   Quarters → year is the parent (Q1–Q4 on
 *   └──────────────────────────────┘   the right); Months → a quarter is the
 *                                       parent (M1–M3); Weeks → a month is the
 *                                       parent (W1…). One click jumps straight
 *                                       to that level — the parent auto-resolves
 *                                       to the current period (stage.defaultFocus).
 *
 *   ┌ PARENT PICKER ──────────────┐   which parent am I breaking down?
 *   │  Planning months for  [Q1…] │   explicit, labelled tabs (Q1 · Apr–Jun,
 *   │  in                   [Jul…]│   month names) — the LEFT panel always shows
 *   └──────────────────────────────┘   the picked parent, the RIGHT its children.
 *
 * The person always feels they are descending into ONE objective (year →
 * quarter → month → week), never navigating unrelated pages. Person switcher +
 * List/Board stay on the right (Exec/Ops is GONE — one unified surface;
 * `canWrite` gates the touchable bits). Keyboard: ⌘. repr · ⌘↑ up.
 *
 * Pure URL/derived state — ZERO queries; zoom is STATE (never CSS zoom/transform
 * on ancestors — Radix portals break, globals.css:135). Amber identity, no red.
 */

import * as React from "react";
import { useQueryState, parseAsString } from "nuqs";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, KanbanSquare, Rows3, ChevronRight, X } from "lucide-react";
import { Kbd } from "@/components/layout/keyboard-shortcuts";
import { SHORTCUT_GROUPS, type ShortcutGroup } from "@/lib/shortcuts";
import {
  quarterKeyOfMonthKey,
  monthKeysOfQuarter,
  fyStartYearOfKey,
  quarterOfKey,
} from "@/lib/goals/types";
import { periodKeyLabel } from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, accentMix } from "./tokens";
import { initialsOf } from "./people";
import { monthNameOf } from "./stage";
import { useCanvasShell } from "./shell-context";
import { useCanvasStage } from "./stage";
import type { CanvasRepr, GoalDTO, ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */

/* Accent + ramp come from the design contract (tokens.ts, §2.0). */

/* ------------------------------------------------------------------ */
/* Roving tabindex — WAI-ARIA tabs keyboarding for the tab rows (§2.8)  */
/* ------------------------------------------------------------------ */

/**
 * §2.8 — the level row and period rails carry `role="tablist"`/`role="tab"`,
 * so they must keyboard like tabs: ONE tab stop per row (the active tab),
 * ←/→/Home/End move focus with wraparound. Attach `ref` + `onKeyDown` to the
 * tablist container; tabs manage their own `tabIndex` (active 0, rest −1).
 */
function useRovingTabs(): {
  ref: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  const ref = React.useRef<HTMLDivElement>(null);
  const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    const root = ref.current;
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabs.length === 0) return;
    e.preventDefault();
    const focused = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const anchor = focused !== -1 ? focused : Math.max(0, tabs.findIndex((t) => t.tabIndex === 0));
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : (anchor + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return { ref, onKeyDown };
}

/* ------------------------------------------------------------------ */
/* Level selector — the primary "what am I planning" control            */
/* ------------------------------------------------------------------ */

type LevelKey = "quarters" | "months" | "weeks";

const LEVELS: Array<{ key: LevelKey; label: string; z: ZoomLevel; hint: string }> = [
  { key: "quarters", label: "Quarters", z: "year", hint: "Break the yearly goal into Q1–Q4" },
  { key: "months", label: "Months", z: "quarter", hint: "Break a quarter into its 3 months" },
  { key: "weeks", label: "Weeks", z: "month", hint: "Break a month into its weeks" },
];

/** Which level tab is lit, from the current zoom depth. */
function levelKeyOfZoom(z: ZoomLevel): LevelKey {
  if (z === "year") return "quarters";
  if (z === "quarter") return "months";
  return "weeks"; // month · week · day all live under "Weeks"
}

function LevelSelector(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { zoom } = shell;
  const active = levelKeyOfZoom(stage.z);
  const roving = useRovingTabs(); // §2.8 — real tablist keyboarding

  /** Jump to a planning level, carrying the current objective's context so the
   *  LEFT parent stays sensible (down = the relevant child, up = the parent). */
  const goLevel = React.useCallback(
    (key: LevelKey) => {
      const cur = stage.focus;
      if (key === "quarters") {
        zoom.focusNode(null, "year"); // year: the objective IS the canvas, no left focus
        return;
      }
      if (key === "months") {
        let qId: string | null = null;
        if (cur?.period === "quarter") qId = cur.id;
        else if (cur?.period === "month") {
          qId = stage.maps.byPeriodKey.get(quarterKeyOfMonthKey(cur.periodKey))?.[0]?.id ?? null;
        }
        zoom.focusNode(qId, "quarter"); // null → stage picks the current quarter
        return;
      }
      // weeks: focus a month (the quarter's first, if we're on a quarter)
      let mId: string | null = null;
      if (cur?.period === "month") mId = cur.id;
      else if (cur?.period === "quarter") {
        mId =
          shell.goals
            .filter((g) => g.period === "month" && quarterKeyOfMonthKey(g.periodKey) === cur.periodKey)
            .sort((a, b) => a.periodKey.localeCompare(b.periodKey))[0]?.id ?? null;
      }
      zoom.focusNode(mId, "month"); // null → stage picks the current month
    },
    [stage.focus, stage.maps, zoom, shell.goals],
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="hidden shrink-0 rounded-chip px-2 py-1 text-[11px] font-bold tabular-nums text-ink-subtle sm:inline"
        style={{ background: "var(--color-surface-soft)" }}
        title="Financial year"
      >
        FY{String(shell.fyStartYear % 100)}
      </span>
      <div
        role="tablist"
        aria-label="Planning level"
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        className="flex items-center rounded-chip border p-0.5"
        style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
      >
        {LEVELS.map((lv) => {
          const on = lv.key === active;
          return (
            <button
              key={lv.key}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1} // §2.8 roving tabindex
              title={lv.hint}
              onClick={() => goLevel(lv.key)}
              className="inline-flex h-8 items-center rounded-[9px] px-3.5 text-[12.5px] font-bold transition-colors"
              style={
                on
                  ? { color: "#fff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
                  : { color: "var(--color-ink-muted)" }
              }
            >
              {lv.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LEVEL_TITLE: Record<LevelKey, string> = {
  quarters: "Quarterly Goals",
  months: "Monthly Goals",
  weeks: "Weekly Goals",
};

/** Level pages hide the selector (the sidebar navigates levels) — show a
 *  heading instead so the page still says what you're planning. */
function LevelLabel(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="hidden shrink-0 rounded-chip px-2 py-1 text-[11px] font-bold tabular-nums text-ink-subtle sm:inline"
        style={{ background: "var(--color-surface-soft)" }}
      >
        FY{String(shell.fyStartYear % 100)}
      </span>
      <h1
        className="truncate text-[18px] font-black tracking-tight text-ink-strong"
        style={{ fontFamily: "var(--font-serif), var(--font-display), system-ui, sans-serif" }}
      >
        {/* yearly rootView — the page is about the YEAR objectives themselves */}
        {stage.rootView ? "Yearly Goals" : LEVEL_TITLE[levelKeyOfZoom(stage.z)]}
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parent picker — which parent are we breaking down (explicit tabs)   */
/* ------------------------------------------------------------------ */

function PickerRow(props: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const roving = useRovingTabs(); // §2.8 — real tablist keyboarding per rail
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {props.label}
      </span>
      <div
        role="tablist"
        aria-label={props.label}
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-chip border px-1.5 py-1 nav-scroll"
        style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
      >
        {props.children}
      </div>
    </div>
  );
}

function Tab(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  /** §2.8 roving tabindex — the row's one tab stop (active tab, or the first
   *  tab of an all-inactive row so the rail never falls out of the tab order). */
  tabStop?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      tabIndex={(props.tabStop ?? props.active) ? 0 : -1}
      title={props.title ?? props.label}
      onClick={props.onClick}
      className={`shrink-0 whitespace-nowrap rounded-chip px-2.5 py-1 text-[12px] font-bold transition-colors ${props.active ? "text-ink-strong" : "text-ink-subtle hover:text-ink-strong"}`}
      style={{
        background: props.active ? accentMix(14) : "transparent",
        boxShadow: props.active ? `0 0 0 2px ${accentMix(45)}` : "none",
      }}
    >
      {props.label}
    </button>
  );
}

function ParentPicker(): React.JSX.Element | null {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { zoom } = shell;
  const level = levelKeyOfZoom(stage.z);
  const fy = shell.fyStartYear;

  // The 4 quarter goals of this FY (some may not exist yet → null goal).
  const quarters = React.useMemo(
    () =>
      [1, 2, 3, 4].map((q) => {
        const key = `${fy}-Q${q}`;
        return { q, key, goal: stage.maps.byPeriodKey.get(key)?.[0] ?? null };
      }),
    [fy, stage.maps],
  );

  // Which quarter is currently in context. A goal-less PICKED quarter (?pk=,
  // bug #14) wins next, then the stage's EFFECTIVE calendar month (bug #2/#3)
  // so goal-less months still light their quarter and render the 3 month tabs.
  const activeQuarterKey =
    stage.focus?.period === "quarter"
      ? stage.focus.periodKey
      : stage.focus?.period === "month"
        ? quarterKeyOfMonthKey(stage.focus.periodKey)
        : zoom.pk && /^\d{4}-Q[1-4]$/.test(zoom.pk)
          ? zoom.pk
          : stage.monthKey
            ? quarterKeyOfMonthKey(stage.monthKey)
            : null;

  // The three CALENDAR months of the active quarter (for the "Weeks" level
  // second row). Built from the quarter's canonical month keys — one tab per
  // calendar month (Apr/May/Jun …), NOT one per month-goal. Each tab resolves
  // to its month goal if one exists, else focuses the empty calendar bucket.
  const months = React.useMemo<{ key: string; goal: GoalDTO | null }[]>(() => {
    if (!activeQuarterKey) return [];
    const fy = fyStartYearOfKey(activeQuarterKey);
    const q = quarterOfKey(activeQuarterKey);
    return monthKeysOfQuarter(fy, q).map((key) => ({
      key,
      goal: stage.maps.byPeriodKey.get(key)?.[0] ?? null,
    }));
  }, [activeQuarterKey, stage.maps]);

  // "Quarters" level: the parent is the year — nothing to pick.
  // (Early return AFTER all hooks — Rules of Hooks.)
  if (level === "quarters") return null;

  const onQuarter = (q: { key: string; goal: GoalDTO | null }) => {
    if (level === "months") {
      // stay at Months, swap the quarter parent — a goal-LESS quarter carries
      // its CLICKED key (?pk=, bug #14) so the stage focuses THAT bucket, not
      // the current-quarter fallback.
      zoom.focusNode(q.goal?.id ?? null, "quarter", q.goal ? null : q.key);
      return;
    }
    // Weeks level: pick that quarter's first month; if none, drop to Months to create them
    const firstMonth = shell.goals
      .filter((g) => g.period === "month" && quarterKeyOfMonthKey(g.periodKey) === q.key)
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))[0];
    if (firstMonth) zoom.focusNode(firstMonth.id, "month");
    // bug #4 — on a LEVEL page (hideLevelNav) the quarter tab may never zoom
    // shallower than the page's locked level; stay on the weeks surface and
    // land on the quarter's FIRST calendar month, carried via ?pk= (bug #14 —
    // the buckets synthesize from the calendar, goal or not — bug #2).
    else if (shell.hideLevelNav) {
      const mk = monthKeysOfQuarter(fyStartYearOfKey(q.key), quarterOfKey(q.key))[0];
      zoom.focusNode(null, "month", mk ?? null);
    } else zoom.focusNode(q.goal?.id ?? null, "quarter", q.goal ? null : q.key);
  };

  const anyQuarterActive = quarters.some((q) => activeQuarterKey === q.key);
  const activeMonthKey = stage.focus?.periodKey ?? stage.monthKey;
  const anyMonthActive = months.some((m) => activeMonthKey === m.key);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <PickerRow label={level === "months" ? "Planning months for" : "Quarter"}>
        {quarters.map((q, i) => (
          <Tab
            key={q.key}
            label={periodKeyLabel(q.key)}
            active={activeQuarterKey === q.key}
            tabStop={activeQuarterKey === q.key || (!anyQuarterActive && i === 0)}
            onClick={() => onQuarter(q)}
            title={q.goal ? q.goal.title : `${periodKeyLabel(q.key)} — no goal yet`}
          />
        ))}
      </PickerRow>

      {level === "weeks" && months.length > 0 && (
        <>
          <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
          <PickerRow label="Planning weeks in">
            {months.map((m, i) => (
              <Tab
                key={m.key}
                label={monthNameOf(m.key)}
                active={activeMonthKey === m.key}
                tabStop={activeMonthKey === m.key || (!anyMonthActive && i === 0)}
                // bug #14 — a goal-less calendar month carries its CLICKED key
                // (?pk=) so the stage's effective monthKey resolves to IT (not
                // the "now" fallback) and its synthesized week buckets render
                // (bug #2/#3). Previously smuggled via a first-Monday ?wk= hack.
                onClick={() => zoom.focusNode(m.goal?.id ?? null, "month", m.goal ? null : m.key)}
                title={m.goal ? m.goal.title : `${monthNameOf(m.key)} — no goal yet`}
              />
            ))}
          </PickerRow>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented toggle                                                    */
/* ------------------------------------------------------------------ */

function Segmented<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string; icon: React.ReactNode; hint: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className="flex items-center rounded-chip border p-0.5"
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
    >
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.hint}
            onClick={() => props.onChange(o.value)}
            className="inline-flex h-7 items-center gap-1 rounded-[9px] px-2.5 text-[11.5px] font-bold transition-colors"
            style={
              active
                ? { color: "#fff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
                : { color: "var(--color-ink-muted)" }
            }
          >
            {o.icon}
            <span className="max-lg:hidden">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Person switcher — ?emp= (server-guarded, shallow:false)             */
/* ------------------------------------------------------------------ */

function PersonSwitcher(): React.JSX.Element {
  const shell = useCanvasShell();
  const [, setEmp] = useQueryState(
    "emp",
    parseAsString.withOptions({ shallow: false, history: "push" }),
  );

  const hasRoster = shell.roster.length > 0;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        aria-hidden="true"
      >
        {initialsOf(shell.viewedName)}
      </span>
      {hasRoster ? (
        <select
          value={shell.viewedEmployeeId}
          onChange={(e) => void setEmp(e.target.value)}
          aria-label="Whose cascade to view"
          className="min-w-0 max-w-[180px] cursor-pointer truncate rounded-lg border bg-transparent px-2 py-1.5 text-[12.5px] font-bold text-ink-strong outline-none transition-colors hover:border-transparent focus-visible:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--module-accent)_45%,transparent)]"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          {!shell.roster.some((r) => r.id === shell.viewedEmployeeId) && (
            <option value={shell.viewedEmployeeId}>{shell.viewedName}</option>
          )}
          {shell.roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="truncate text-[12.5px] font-bold text-ink-strong">{shell.viewedName}</span>
      )}
      {!shell.canWrite && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--color-ink-muted)", background: "var(--color-surface-soft)" }}
          title={`You're viewing ${shell.viewedName}'s cascade in read-only capacity — edits belong to the owner (and their managers).`}
        >
          <Eye size={11} strokeWidth={2.6} /> view-only
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* `?` shortcut overlay — the ONE home for every canvas binding (§2.8)  */
/* ------------------------------------------------------------------ */

/** The canvas's bindings, rendered ABOVE the app-wide groups. Living here —
 *  inside the flag-gated canvas tree — keeps the global sheet (lib/shortcuts)
 *  untouched while GOALS_CANVAS_ON is off. */
const GOALS_SHORTCUTS: ShortcutGroup = {
  title: "Goals canvas",
  rows: [
    { keys: ["⌘", "."], description: "Toggle List / Board" },
    { keys: ["⌘", "↑"], description: "Zoom out a level" },
    { keys: ["↑", "↓"], description: "Select a card or week" },
    { keys: ["Enter"], description: "Drill into the selection" },
    { keys: ["Esc"], description: "Drill out · cancel an edit" },
    { keys: ["←", "→"], description: "Walk the level/period tabs and filter pills" },
    { keys: ["Space"], description: "Hold to pan the board" },
  ],
};

/**
 * §2.8 — replaces the per-section inline hint labels ("↑↓ select · Enter drill
 * in · Esc out" etc.) with ONE `?` overlay: the Goals group first, then the
 * app-wide groups so nothing the global sheet teaches is lost. The keydown
 * listener runs in the CAPTURE phase and stops propagation so the app-wide
 * sheet (document-level, keyboard-shortcuts.tsx) doesn't double-open.
 */
function GoalsShortcutsOverlay(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" && !(e.key === "/" && e.shiftKey)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[12.5px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
        style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
      >
        ?
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          {/* Portaled to body — no ancestor-transform exposure (Radix law). */}
          <Dialog.Overlay
            className="fixed inset-0 z-[90]"
            style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[95] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-section border border-hairline bg-surface-card shadow-xl"
            style={{ maxHeight: "calc(100vh - 64px)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-5">
              <Dialog.Title className="text-display-2xs text-ink-strong">
                Keyboard Shortcuts
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-hairline text-ink-muted transition-colors hover:bg-surface-soft"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
            <div
              className="grid gap-6 overflow-y-auto px-6 py-5"
              style={{ maxHeight: "calc(100vh - 180px)" }}
            >
              {[GOALS_SHORTCUTS, ...SHORTCUT_GROUPS].map((g) => (
                <div key={g.title}>
                  <h3
                    className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.08em]"
                    style={g.title === GOALS_SHORTCUTS.title ? { color: ACCENT_DEEP } : { color: "var(--color-ink-subtle)" }}
                  >
                    {g.title}
                  </h3>
                  <div className="grid gap-1.5">
                    {g.rows.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <span className="text-[14px] font-medium text-ink-strong">{s.description}</span>
                        <span className="inline-flex shrink-0 gap-1.5">
                          {s.keys.map((k, ki) => (
                            <Kbd key={ki}>{k}</Kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Spine                                                               */
/* ------------------------------------------------------------------ */

export function ZoomSpine(): React.JSX.Element {
  const shell = useCanvasShell();
  const stage = useCanvasStage();
  const { zoom } = shell;

  /* window-level keyboard: ⌘. repr · ⌘↑ zoom out (field-safe) */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === ".") {
        e.preventDefault();
        zoom.setRepr(zoom.repr === "list" ? "board" : "list");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        stage.drillOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, stage]);

  return (
    <header
      className="sticky top-0 z-20 -mx-1 flex flex-col gap-2.5 rounded-section border px-4 py-2.5"
      style={{
        borderColor: "var(--color-hairline)",
        background: "color-mix(in srgb, var(--color-surface-card) 88%, transparent)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 24px -20px rgba(15,23,42,0.35)",
      }}
    >
      {/* Row 1 — level selector (or heading, on level pages) · person + toggles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {shell.hideLevelNav ? <LevelLabel /> : <LevelSelector />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PersonSwitcher />
          <Segmented<CanvasRepr>
            ariaLabel="List or board representation"
            value={zoom.repr}
            onChange={zoom.setRepr}
            options={[
              { value: "list", label: "List", icon: <Rows3 size={13} strokeWidth={2.6} />, hint: "List (⌘.)" },
              { value: "board", label: "Board", icon: <KanbanSquare size={13} strokeWidth={2.6} />, hint: "Kanban — drag cards between periods (⌘.)" },
            ]}
          />
          {/* §2.8 — the ONE keyboard-help affordance (the inline hints are gone). */}
          <GoalsShortcutsOverlay />
        </div>
      </div>

      {/* Row 2 — parent picker (only at Months / Weeks) */}
      <ParentPicker />
    </header>
  );
}
