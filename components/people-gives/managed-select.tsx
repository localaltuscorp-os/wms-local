"use client";

import * as React from "react";
import { Check, Plus, X, ChevronDown, Search, Trash2, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import { addLookupOption, softDeleteLookupOption } from "@/app/(app)/people-gives/actions";
import type { PgLookupKind } from "@/lib/validators/people-gives";
import type { PgLookupOption } from "@/lib/queries/people-gives";

interface Props {
  kind: PgLookupKind;
  /** Singular noun for the search placeholder + "Add new …" row. */
  label: string;
  /** Selected option id, or null. */
  value: string | null;
  onChange: (id: string | null) => void;
  options: PgLookupOption[];
  id?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Premium managed single-select for People Gives. Searchable (type-ahead),
 * keyboard-navigable (↑/↓ + Enter, Tab confirms), with the dropdown's options
 * fully managed inline: "+ Add new" mints an option on the fly (de-duplicated
 * server-side) and a trash control SOFT-deletes one (it disappears for new
 * entries but stays on existing records). Portalled Radix Popover so it floats
 * cleanly above the form. Mirrors the WMS ClientSelect look exactly.
 */
export function ManagedSelect({
  kind,
  label,
  value,
  onChange,
  options: seed,
  id,
  className,
  placeholder,
}: Props) {
  const [options, setOptions] = React.useState<PgLookupOption[]>(seed);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);

  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const addInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  React.useEffect(() => setOptions(seed), [seed]);
  React.useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);
  React.useEffect(() => {
    if (open) {
      setHi(0);
      setQuery("");
    }
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const selectedName = options.find((o) => o.id === value)?.name ?? "";

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...options].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    return q ? sorted.filter((o) => o.name.toLowerCase().includes(q)) : sorted;
  }, [options, query]);

  React.useEffect(() => {
    setHi((h) => Math.min(h, filtered.length));
  }, [filtered.length]);

  function choose(opt: PgLookupOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery("");
  }
  function clearSelection() {
    onChange(null);
    setOpen(false);
  }

  function startAdd() {
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
      setError(`Enter a ${label}.`);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await addLookupOption(kind, name);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOptions((prev) =>
      prev.some((o) => o.id === res.option.id) ? prev : [...prev, res.option],
    );
    onChange(res.option.id);
    setAdding(false);
    setDraft("");
  }

  async function removeOption(opt: PgLookupOption, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (deletingId) return;
    setDeletingId(opt.id);
    const res = await softDeleteLookupOption(kind, opt.id);
    setDeletingId(null);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setOptions((prev) => prev.filter((o) => o.id !== opt.id));
    if (value === opt.id) onChange(null);
    fireToast({ message: `Removed "${opt.name}".`, type: "info" });
  }

  function searchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi === filtered.length) startAdd();
      else if (filtered[hi]) choose(filtered[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  // ── Inline add mode ──
  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={draft}
            maxLength={120}
            placeholder={`New ${label}`}
            className={className}
            disabled={saving}
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
            aria-label={`Save new ${label}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
            style={{ width: 44, height: 44 }}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={saving}
            aria-label="Cancel"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
            style={{ width: 44, height: 44 }}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error && (
          <p className="text-[13px]" style={{ color: "var(--color-altus-red-deep)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Combobox ──
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          // Open via the native click (Radix toggles) or keyboard (↓/↑). Do NOT
          // open on focus — focus-open fights the click's toggle (mousedown
          // focuses → opens, then click toggles closed), which made a click
          // open-and-instantly-collapse the menu. Radix autofocuses the search
          // input on open; onCloseAutoFocus is prevented below so no reopen loop.
          onKeyDown={(e) => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className={(className ? className + " " : "") + "flex items-center justify-between gap-2 text-left cursor-pointer"}
        >
          <span
            style={{
              color: selectedName ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
              fontWeight: selectedName ? 600 : 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedName || placeholder || `Select ${label}…`}
          </span>
          <ChevronDown
            size={17}
            strokeWidth={2.4}
            className="shrink-0 transition-transform"
            style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[15rem] overflow-hidden"
      >
        <div className="p-2.5" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3"
            style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
          >
            <Search size={16} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
            <input
              autoFocus
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open ? (hi === filtered.length ? `${listId}-add` : `${listId}-opt-${hi}`) : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHi(0);
              }}
              onKeyDown={searchKeyDown}
              placeholder={`Search ${label}…`}
              className="w-full bg-transparent outline-none py-2.5"
              style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)" }}
            />
          </div>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="max-h-[300px] overflow-y-auto py-1.5">
          {value && (
            <li
              onClick={clearSelection}
              className="mx-1.5 px-3 py-2 rounded-lg cursor-pointer text-[13.5px] font-semibold"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              Clear Selection
            </li>
          )}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
              No match for “{query}”.
            </li>
          )}
          {filtered.map((opt, i) => {
            const isSel = opt.id === value;
            const isHi = i === hi;
            const isDeleting = deletingId === opt.id;
            return (
              <li
                key={opt.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(opt)}
                className="group flex items-center justify-between gap-2 mx-1.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{ background: isHi ? "var(--color-surface-soft)" : "transparent" }}
              >
                <span className="font-semibold truncate" style={{ fontSize: 15, color: "var(--color-ink-strong)" }}>
                  {opt.name}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {isSel && <Check size={16} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />}
                  <button
                    type="button"
                    onClick={(e) => void removeOption(opt, e)}
                    disabled={isDeleting}
                    aria-label={`Remove ${opt.name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-altus-red transition-opacity disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={2.2} />}
                  </button>
                </span>
              </li>
            );
          })}
          <li
            id={`${listId}-add`}
            role="option"
            aria-selected={hi === filtered.length}
            onMouseEnter={() => setHi(filtered.length)}
            onClick={startAdd}
            className="flex items-center gap-2 mx-1.5 mt-1 px-3 py-2.5 rounded-lg cursor-pointer font-bold transition-colors"
            style={{
              background: hi === filtered.length ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" : "transparent",
              color: "var(--color-altus-red-deep)",
              borderTop: "1px solid var(--color-hairline)",
              fontSize: 15,
            }}
          >
            <Plus size={16} strokeWidth={2.6} />
            Add new {label}…
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
