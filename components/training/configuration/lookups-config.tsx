"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Eye, EyeOff, ArrowUp, ArrowDown, Pencil, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { upsertLookup, renameLookup, setLookupActive, moveLookup } from "@/app/(app)/training/configuration/actions";
import { LOOKUP_KIND_LABELS, type LookupKind, type LookupOption } from "@/lib/training/lookups";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-[14px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

function KindEditor({ kind, rows }: { kind: LookupKind; rows: LookupOption[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [value, setValue] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (!res.ok) return fireToast({ message: res.error ?? "Failed.", type: "error" });
    fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-5">
      <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft">{LOOKUP_KIND_LABELS[kind]}</h3>

      <div className="mb-4 grid grid-cols-[1fr_1fr_auto] gap-2 max-md:grid-cols-1">
        <input className={INPUT} placeholder="value (lower_snake)" value={value} onChange={(e) => setValue(e.target.value)} />
        <input className={INPUT} placeholder="Label shown to users" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          type="button"
          disabled={pending !== null || !value.trim() || !label.trim()}
          onClick={() => run("add", () => upsertLookup({ kind, value, label }), "Option added.").then(() => { setValue(""); setLabel(""); })}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          {pending === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </div>

      <div className="grid gap-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg bg-[rgba(15,23,42,0.03)] px-3 py-2">
            {editingId === r.id ? (
              <>
                <input className={INPUT} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                <button
                  type="button"
                  onClick={() => run(`ren:${r.id}`, () => renameLookup(r.id, editLabel), "Renamed.").then(() => setEditingId(null))}
                  className="text-[var(--color-green-deep)]" aria-label="Save label"
                >
                  {pending === `ren:${r.id}` ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                </button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-[13.5px] font-semibold ${r.isActive ? "text-ink-strong" : "text-ink-subtle line-through"}`}>
                  {r.label} <span className="font-mono text-[11.5px] text-ink-subtle">{r.value}</span>
                </span>
                <button type="button" onClick={() => { setEditingId(r.id); setEditLabel(r.label); }} className="text-ink-subtle hover:text-ink-strong" aria-label="Rename">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => run(`mv:${r.id}`, () => moveLookup(r.id, "up"), "Reordered.")} className="text-ink-subtle hover:text-ink-strong" aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => run(`md:${r.id}`, () => moveLookup(r.id, "down"), "Reordered.")} className="text-ink-subtle hover:text-ink-strong" aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => run(`tg:${r.id}`, () => setLookupActive(r.id, !r.isActive), r.isActive ? "Retired." : "Restored.")}
                  className="text-ink-subtle hover:text-ink-strong" aria-label={r.isActive ? "Retire" : "Restore"}
                >
                  {pending === `tg:${r.id}` ? <Loader2 size={14} className="animate-spin" /> : r.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-[13px] font-semibold text-ink-subtle">No options — the built-in defaults are in use.</p>}
      </div>
    </div>
  );
}

export function LookupsConfig({ byKind }: { byKind: Record<LookupKind, LookupOption[]> }) {
  return (
    <div className="grid gap-5">
      {(Object.keys(byKind) as LookupKind[]).map((kind) => (
        <KindEditor key={kind} kind={kind} rows={byKind[kind]} />
      ))}
      <p className="text-[12.5px] font-semibold text-ink-subtle">
        Retiring an option keeps it on historical records but removes it from the pickers.
      </p>
    </div>
  );
}
