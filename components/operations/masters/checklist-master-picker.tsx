"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { ChecklistTemplateRow } from "@/lib/operations/checklist";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createChecklistTemplate } from "@/app/(app)/operations/checklist/actions";

const BASE = "/operations/masters/checklist";

/**
 * WHICH MASTER — a dropdown beside the page heading (account holder,
 * 2026-09-18), in place of the list that took a third of the page on the
 * left. The open master's rows get the full width; the list is one click away,
 * with its search and New master.
 */
export function ChecklistMasterPicker({
  templates,
  selectedId,
  canEdit,
}: {
  templates: ChecklistTemplateRow[];
  selectedId: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const q = query.trim().toLowerCase();
  const shown = q
    ? templates.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
    : templates;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={selected ? `Master: ${selected.name} — change` : "Pick a master"}
            className="inline-flex h-10 max-w-[min(460px,100%)] items-center gap-2 rounded-xl border border-slate-300 bg-white pl-3 pr-2.5 text-left shadow-sm transition-colors hover:bg-slate-50 data-[state=open]:border-slate-400 data-[state=open]:bg-slate-50"
          >
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Master</span>
            <span className="min-w-0 truncate text-[14px] font-bold text-slate-900">{selected?.name ?? "Pick one"}</span>
            {selected && <TypeBadge isEvent={selected.isEvent} />}
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[11px] font-bold tabular-nums text-slate-500" title={`${templates.length} masters`}>
              {templates.length}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-[380px] max-w-[calc(100vw-24px)] flex-col gap-2 p-2">
          {templates.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search masters"
                aria-label="Search masters"
                className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-[13px] outline-none focus:border-slate-400"
              />
            </div>
          )}

          <ul className="flex max-h-[min(56vh,420px)] flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Checklist masters">
            {shown.map((t) => {
              const active = t.id === selected?.id;
              return (
                <li key={t.id} role="option" aria-selected={active}>
                  <Link
                    href={`${BASE}?t=${t.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                      active ? "bg-red-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-slate-900">{t.name}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
                        <TypeBadge isEvent={t.isEvent} />
                        {t.itemCount} row{t.itemCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-red-700" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          {templates.length === 0 && (
            <p className="px-2 py-3 text-[12.5px] text-slate-500">
              No master checklists yet.{canEdit ? "" : " An admin creates these."}
            </p>
          )}
          {templates.length > 0 && shown.length === 0 && (
            <p className="px-2 py-3 text-[12.5px] text-slate-500">Nothing matches “{query}”.</p>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: "#B91C1C" }}
            >
              <Plus className="h-4 w-4" /> New master
            </button>
          )}
        </PopoverContent>
      </Popover>

      {canEdit && <NewMasterDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}

/** Creating a master — a pop-up: its name and whether it is tied to an event. */
export function NewMasterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [isEvent, setIsEvent] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await createChecklistTemplate({ name, isEvent });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Master created.", type: "success" });
      setName("");
      onOpenChange(false);
      router.push(`${BASE}?t=${res.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60]" style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }} />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-section bg-surface-card shadow-xl">
          <form onSubmit={(e) => void submit(e)}>
            <div
              className="relative px-7 py-5"
              style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
            >
              <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
              <Dialog.Title className="pr-12 text-[24px] font-black tracking-tight text-ink-strong">New master</Dialog.Title>
              <Dialog.Description className="mt-1 text-[14px] font-semibold text-ink-muted">
                A reusable checklist — build it once, and every new checklist copies its rows.
              </Dialog.Description>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute right-5 top-4 inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted hover:bg-surface-soft"
                >
                  <X size={20} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex flex-col gap-4 px-7 py-5">
              <label className="flex flex-col gap-1">
                <span className="text-[14px] font-bold text-ink-strong">
                  Name <span style={{ color: "rgb(168, 4, 0)" }}>*</span>
                </span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Annual Day — standard plan"
                  maxLength={200}
                  className="nt-input"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-bold text-ink-strong">Type</span>
                <TypeToggle isEvent={isEvent} onChange={setIsEvent} />
                <span className="text-[12px] font-medium text-ink-subtle">
                  {isEvent
                    ? "Rows fall on a day counted from the event — -3, 0, +1."
                    : "A standing list — each checklist built from it sets its own dates."}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-7 py-4">
              <Dialog.Close asChild>
                <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} strokeWidth={2.6} />}
                Create master
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TypeBadge({ isEvent }: { isEvent: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
        isEvent ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isEvent ? "Event-linked" : "Standing"}
    </span>
  );
}

export function TypeToggle({
  isEvent,
  onChange,
  disabled = false,
}: {
  isEvent: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const option = (v: boolean, label: string, hint: string) => (
    <button
      type="button"
      title={hint}
      disabled={disabled}
      aria-pressed={isEvent === v}
      onClick={() => onChange(v)}
      className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        isEvent === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex w-fit rounded-lg bg-slate-100 p-0.5">
      {option(true, "Event-linked", "Rows fall on a day counted from the event")}
      {option(false, "Standing", "A standing list — each checklist sets its own dates")}
    </div>
  );
}
