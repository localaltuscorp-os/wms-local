"use client";
import * as React from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { cn } from "@/lib/utils";
import { focusNextFrom } from "@/lib/focus-next";

interface MultiSelectProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Optional custom trigger (e.g. a FilterPill). Receives the resolved labels
   *  of the current selection + the open state. When set, replaces the default
   *  inline button trigger entirely. Must forward props/ref (Radix asChild). */
  renderTrigger?: (state: { selectedLabels: string[]; open: boolean }) => React.ReactElement;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All Employees",
  className,
  renderTrigger,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const labelMap = new Map(options.map((o) => [o.value, o.label]));

  // WHY the popover closed decides whether focus should come back.
  //
  // `onCloseAutoFocus` is prevented below for two real reasons: a trigger that
  // opens on focus would reopen in a loop, and after a Tab-commit the browser
  // must be free to move focus ON to the next field. But that also swallowed
  // the Escape case, where returning to the trigger is the whole point —
  // pressing Escape used to drop focus onto <body>, so the next Tab restarted
  // from the top of the page.
  //
  // The flag distinguishes them: Escape sets it, and only then is the default
  // restore allowed through.
  const closedByEscape = React.useRef(false);

  // cmdk auto-highlights the first item on every query change, so Tab must only
  // commit when the user has deliberately arrow-navigated — otherwise Tabbing
  // out silently commits the first filtered option. Reset whenever the popover
  // (re)opens; set on ArrowUp/ArrowDown inside the Command.
  const userNavigated = React.useRef(false);
  React.useEffect(() => {
    if (open) userNavigated.current = false;
  }, [open]);

  // Tab commits the highlighted option and advances to the next field, instead
  // of just dismissing the menu (cmdk only commits on Enter / click).
  function onCommandKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      userNavigated.current = true;
      return;
    }
    if (e.key === "Escape") {
      // Let Radix restore focus to the trigger on THIS close only.
      closedByEscape.current = true;
      return;
    }
    if (e.key === " ") {
      // Space toggles the highlighted option — but ONLY with an empty query.
      // With text typed it has to stay a literal space, or multi-word searches
      // ("Business Development", "Not Approved") become untypeable. That is the
      // standard trade for a combobox whose filter box and list share focus.
      const input = e.currentTarget.querySelector<HTMLInputElement>("[cmdk-input]");
      if (input && input.value.length > 0) return;
      const active = e.currentTarget.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]',
      );
      if (active) {
        e.preventDefault();
        active.click();
      }
      return;
    }
    // Typing changes the query → cmdk re-auto-highlights, so navigation intent
    // is no longer current. Reset (but don't treat Tab/Enter as typing).
    if (e.key !== "Tab" && e.key !== "Enter") {
      if (e.key === "Backspace" || e.key === "Delete" || e.key.length === 1) {
        userNavigated.current = false;
      }
      return;
    }
    if (e.key !== "Tab") return;
    if (userNavigated.current) {
      const active = e.currentTarget.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]',
      );
      if (active) {
        e.preventDefault();
        active.click();
        setOpen(false);
        requestAnimationFrame(() => focusNextFrom(triggerRef.current, e.shiftKey ? -1 : 1));
        return;
      }
    }
    setOpen(false);
  }

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {renderTrigger ? (
        // Custom trigger (e.g. FilterPill) — a single forwardRef element.
        <PopoverTrigger asChild>
          {renderTrigger({
            selectedLabels: selected.map((v) => labelMap.get(v) ?? v),
            open,
          })}
        </PopoverTrigger>
      ) : (
        // Default trigger: the positioning wrapper is a PLAIN div (NOT the Radix
        // trigger). PopoverTrigger asChild wraps ONLY the single <button>, and
        // the Clear (X) is a SIBLING button — so we never nest an interactive
        // element inside the trigger button or hand Radix a non-button trigger.
        <div className="relative inline-flex">
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              className={cn(
                "inline-flex items-center gap-2 min-w-40 text-chip text-ink-strong bg-transparent outline-none text-left",
                selected.length > 0 && "pr-6",
                className,
              )}
            >
              <span className="flex-1 truncate">
                {selected.length === 0
                  ? placeholder
                  : selected.length === 1
                    ? labelMap.get(selected[0]!) ?? "1 selected"
                    : `${selected.length} selected`}
              </span>
              <ChevronDown size={14} className="text-ink-subtle" />
            </button>
          </PopoverTrigger>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-strong cursor-pointer outline-none"
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <PopoverContent
        // Don't restore focus to the trigger on close — it fights the browser's
        // Tab so focus can't advance after committing a selection.
        onCloseAutoFocus={(e) => {
          if (closedByEscape.current) {
            // Escape: let the default run so focus lands back on the trigger.
            closedByEscape.current = false;
            return;
          }
          e.preventDefault();
        }}
        className="w-[286px] p-0 rounded-2xl border border-hairline overflow-hidden bg-surface-card data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1"
        style={{ boxShadow: "0 24px 60px -18px rgba(15,23,42,0.30), 0 2px 8px -2px rgba(15,23,42,0.10)" }}
      >
        <Command onKeyDown={onCommandKeyDown}>
          {/* Search row with leading icon */}
          <div className="flex items-center gap-2 px-3 border-b border-hairline">
            <Search size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
            <CommandInput placeholder="Search…" className="h-11 flex-1 border-0 px-0" />
          </div>

          {/* Selected count + clear */}
          {selected.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-hairline bg-black/[0.02]">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                {selected.length} selected
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[12px] font-bold text-altus-red hover:underline"
              >
                Clear
              </button>
            </div>
          )}

          <CommandList className="max-h-72 overflow-auto p-1.5">
            <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
              No results.
            </CommandEmpty>
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <CommandItem
                  key={opt.value}
                  // cmdk fuzzy-matches on `value`, so search the LABEL (the name
                  // the user reads), not the opaque id. The id keeps it unique.
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => toggle(opt.value)}
                  className="rounded-xl px-2.5 py-2.5 gap-2.5 transition-colors aria-selected:bg-black/[0.04]"
                  style={checked ? { backgroundColor: "rgba(225,6,0,0.11)" } : undefined}
                >
                  <span className="flex items-center gap-2.5 w-full">
                    <span
                      className={cn(
                        "size-[18px] rounded-md flex items-center justify-center transition-all duration-150 shrink-0",
                        checked
                          ? "border-0 shadow-sm"
                          : "border-2 border-hairline-strong",
                      )}
                      style={
                        checked
                          ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }
                          : undefined
                      }
                    >
                      {checked && <Check size={12} strokeWidth={3.2} className="text-white" />}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[14.5px] truncate",
                        checked ? "font-bold text-altus-red-deep" : "text-ink-soft",
                      )}
                    >
                      {opt.label}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
