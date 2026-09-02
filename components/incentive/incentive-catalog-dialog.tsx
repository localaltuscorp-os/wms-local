"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import { upsertCatalogEntry, deleteCatalogEntry } from "@/app/(app)/incentive/catalog-actions";
import type { CatalogRow } from "@/lib/queries/incentive-catalog";

type Draft = {
  id?: string;
  name: string;
  amount: string;
  salesEligible: boolean;
  internsEligible: boolean;
  description: string;
  notes: string;
};

const blank = (): Draft => ({ name: "", amount: "", salesEligible: true, internsEligible: true, description: "", notes: "" });
const toDraft = (r: CatalogRow): Draft => ({
  id: r.id,
  name: r.name,
  amount: String(r.amount),
  salesEligible: r.salesEligible,
  internsEligible: r.internsEligible,
  description: r.description ?? "",
  notes: r.notes ?? "",
});

export function IncentiveCatalogDialog({ rows, isAdmin }: { rows: CatalogRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Draft | null>(null); // row being edited / new
  const [saving, setSaving] = React.useState(false);

  function save() {
    if (!editing) return;
    const amount = Number(editing.amount.replace(/[₹,\s]/g, ""));
    if (!editing.name.trim()) return fireToast({ message: "Name is required.", type: "error" });
    if (!Number.isFinite(amount) || amount < 0) return fireToast({ message: "Enter a valid amount.", type: "error" });
    setSaving(true);
    upsertCatalogEntry({
      id: editing.id,
      name: editing.name,
      amount,
      salesEligible: editing.salesEligible,
      internsEligible: editing.internsEligible,
      description: editing.description || null,
      notes: editing.notes || null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        setEditing(null);
        router.refresh();
      })
      .catch((e) => { setSaving(false); fireToast({ message: e instanceof Error ? e.message : "Failed.", type: "error" }); });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" from the incentive table?`)) return;
    deleteCatalogEntry(id).then((res) => {
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Incentive removed." });
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="wg-btn cursor-pointer inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold bg-surface-card text-ink-strong"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline-strong), 0 6px 16px -12px rgba(15,23,42,0.35)",
          }}
        >
          <BookOpen size={16} strokeWidth={2.4} />
          Incentive Table
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[130] -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[1000px] h-[80vh] flex flex-col rounded-2xl border border-hairline bg-surface-card shadow-2xl overflow-hidden"
        >
          {/* header */}
          <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-hairline">
            <div>
              <Dialog.Title className="font-serif italic text-ink-strong" style={{ fontSize: 24, fontWeight: 600 }}>
                Incentive Table
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-medium" style={{ fontSize: 13.5 }}>
                What each incentive earns · who&apos;s eligible{isAdmin ? " · click a row to edit" : ""}.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setEditing(blank())}
                  className="wg-btn wg-sheen cursor-pointer inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #E10600, #A80400)",
                    boxShadow:
                      "0 8px 20px -10px rgba(168,4,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}
                >
                  <Plus size={15} strokeWidth={2.6} /> Add Incentive
                </button>
              )}
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" className="rounded-lg p-2 text-ink-subtle hover:bg-black/[0.05] cursor-pointer">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {editing && (
              <CatalogEditor draft={editing} setDraft={setEditing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
            )}
            {rows.length === 0 && !editing ? (
              <p className="text-ink-subtle font-medium py-10 text-center" style={{ fontSize: 15 }}>
                No incentives in the table yet.{isAdmin ? " Click “Add incentive” to create one." : ""}
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">Incentive</th>
                    <th className="pb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle text-right whitespace-nowrap">Amount</th>
                    <th className="pb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">Eligible</th>
                    {isAdmin && <th className="pb-2 w-px" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top group" style={{ borderColor: "var(--color-hairline)" }}>
                      <td className="py-3 pr-3">
                        <div className="font-bold text-ink-strong" style={{ fontSize: 15 }}>{r.name}</div>
                        {r.description && <div className="text-ink-soft mt-0.5" style={{ fontSize: 13, lineHeight: 1.45 }}>{r.description}</div>}
                        {r.notes && <div className="text-ink-subtle mt-1 whitespace-pre-line" style={{ fontSize: 12, lineHeight: 1.4 }}>{r.notes}</div>}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums font-black text-ink-strong whitespace-nowrap" style={{ fontSize: 16 }}>
                        {formatInr(r.amount)}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1.5">
                          {r.salesEligible && <Tag tone="red">Sales</Tag>}
                          {r.internsEligible && <Tag tone="blue">Interns</Tag>}
                          {!r.salesEligible && !r.internsEligible && <span className="text-ink-subtle" style={{ fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={() => setEditing(toDraft(r))} aria-label="Edit" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer"><Pencil size={15} /></button>
                            <button type="button" onClick={() => remove(r.id, r.name)} aria-label="Delete" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "red" | "blue" }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`, color: `var(--color-${tone}-deep)` }}
    >
      {children}
    </span>
  );
}

function CatalogEditor({
  draft, setDraft, onSave, onCancel, saving,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const field = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14.5px] text-ink-strong outline-none focus:border-altus-red";
  return (
    <div className="mb-5 rounded-xl border-2 border-altus-red/40 bg-altus-red/[0.02] p-4">
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Incentive Name</span>
          <input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. PS Sold in 30 Days" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Amount (₹)</span>
          <input value={draft.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="numeric" placeholder="250" className={`${field} tabular-nums`} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-bold text-ink-soft">Description</span>
        <input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="When it applies" className={field} />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-bold text-ink-soft">Notes</span>
        <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Conditions / fine print" className={`${field} resize-y`} />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft cursor-pointer">
            <input type="checkbox" checked={draft.salesEligible} onChange={(e) => set({ salesEligible: e.target.checked })} /> Sales Eligible
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft cursor-pointer">
            <input type="checkbox" checked={draft.internsEligible} onChange={(e) => set({ internsEligible: e.target.checked })} /> Interns Eligible
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="bg-surface-card cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold text-ink-soft hover:text-ink-strong">Cancel</button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="wg-btn cursor-pointer inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow:
                "0 8px 20px -10px rgba(168,4,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
            {draft.id ? "Save Changes" : "Add Incentive"}
          </button>
        </div>
      </div>
    </div>
  );
}
