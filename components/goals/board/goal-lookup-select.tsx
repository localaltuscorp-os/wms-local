"use client";

import * as React from "react";
import { Plus, Check, X, Loader2, ChevronDown, Trash2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addGoalLookup, removeGoalLookup } from "@/app/(app)/goals/cascade/actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { focusNextFrom } from "@/lib/focus-next";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * A managed dropdown for the goal composer/table's Area · Measure · Type fields.
 * Lists base + admin-added options; ADMINS can inline-add a new option (persists
 * via addGoalLookup) AND delete an admin-added one (removeGoalLookup) — base
 * options are never deletable. mig 0148.
 */
export function GoalLookupSelect({
  kind,
  noun,
  value,
  onChange,
  options,
  custom,
  isAdmin,
  placeholder,
  className,
  compact,
}: {
  kind: "area" | "measure" | "type" | "goaltype";
  noun: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** The admin-added (deletable) values for this kind. */
  custom: string[];
  isAdmin: boolean;
  placeholder?: string;
  className?: string;
  /** Tighter trigger for dense table cells. */
  compact?: boolean;
}) {
  // A lookup field can legitimately be empty (a blank/new row has no Area/Measure
  // yet), so `value` may arrive null/undefined despite the string type. Normalise
  // once — an unguarded `value.toLowerCase()` here was crashing the whole Weekly
  // board render (a null table-cell value) → the "That didn't go through" page.
  const safeValue = value ?? "";
  const [opts, setOpts] = React.useState<string[]>(options);
  const [deletable, setDeletable] = React.useState<string[]>(custom);
  React.useEffect(() => setOpts(options), [options]);
  React.useEffect(() => setDeletable(custom), [custom]);

  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const deletableSet = React.useMemo(() => new Set(deletable.map((d) => d.toLowerCase())), [deletable]);

  // Spreadsheet-grade keyboard: a search input ALWAYS holds focus while the panel
  // is open (visible once the list is long, else visually-hidden but still
  // typable), and the FIRST filtered option is auto-highlighted. ↑/↓ + Home/End
  // move the highlight; Enter OR Tab commit it (Tab then advances to the next
  // cell); Esc closes. `active` is the highlighted index into `filtered`.
  const [active, setActive] = React.useState(0);

  // Search box shows once the list gets long enough to warrant it, OR the moment
  // the user has typed anything (so a type-to-open seed is visible) — the input
  // stays mounted either way so type-ahead + arrow nav work on short lists too.
  const showSearch = opts.length > 8 || query.trim().length > 0;
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts;
  }, [opts, query]);

  React.useEffect(() => {
    if (adding) requestAnimationFrame(() => inputRef.current?.focus());
  }, [adding]);

  // Reset query + highlight and focus the search box each time the panel opens.
  // When the grid opens us via type-to-edit it stamps the typed char on the
  // trigger as `data-grid-seed` — consume it here so the first keystroke isn't
  // dropped (it primes the filter), then clear it so a later mouse-open is blank.
  React.useEffect(() => {
    if (open) {
      const seed = triggerRef.current?.getAttribute("data-grid-seed") ?? "";
      triggerRef.current?.removeAttribute("data-grid-seed");
      setQuery(seed);
      // Start the highlight on the currently-selected option (not always the
      // first) so nothing looks "stuck" highlighted when the panel opens.
      const sel = seed ? 0 : Math.max(0, opts.findIndex((o) => o.toLowerCase() === safeValue.toLowerCase()));
      setActive(sel);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Keep the highlight in range as the filter narrows, and scroll it into view.
  React.useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-opt="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  /** Commit the option at index `i` (if any) and close. */
  function commitAt(i: number): boolean {
    const o = filtered[i];
    if (o == null) return false;
    onChange(o);
    setOpen(false);
    return true;
  }

  /** Return focus to the owning spreadsheet cell (so arrow-nav resumes) when we
   *  live inside the Goals grid; fall back to our own trigger in the composer/
   *  drawer, which has no grid cell. */
  function focusOwner() {
    const cell = triggerRef.current?.closest<HTMLElement>('[role="gridcell"]');
    (cell ?? triggerRef.current)?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (commitAt(active)) requestAnimationFrame(focusOwner);
    } else if (e.key === "Tab") {
      // Commit the highlight, then let Tab ADVANCE to the next cell (spreadsheet flow).
      e.preventDefault();
      commitAt(active);
      setOpen(false);
      requestAnimationFrame(() => focusNextFrom(triggerRef.current, e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      requestAnimationFrame(focusOwner);
    }
  }

  async function commitAdd() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    const res = await addGoalLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    applyOptions(res.options);
    const list = pickList(res.options);
    const match = list.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
    onChange(match);
    setDraft("");
    setAdding(false);
    fireToast({ message: `Added ${noun} "${match}"`, type: "success" });
  }

  async function remove(v: string) {
    if (busy) return;
    setBusy(true);
    const res = await removeGoalLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    applyOptions(res.options);
    if (value.toLowerCase() === v.toLowerCase()) onChange("");
    fireToast({ message: `Removed ${noun} "${v}"`, type: "success" });
  }

  function pickList(o: import("@/lib/goals/lookups").GoalLookupOptions): string[] {
    return kind === "area"
      ? o.areas
      : kind === "measure"
        ? o.measures
        : kind === "goaltype"
          ? o.goaltypes
          : o.types;
  }
  function applyOptions(o: import("@/lib/goals/lookups").GoalLookupOptions) {
    setOpts(pickList(o));
    setDeletable(
      kind === "area"
        ? o.custom.areas
        : kind === "measure"
          ? o.custom.measures
          : kind === "goaltype"
            ? o.custom.goaltypes
            : o.custom.types,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "group/gdd flex w-full items-center justify-between text-left text-ink-strong",
            compact
              ? cn(
                  "h-5 gap-0.5 rounded-md px-0.5 text-[11px] font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_7%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,var(--color-altus-red)_9%,transparent)]",
                  FOCUS_RING,
                )
              : "gdd-trigger h-10 gap-1.5 rounded-xl px-3 text-[14px] font-semibold",
            className,
          )}
        >
          <span className={cn("truncate", !safeValue && "font-normal text-ink-subtle")}>
            {safeValue || placeholder || `Choose a ${noun}`}
          </span>
          <ChevronDown
            size={compact ? 11 : 15}
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-200 group-hover/gdd:text-altus-red",
              open && "rotate-180 text-altus-red",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        // Don't let Radix restore focus to the trigger on close — Tab-to-commit
        // manages focus itself (commit → advance to the next cell), and auto-
        // restore would fight the browser's Tab advance.
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="gdd-panel w-[var(--radix-popover-trigger-width)] min-w-[13rem] p-1.5"
      >
        {/* Keyboard: a search box (long lists) or the first option takes focus on
            open; ↑/↓ move between options, Enter selects, Esc closes. z-index comes
            from the PopoverContent primitive (z-[200]) so the panel always sits
            ABOVE the z-120 WeeklyGoalDrawer + the sticky header — do NOT re-set it
            here or the list buries itself behind the drawer (the old "broken" bug). */}
        {/* Search input ALWAYS mounted (visually hidden on short lists) so it can
            hold focus for arrow-nav + type-ahead + Enter/Tab commit everywhere. */}
        <div className={showSearch ? "px-1 pb-1.5" : "sr-only"}>
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/70 px-2.5">
            <Search size={14} className="shrink-0 text-ink-subtle" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKeyDown}
              placeholder={`Search ${noun.toLowerCase()}…`}
              aria-label={`Search ${noun}`}
              className="h-9 w-full bg-transparent text-[13.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
            />
          </div>
        </div>
        <div ref={listRef} className="gdd-scroll max-h-72 overflow-auto" role="listbox">
          {filtered.map((o, i) => {
            const isSel = String(o ?? "").toLowerCase() === safeValue.toLowerCase();
            const isActive = i === active;
            // Admins can delete ANY option: an admin-added one is removed; a
            // built-in one is HIDDEN (server-side), so the value keeps working on
            // existing goals but disappears from the picker. (mig 0148 + hide.)
            const canDelete = isAdmin;
            void deletableSet;
            return (
              <div
                key={o}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  !isSel && !isActive && "hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)]",
                )}
                style={{
                  background: isSel
                    ? "color-mix(in srgb, var(--color-altus-red) 12%, transparent)"
                    : isActive
                      ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)"
                      : undefined,
                }}
              >
                <button
                  type="button"
                  data-opt={i}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md text-left", FOCUS_RING)}
                >
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {isSel && <Check size={15} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("flex-1 truncate text-[14px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {o}
                  </span>
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(o)}
                    disabled={busy}
                    aria-label={`Remove ${noun} "${o}"`}
                    title={`Remove "${o}"`}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-altus-red/10 hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-[13px] text-ink-subtle">
              {opts.length === 0 ? "No options yet." : "No matches."}
            </p>
          )}
        </div>

        {isAdmin && (
          <div className="mt-1.5 border-t border-hairline pt-1.5">
            {adding ? (
              <div className="flex items-center gap-1.5 px-1">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void commitAdd(); }
                    else if (e.key === "Escape") { setAdding(false); setDraft(""); }
                  }}
                  maxLength={60}
                  placeholder={`New ${noun}…`}
                  className={cn("h-9 min-w-0 flex-1 rounded-lg border bg-white px-2.5 text-[13.5px] font-semibold text-ink-strong focus:border-altus-red", FOCUS_RING)}
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                />
                <button
                  type="button"
                  onClick={() => void commitAdd()}
                  disabled={busy || !draft.trim()}
                  aria-label={`Save new ${noun}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setDraft(""); }}
                  aria-label="Cancel"
                  className="grid size-9 shrink-0 place-items-center rounded-lg border bg-white text-ink-subtle hover:text-ink-strong"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-bold text-altus-red transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)]"
              >
                <Plus size={15} strokeWidth={2.8} /> Add {noun}
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
