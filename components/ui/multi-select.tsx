"use client";
import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
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
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All Employees",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const labelMap = new Map(options.map((o) => [o.value, o.label]));

  // Tab commits the highlighted option and advances to the next field, instead
  // of just dismissing the menu (cmdk only commits on Enter / click).
  function onCommandKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const active = e.currentTarget.querySelector<HTMLElement>(
      '[cmdk-item][aria-selected="true"]',
    );
    if (!active) return;
    e.preventDefault();
    active.click();
    setOpen(false);
    requestAnimationFrame(() => focusNextFrom(triggerRef.current, e.shiftKey ? -1 : 1));
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
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "inline-flex items-center gap-2 min-w-40 text-chip text-ink-strong bg-transparent outline-none text-left",
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
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              className="text-ink-subtle hover:text-ink-strong cursor-pointer"
              aria-label="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className="text-ink-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <Command onKeyDown={onCommandKeyDown}>
          <CommandInput placeholder="Search…" />
          <CommandList className="max-h-64 overflow-auto">
            <CommandEmpty className="px-2 py-3 text-[15px] text-ink-subtle">
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
                >
                  <span className="flex items-center gap-2 w-full">
                    <span
                      className={cn(
                        "size-4 rounded border border-hairline-strong flex items-center justify-center",
                        checked && "bg-ink-strong border-ink-strong",
                      )}
                    >
                      {checked && <Check size={11} className="text-white" />}
                    </span>
                    <span className="flex-1 text-ink-strong">{opt.label}</span>
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
