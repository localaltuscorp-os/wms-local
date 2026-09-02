"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/db/enums";

/**
 * Shared inline-edit field primitives for the Weekly Goals card board. These are
 * the same controls the legacy spreadsheet board used (type-ahead combo, auto
 * textarea, priority pill, evidence link), extracted so the new cards / quick-add
 * / review panel reuse one implementation. Presentational + client-only.
 */

const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "blue",
  not_imp_not_urgent: "slate",
};

/**
 * Type-ahead text field with a CSS-anchored suggestion dropdown (free text is
 * allowed; suggestions just speed entry). Commits on blur / selection.
 */
export function ComboInput({
  value,
  options,
  disabled,
  placeholder,
  onCommit,
  onChange,
  inputRef,
  className,
}: {
  value: string;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  onCommit?: (v: string) => void;
  onChange?: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const [v, setV] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const listId = React.useId();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const localRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  React.useEffect(() => setV(value), [value]);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = v.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, v]);

  function set(next: string) {
    setV(next);
    onChange?.(next);
  }
  function commit(next: string) {
    const t = next.trim();
    if (t !== value) onCommit?.(t);
  }
  function choose(opt: string) {
    set(opt);
    setOpen(false);
    if (opt !== value) onCommit?.(opt);
    ref.current?.focus();
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={ref}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && filtered[hi] ? `${listId}-opt-${hi}` : undefined}
        value={v}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          set(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Tab / focus-out must close the suggestion list AND commit — otherwise
          // the dropdown lingers over the next field (keyboard-flow bug). Option
          // clicks use onMouseDown+preventDefault, so they fire before this blur.
          commit(v);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Home") {
            e.preventDefault();
            setHi(0);
          } else if (e.key === "End") {
            e.preventDefault();
            setHi(filtered.length - 1);
          } else if (e.key === "Enter") {
            if (open && filtered[hi]) {
              e.preventDefault();
              choose(filtered[hi]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={
          className ??
          "w-full rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[15px] font-semibold text-ink-strong outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
        }
      />
      {open && !disabled && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-surface-card py-1"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px -12px rgba(15,23,42,0.28)",
            minWidth: 160,
          }}
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(opt)}
              className="cursor-pointer truncate px-3 py-1.5 text-[14px] font-semibold text-ink-strong"
              style={{ background: i === hi ? "var(--color-surface-soft)" : "transparent" }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Auto-committing multi-line text field (commits the trimmed value on blur). */
export function AutoTextarea({
  value,
  disabled,
  placeholder,
  rows = 2,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <textarea
      value={v}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      className="w-full resize-y rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[15px] font-medium text-ink-strong outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
    />
  );
}

/** Evidence-link field + an open-in-new-tab affordance. */
export function LinkField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="url"
        value={v}
        disabled={disabled}
        placeholder="https://link to proof"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v.trim())}
        className="w-full rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-medium text-blue-700 outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
      />
      {value && (
        <a href={value} target="_blank" rel="noreferrer" aria-label="Open link">
          <ExternalLink size={15} className="text-blue-600 shrink-0" />
        </a>
      )}
    </div>
  );
}

/** Priority pill <select> — tone-coloured per priority. */
export function PriorityPicker({
  value,
  disabled,
  onChange,
}: {
  value: TaskPriority;
  disabled?: boolean;
  onChange: (p: TaskPriority) => void;
}) {
  const tone = PRIORITY_TONE[value];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TaskPriority)}
      className="rounded-full px-3 py-1 text-[13px] font-bold outline-none disabled:appearance-none disabled:opacity-90"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 40%, transparent)`,
      }}
    >
      {TASK_PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABELS[p]}
        </option>
      ))}
    </select>
  );
}

/** A Yes/No pill toggle (incentive / KPI). */
export function YesNo({
  value,
  disabled,
  yesLabel = "Yes",
  noLabel = "No",
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  yesLabel?: string;
  noLabel?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="rounded-full px-3 py-1 text-[13px] font-black transition-colors disabled:opacity-60"
      style={{
        background: value
          ? "color-mix(in srgb, var(--color-green) 16%, transparent)"
          : "color-mix(in srgb, var(--color-slate) 12%, transparent)",
        color: value ? "var(--color-green-deep)" : "var(--color-ink-muted)",
      }}
    >
      {value ? yesLabel : noLabel}
    </button>
  );
}

/** Tone for a 0–100 percentage (matches the legacy board). */
export function pctTone(value: number): string {
  return value >= 100 ? "green" : value >= 50 ? "amber" : value > 0 ? "orange" : "slate";
}

export { PRIORITY_TONE };
