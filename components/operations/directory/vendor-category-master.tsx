"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, RotateCcw } from "lucide-react";
import type { VendorCategoryRow } from "@/lib/queries/ops-vendors";
import { saveVendorCategory, setVendorCategoryActive } from "@/app/(app)/operations/directory/actions";
import { fireToast } from "@/lib/toast";
import { Field, INPUT, Modal, TD, TH } from "@/components/hr/registers/register-ui";

type Draft = { id?: string; name: string; sortOrder: number };

export function VendorCategoryMaster({ categories }: { categories: VendorCategoryRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy("save");
    const result = await saveVendorCategory(draft).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Could not save the category." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    setDraft(null);
    fireToast({ message: "Vendor Category saved", type: "success" });
    router.refresh();
  }

  async function toggle(category: VendorCategoryRow) {
    setBusy(category.id);
    const result = await setVendorCategoryActive(category.id, !category.isActive).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Could not change the category." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    fireToast({ message: category.isActive ? "Vendor Category retired" : "Vendor Category restored", type: "success" });
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-hairline-strong bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div><h2 className="text-[15px] font-black text-ink-strong">Categories</h2><p className="text-[12.5px] text-ink-muted">Retired categories remain on historical vendors but cannot be selected for new imports.</p></div>
        <button type="button" onClick={() => setDraft({ name: "", sortOrder: categories.length * 10 + 10 })} className="inline-flex items-center gap-2 rounded-lg bg-altus-red px-3.5 py-2 text-[13px] font-bold text-white"><Plus size={15} /> Add category</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse">
          <thead className="bg-surface-soft"><tr><th className={TH}>Category</th><th className={TH}>Order</th><th className={TH}>Status</th><th className={TH}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{categories.map((category) => <tr key={category.id} className="border-t border-hairline"><td className={`${TD} font-bold`}>{category.name}</td><td className={`${TD} tabular-nums text-ink-muted`}>{category.sortOrder}</td><td className={TD}><span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[12px] font-bold">{category.isActive ? "Active" : "Retired"}</span></td><td className={`${TD} text-right whitespace-nowrap`}><button type="button" onClick={() => setDraft({ id: category.id, name: category.name, sortOrder: category.sortOrder })} className="mr-2 inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2 py-1 text-[12px] font-bold"><Pencil size={13} /> Edit</button><button type="button" disabled={busy === category.id} onClick={() => void toggle(category)} className="inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2 py-1 text-[12px] font-bold disabled:opacity-60">{busy === category.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}{category.isActive ? "Retire" : "Restore"}</button></td></tr>)}</tbody>
        </table>
      </div>
      {categories.length === 0 ? <p className="px-4 py-7 text-center text-[13px] text-ink-muted">No categories yet.</p> : null}
      {draft ? <Modal title={draft.id ? "Edit Vendor Category" : "Add Vendor Category"} onClose={() => setDraft(null)}><form onSubmit={save} className="space-y-3"><Field label="Category name" required><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus className={INPUT} /></Field><Field label="Display order"><input value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })} type="number" min="0" className={INPUT} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold">Cancel</button><button type="submit" disabled={busy === "save"} className="inline-flex items-center gap-2 rounded-lg bg-altus-red px-4 py-2 text-[13px] font-bold text-white">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}Save</button></div></form></Modal> : null}
    </section>
  );
}
