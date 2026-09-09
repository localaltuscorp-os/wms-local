"use client";

import * as React from "react";
import { Check, Plus, X, ChevronDown, Search } from "lucide-react";
import { quickAddClient } from "@/app/(app)/tasks/actions";
import { focusNextFrom } from "@/lib/focus-next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  /** Currently selected client name (the task title). */
  value: string;
  onChange: (name: string) => void;
  /** Seed list from the server, alphabetical. */
  clients: string[];
  id?: string;
  required?: boolean;
  /** Class applied to the trigger so the control matches each form's field
   *  styling (nt-input vs the edit form's box). */
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  /**
   * May this user create a new client? ADMIN ONLY (Sir).
   *
   * Defaults to FALSE so a caller that forgets to pass it hides the
   * affordance rather than offering an action the server will refuse.
   * The real check lives in quickAddClient — this only removes the row.
   */
  canAdd?: boolean;
}

/**
 * "Client Name" picker — a fully-styled searchable combobox. The dropdown is a
 * portalled Radix Popover so it floats cleanly above the form (no overlap with
 * the fields below, no clipping inside the dialog's scroll). Type to filter,
 * ↑/↓ + Enter to pick, Tab to confirm + move on, and a "+ Add new client…" row
 * that flips the control into an inline add input.
 */
