"use client";

import * as React from "react";
import { Plus, Check, X, Loader2, ChevronDown, Trash2, Wrench, HeartHandshake } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addSkillLookup, removeSkillLookup } from "@/app/(app)/hr/skills-actions";
import type { SkillLookupOptions } from "@/lib/hr/skills";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

export interface SkillSelection {
  technical: string[];
  nonTechnical: string[];
}

type Group = "technical" | "nonTechnical";

/**
 * Multi-select skill picker for the Management Assessment. Two grouped checkbox
 * lists — Technical / Non-Technical — sourced from the Skills Master
 * (listSkillLookups). HR admins can inline +Add a custom option (persists via
 * addSkillLookup) and delete an admin-added one (removeSkillLookup); base options
 * are never deletable. Selected skills render as chips on the trigger. Mirrors the
 * goal-lookup-select pattern.
 */
export function SkillMultiSelect({
  value,
  onChange,
  options,
  isAdmin,
}: {
  value: SkillSelection;
  onChange: (next: SkillSelection) => void;
  options: SkillLookupOptions;
  isAdmin: boolean;
}) {
  const [opts, setOpts] = React.useState<SkillLookupOptions>(options);
  React.useEffect(() => setOpts(options), [options]);
  const [open, setOpen] = React.useState(false);

  const selectedCount = value.technical.length + value.nonTechnical.length;

  function toggle(group: Group, skill: string) {
    const list = value[group];
    const has = list.some((s) => s.toLowerCase() === skill.toLowerCase());
    const next = has ? list.filter((s) => s.toLowerCase() !== skill.toLowerCase()) : [...list, skill];
    onChange({ ...value, [group]: next });
  }

  function removeSelected(group: Group, skill: string) {
    onChange({ ...value, [group]: value[group].filter((s) => s.toLowerCase() !== skill.toLowerCase()) });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border-[1.5px] bg-white px-3 py-2.5 text-left text-ink-strong transition-colors focus:border-altus-red",
            FOCUS_RING,
          )}
          style={{ borderColor: "var(--color-hairline-strong)", minHeight: 46 }}
        >
          {selectedCount === 0 ? (
            <span className="text-[14px] font-normal text-ink-subtle">Choose skills…</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {value.technical.map((s) => (
                <Chip key={`t-${s}`} tone="technical" label={s} onRemove={() => removeSelected("technical", s)} />
              ))}
              {value.nonTechnical.map((s) => (
                <Chip key={`n-${s}`} tone="nonTechnical" label={s} onRemove={() => removeSelected("nonTechnical", s)} />
              ))}
            </span>
          )}
          <ChevronDown size={16} className="shrink-0 text-ink-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-[16rem] rounded-xl border border-hairline bg-surface-card p-2"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <div className="max-h-[22rem] overflow-auto">
          <SkillGroup
            group="technical"
            kind="technical"
            noun="technical skill"
            icon={<Wrench size={13} strokeWidth={2.4} />}
            title="Technical"
            all={opts.technical}
            custom={opts.custom.technical}
            selected={value.technical}
            isAdmin={isAdmin}
            onToggle={(s) => toggle("technical", s)}
            onOptionsChange={setOpts}
            onSelectedPrune={(pruned) => onChange({ ...value, technical: value.technical.filter((s) => s.toLowerCase() !== pruned.toLowerCase()) })}
          />
          <div className="my-2 border-t border-hairline" />
          <SkillGroup
            group="nonTechnical"
            kind="non_technical"
            noun="non-technical skill"
            icon={<HeartHandshake size={13} strokeWidth={2.4} />}
            title="Non-Technical"
            all={opts.nonTechnical}
            custom={opts.custom.nonTechnical}
            selected={value.nonTechnical}
            isAdmin={isAdmin}
            onToggle={(s) => toggle("nonTechnical", s)}
            onOptionsChange={setOpts}
            onSelectedPrune={(pruned) => onChange({ ...value, nonTechnical: value.nonTechnical.filter((s) => s.toLowerCase() !== pruned.toLowerCase()) })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SkillGroup({
  kind,
  noun,
  icon,
  title,
  all,
  custom,
  selected,
  isAdmin,
  onToggle,
  onOptionsChange,
  onSelectedPrune,
}: {
  group: Group;
  kind: "technical" | "non_technical";
  noun: string;
  icon: React.ReactNode;
  title: string;
  all: string[];
  custom: string[];
  selected: string[];
  isAdmin: boolean;
  onToggle: (skill: string) => void;
  onOptionsChange: (o: SkillLookupOptions) => void;
  onSelectedPrune: (removed: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const customSet = React.useMemo(() => new Set(custom.map((c) => c.toLowerCase())), [custom]);
  const selectedSet = React.useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  React.useEffect(() => {
    if (adding) requestAnimationFrame(() => inputRef.current?.focus());
  }, [adding]);

  async function commitAdd() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    const res = await addSkillLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    onOptionsChange(res.options);
    const list = kind === "technical" ? res.options.technical : res.options.nonTechnical;
    const match = list.find((o) => o.toLowerCase() === v.toLowerCase());
    if (match && !selectedSet.has(match.toLowerCase())) onToggle(match);
    setDraft("");
    setAdding(false);
    fireToast({ message: `Added ${noun} "${match ?? v}"`, type: "success" });
  }

  async function remove(v: string) {
    if (busy) return;
    setBusy(true);
    const res = await removeSkillLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    onOptionsChange(res.options);
    if (selectedSet.has(v.toLowerCase())) onSelectedPrune(v);
    fireToast({ message: `Removed ${noun} "${v}"`, type: "success" });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        <span className="text-altus-red">{icon}</span> {title}
      </div>
      {all.map((o) => {
        const isSel = selectedSet.has(o.toLowerCase());
        const canDelete = isAdmin && customSet.has(o.toLowerCase());
        return (
          <div
            key={o}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
              isSel ? "" : "hover:bg-black/[0.04]",
            )}
            style={isSel ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" } : undefined}
          >
            <button
              type="button"
              onClick={() => onToggle(o)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              role="checkbox"
              aria-checked={isSel}
            >
              <span
                className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors"
                style={
                  isSel
                    ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" }
                    : { borderColor: "var(--color-hairline-strong)" }
                }
              >
                {isSel && <Check size={11} strokeWidth={3.4} className="text-white" />}
              </span>
              <span className={cn("flex-1 truncate text-[14px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>{o}</span>
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
      {all.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-subtle">No skills yet.</p>}

      {isAdmin && (
        <div className="mt-1 px-0.5">
          {adding ? (
            <div className="flex items-center gap-1.5">
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
                className={cn("h-8 flex-1 rounded-md border bg-white px-2.5 text-[13px] font-semibold text-ink-strong focus:border-altus-red", FOCUS_RING)}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <button
                type="button"
                onClick={() => void commitAdd()}
                disabled={busy || !draft.trim()}
                aria-label={`Save new ${noun}`}
                className="grid size-8 shrink-0 place-items-center rounded-md text-white disabled:opacity-50"
                style={{ background: "var(--color-altus-red)" }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setDraft(""); }}
                aria-label="Cancel"
                className="grid size-8 shrink-0 place-items-center rounded-md border bg-white text-ink-subtle hover:text-ink-strong"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-bold text-altus-red transition-colors hover:bg-altus-red/[0.06]"
            >
              <Plus size={14} strokeWidth={2.8} /> Add {title.toLowerCase()} skill
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ tone, label, onRemove }: { tone: Group; label: string; onRemove: () => void }) {
  const style =
    tone === "technical"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }
      : { background: "color-mix(in srgb, #2563eb 10%, white)", color: "#1d4ed8" };
  return (
    <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold" style={style}>
      {label}
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Remove ${label}`}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="grid h-3.5 w-3.5 cursor-pointer place-items-center rounded-full transition-colors hover:bg-black/10"
      >
        <X size={10} strokeWidth={3} />
      </span>
    </span>
  );
}
