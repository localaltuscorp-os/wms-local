"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}
export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

/**
 * A compact multi-select dropdown: a button that opens a scrollable list of
 * checkboxes, with optional groups (used by the module filter to show
 * "Module → Page" hierarchy). Closes on outside click. Selection is applied
 * through the parent via `onChange` immediately — the dropdown only displays
 * the state.
 */
export function MultiSelect({
  label,
  value,
  onChange,
  options,
  groups,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const all: SelectOption[] = groups
    ? groups.flatMap((g) => g.options)
    : (options ?? []);

  const selectedCount = value.filter((v) => all.some((o) => o.value === v)).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] font-bold text-ink-strong"
      >
        <span className="truncate">
          {label}
          {selectedCount > 0 && (
            <span className="ml-1 text-ink-muted">({selectedCount})</span>
          )}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-64 overflow-auto rounded-xl border border-hairline-strong bg-surface-card p-1 shadow-lg">
          {placeholder && !groups && (
            <p className="px-2 py-1 text-[11px] text-ink-subtle">{placeholder}</p>
          )}
          {groups
            ? groups.map((g) => (
                <div key={g.label} className="py-1">
                  <p className="px-2 pb-1 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">
                    {g.label}
                  </p>
                  {g.options.map((o) => (
                    <CheckboxRow
                      key={o.value}
                      option={o}
                      checked={value.includes(o.value)}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              ))
            : all.map((o) => (
                <CheckboxRow
                  key={o.value}
                  option={o}
                  checked={value.includes(o.value)}
                  onToggle={toggle}
                />
              ))}
        </div>
      )}
    </div>
  );
}

function CheckboxRow({
  option,
  checked,
  onToggle,
}: {
  option: SelectOption;
  checked: boolean;
  onToggle: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(option.value)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink-strong hover:bg-surface-soft"
    >
      <span className="truncate">{option.label}</span>
      {checked && <Check size={14} className="shrink-0 text-altus-red" />}
    </button>
  );
}