export function ClientSelect({
  value,
  onChange,
  clients,
  id,
  required,
  className,
  placeholder = "Select a client…",
  onFocus,
  onBlur,
  canAdd = false,
}: Props) {
  const [options, setOptions] = React.useState<string[]>(clients);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const addInputRef = React.useRef<HTMLInputElement>(null);

  // Combobox state.
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  React.useEffect(() => setOptions(clients), [clients]);
  React.useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  const sorted = React.useMemo(() => {
    const set = new Set(options);
    // A task being edited may carry a legacy free-text client not in the
    // roster — surface it so the control can show the current value.
    if (value && !set.has(value)) set.add(value);
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [options, value]);

  const filtered = React.useMemo(() => {

    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => c.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  // The highlightable range. The "Add new" row is the one past the last
  // option — but only for an admin, so for everyone else the keyboard must
  // stop at the final real option instead of landing on a row that is not
  // rendered.
  const lastIndex = canAdd ? filtered.length : Math.max(0, filtered.length - 1);

  // Reset the highlight + query each time the menu opens (Radix focuses the
  // search box for us).
  React.useEffect(() => {
    if (open) {
      setHi(0);
      setQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    // Clamp the highlight whenever the highlightable RANGE changes — which is
    // `lastIndex`, not the raw option count: for a non-admin the range stops one
    // short because the "Add new" row is not rendered.
    setHi((h) => Math.min(h, lastIndex));
  }, [lastIndex]);
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  function startAdd() {
    if (!canAdd) return;
    setOpen(false);
    setError(null);
    setDraft(query.trim());
    setAdding(true);
  }
  function cancelAdd() {
    setAdding(false);
    setDraft("");
    setError(null);
  }
  async function saveAdd() {
    const name = draft.trim();
    if (!name) {
      setError("Enter a client name.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await quickAddClient(name);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOptions((prev) =>
      prev.some((c) => c.toLowerCase() === res.name.toLowerCase()) ? prev : [...prev, res.name],
    );
    onChange(res.name);
    setAdding(false);
    setDraft("");
  }

  function searchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, lastIndex)); // include the Add-new row
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (canAdd && hi === filtered.length) startAdd();
      else if (filtered[hi]) choose(filtered[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(lastIndex);
    } else if (e.key === "Tab") {
      // Forward Tab commits the highlighted client, then advances to the next
      // field. Backward Tab (Shift+Tab) must NEVER silent-select — just close
      // and let focus move back naturally.
      if (!e.shiftKey && hi < filtered.length && filtered[hi]) {
        e.preventDefault();
        choose(filtered[hi]);
        requestAnimationFrame(() => focusNextFrom(triggerRef.current, 1));
      } else {
        setOpen(false);
      }
    }
  }

  // ── Inline "add a new client" mode ────────────────────────────────────────
  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={draft}
            maxLength={120}
            placeholder="New client name"
            className={className}
            disabled={saving}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveAdd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelAdd();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void saveAdd()}
            disabled={saving}
            aria-label="Save new client"
            // 38px square = the height of the input it sits beside. At 46px the
            // row was taller than the field and the input floated inside it.
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-strong transition-colors hover:bg-surface-muted disabled:opacity-50"
            style={{ width: 38, height: 38 }}
          >
            <Check size={16} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={saving}
            aria-label="Cancel"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-50"
            style={{ width: 38, height: 38 }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        {error && (
          <p className="text-[13px]" style={{ color: "rgb(168, 4, 0)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Combobox ──────────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          // Typing IS the primary action here: Tab onto the trigger should land
          // the user ready to type. Open on focus so Radix moves focus into the
          // search input; closing no longer restores focus to the trigger
          // (onCloseAutoFocus prevented below), so this can't reopen-loop.
          // Open via the native click (Radix toggles the Popover) or keyboard
          // (Down / Enter / Space). Do NOT open on focus — focus-open fights the
          // click's toggle (mousedown focuses → opens, then click toggles closed),
          // which made a mouse click open-and-instantly-collapse the menu.
          onFocus={onFocus}
          onKeyDown={(e) => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          onBlur={onBlur}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className={(className ? className + " " : "") + "flex items-center justify-between gap-2 text-left cursor-pointer"}
        >
          <span
            style={{
              color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
              fontWeight: value ? 600 : 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value || placeholder}
          </span>
          <ChevronDown
            size={17}
            strokeWidth={2.4}
            className="shrink-0 transition-transform"
            style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      </PopoverTrigger>

      {/* Hidden mirror so the browser still enforces `required`. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={() => {}}
          required
          style={{ position: "absolute", opacity: 0, height: 1, width: 1, pointerEvents: "none" }}
        />
      )}

      <PopoverContent
        align="start"
        sideOffset={6}
        // Closing must not bounce focus back to the trigger: with open-on-focus
        // that would reopen the menu in a loop, and it also blocks Tab from
        // advancing after a pick. Radix autofocuses the search input on open.
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[14rem] overflow-hidden"
      >
        <div className="p-2.5" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3"
            style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
          >
            <Search size={16} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHi(0);
              }}
              onKeyDown={searchKeyDown}
              placeholder="Local search — clients" title="Local search — filters only the list on this page" aria-label="Local search — clients — this page only"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open ? `${listId}-opt-${hi}` : undefined}
              className="w-full bg-transparent outline-none py-1.5"
              style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-strong)" }}
            />
          </div>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="max-h-[300px] overflow-y-auto overscroll-contain py-1.5">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
              No match for “{query}”.
            </li>
          )}
          {filtered.map((name, i) => {
            const isSel = name === value;
            const isHi = i === hi;
            return (
              <li
                key={name}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(name)}
                className="flex items-center justify-between gap-3 mx-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                style={{
                  // Active (keyboard/hover) = strong red wash + left accent bar so
                  // it's unmistakable; selected = a persistent lighter red tint so
                  // you can always see the current choice. (Was surface-soft #f8fafc
                  // — near-invisible.)
                  background: isHi
                    ? "color-mix(in srgb, var(--color-altus-red) 14%, transparent)"
                    : isSel
                      ? "color-mix(in srgb, var(--color-altus-red) 7%, transparent)"
                      : "transparent",
                  boxShadow: isHi ? "inset 3px 0 0 0 var(--color-altus-red)" : "none",
                }}
              >
                <span
                  className="truncate"
                  style={{
                    fontSize: 14,
                    fontWeight: isHi || isSel ? 700 : 600,
                    color: isHi || isSel ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)",
                  }}
                >
                  {name}
                </span>
                {isSel && <Check size={17} strokeWidth={2.6} style={{ color: "var(--color-altus-red-deep)" }} />}
              </li>
            );
          })}
          {/* ADMIN ONLY (Sir): creating a client grows a roster every task
              form picks from, so it is not an ordinary employee's action.
              Removed rather than disabled — a greyed row that always
              refuses is worse than no row. quickAddClient enforces it. */}
          {canAdd && (
            <li
              id={`${listId}-opt-${filtered.length}`}
              role="option"
              aria-selected={hi === filtered.length}
              onMouseEnter={() => setHi(filtered.length)}
              onClick={() => startAdd()}
              className="flex items-center gap-2 mx-1.5 mt-1 px-3 py-2 rounded-lg cursor-pointer font-bold transition-colors"
              style={{
                background: hi === filtered.length ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" : "transparent",
                color: "var(--color-altus-red-deep)",
                borderTop: "1px solid var(--color-hairline)",
                fontSize: 14,
              }}
            >
              <Plus size={15} strokeWidth={2.6} />
              Add New Client…
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
