"use client";

import * as React from "react";
import { Check, Plus, X, ChevronDown, Search, Trash2, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";

export interface LookupOption {
  id: string;
  name: string;
}

type AddResult = { ok: true; option: LookupOption } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

interface Props {
  /** Singular noun for the search placeholder + "Add new …" row. */
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  options: LookupOption[];
  /** Optional inline-add. Omit to hide the "+ Add" row. */
  onAdd?: (name: string) => Promise<AddResult>;
  /** Optional soft-delete. Omit to hide the per-row trash control. */
  onDelete?: (id: string) => Promise<DeleteResult>;
  /**
   * Optional confirmation gate run BEFORE `onDelete`. Resolve `true` to proceed,
   * `false` to silently abort (no toast). Lets a caller show a warning dialog for
   * destructive deletes (e.g. wiping a candidate's whole record).
   */
  confirmDelete?: (opt: LookupOption) => Promise<boolean>;
  className?: string;
  placeholder?: string;
}

/**
 * Generic premium managed single-select — searchable, keyboard-navigable, with
 * optional inline "+ Add" and per-row soft-delete wired via callbacks. The same
 * polished combobox the People Gives module uses, made module-agnostic.
 */
export function LookupSelect({
  label,
  value,
  onChange,
  options: seed,
  onAdd,
  onDelete,
  confirmDelete,
  className,
  placeholder,
}: Props) {
  const [options, setOptions] = React.useState<LookupOption[]>(seed);
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
    const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return q ? sorted.filter((o) => o.name.toLowerCase().includes(q)) : sorted;
  }, [options, query]);
  const addRowIndex = onAdd ? filtered.length : -1;

  React.useEffect(() => {
    setHi((h) => Math.min(h, onAdd ? filtered.length : Math.max(0, filtered.length - 1)));
  }, [filtered.length, onAdd]);

  function choose(opt: LookupOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery("");
  }

  function startAdd() {
    if (!onAdd) return;
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
    if (!onAdd) return;
    const name = draft.trim();
    if (!name) {
      setError(`Enter a ${label}.`);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await onAdd(name);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOptions((prev) => (prev.some((o) => o.id === res.option.id) ? prev : [...prev, res.option]));
    onChange(res.option.id);
    setAdding(false);
    setDraft("");
  }
  async function removeOption(opt: LookupOption, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!onDelete || deletingId) return;
    if (confirmDelete) {
      const go = await confirmDelete(opt);
      if (!go) return; // user cancelled — abort silently, no toast
    }
    setDeletingId(opt.id);
    const res = await onDelete(opt.id);
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
      setHi((h) => Math.min(h + 1, onAdd ? filtered.length : filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(onAdd ? filtered.length : Math.max(filtered.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi === addRowIndex) startAdd();
      else if (filtered[hi]) choose(filtered[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

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
          <button type="button" onClick={() => void saveAdd()} disabled={saving} aria-label={`Save new ${label}`} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-strong hover:bg-surface-soft disabled:opacity-50" style={{ width: 44, height: 44 }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.4} />}
          </button>
          <button type="button" onClick={cancelAdd} disabled={saving} aria-label="Cancel" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted hover:bg-surface-soft disabled:opacity-50" style={{ width: 44, height: 44 }}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error && <p className="text-[13px]" style={{ color: "var(--color-altus-red-deep)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button ref={triggerRef} type="button" onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); } }} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} className={(className ? className + " " : "") + "flex items-center justify-between gap-2 text-left cursor-pointer"}>
          <span style={{ color: selectedName ? "var(--color-ink-strong)" : "var(--color-ink-subtle)", fontWeight: selectedName ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedName || placeholder || `Select ${label}…`}
          </span>
          <ChevronDown size={17} strokeWidth={2.4} className="shrink-0 transition-transform" style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} onCloseAutoFocus={(e) => e.preventDefault()} className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[15rem] overflow-hidden">
        <div className="p-2.5" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
          <div className="flex items-center gap-2 rounded-lg px-3" style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
            <Search size={16} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
            <input autoFocus role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open ? (hi === addRowIndex ? `${listId}-add` : `${listId}-opt-${hi}`) : undefined} value={query} onChange={(e) => { setQuery(e.target.value); setHi(0); }} onKeyDown={searchKeyDown} placeholder={`Search ${label}…`} className="w-full bg-transparent outline-none py-2.5" style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)" }} />
          </div>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="max-h-[300px] overflow-y-auto py-1.5">
          {value && (
            <li onClick={() => { onChange(null); setOpen(false); }} className="mx-1.5 px-3 py-2 rounded-lg cursor-pointer text-[13.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
              Clear Selection
            </li>
          )}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>No match for “{query}”.</li>
          )}
          {filtered.map((opt, i) => {
            const isSel = opt.id === value;
            const isHi = i === hi;
            const isDeleting = deletingId === opt.id;
            return (
              <li key={opt.id} id={`${listId}-opt-${i}`} role="option" aria-selected={isSel} onMouseEnter={() => setHi(i)} onClick={() => choose(opt)} className="group flex items-center justify-between gap-2 mx-1.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors" style={{ background: isHi ? "color-mix(in srgb, var(--color-altus-red) 14%, transparent)" : isSel ? "color-mix(in srgb, var(--color-altus-red) 7%, transparent)" : "transparent", boxShadow: isHi ? "inset 3px 0 0 0 var(--color-altus-red)" : "none" }}>
                <span className="truncate" style={{ fontSize: 15, fontWeight: isHi || isSel ? 700 : 600, color: isHi || isSel ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}>{opt.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {isSel && <Check size={16} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />}
                  {onDelete && (
                    <button type="button" onClick={(e) => void removeOption(opt, e)} disabled={isDeleting} aria-label={`Remove ${opt.name}`} className="inline-flex size-7 items-center justify-center rounded-md text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-altus-red transition-opacity disabled:opacity-50">
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={2.2} />}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {onAdd && (
            <li id={`${listId}-add`} role="option" aria-selected={hi === addRowIndex} onMouseEnter={() => setHi(addRowIndex)} onClick={startAdd} className="flex items-center gap-2 mx-1.5 mt-1 px-3 py-2.5 rounded-lg cursor-pointer font-bold transition-colors" style={{ background: hi === addRowIndex ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" : "transparent", color: "var(--color-altus-red-deep)", borderTop: "1px solid var(--color-hairline)", fontSize: 15 }}>
              <Plus size={16} strokeWidth={2.6} />
              Add new {label}…
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
