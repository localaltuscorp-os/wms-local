"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { createPolicyDraft } from "@/app/(app)/hr/policy-cms-actions";

/** Create a private v1 policy draft before its reviewed version is published. */
export function PolicyDraftCreator() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    const result = await createPolicyDraft({ title, summary, effectiveDate });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    fireToast({ message: "Draft created. You can now edit it freely before publishing.", type: "success" });
    router.push(`/hr/policies/${result.key}/edit`);
  }

  return <form onSubmit={createDraft} className="mx-auto max-w-2xl rounded-2xl border border-hairline bg-white p-6 shadow-sm">
    <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-red-50 text-altus-red"><FilePlus2 size={20} /></span><div><h2 className="text-lg font-extrabold text-ink-strong">Create a policy draft</h2><p className="mt-1 text-sm text-ink-muted">It stays private until an HR admin publishes the reviewed version.</p></div></div>
    <label className="mb-4 block text-sm font-bold text-ink-strong">Policy title<input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 w-full rounded-xl border border-hairline-strong px-3 py-2.5 font-medium outline-none focus:border-altus-red" placeholder="e.g. Remote Work Policy" /></label>
    <label className="mb-4 block text-sm font-bold text-ink-strong">Short summary <span className="font-medium text-ink-muted">(optional)</span><textarea maxLength={2000} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1.5 w-full rounded-xl border border-hairline-strong px-3 py-2.5 font-medium outline-none focus:border-altus-red" placeholder="One line employees will see on the policy card." /></label>
    <label className="mb-5 block text-sm font-bold text-ink-strong">Effective date <span className="font-medium text-ink-muted">(editable later)</span><input maxLength={100} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-hairline-strong px-3 py-2.5 font-medium outline-none focus:border-altus-red" placeholder="e.g. 1 October 2026" /></label>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p>}
    <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-altus-red px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={16} /> : <FilePlus2 size={16} />} Create draft</button>
  </form>;
}
