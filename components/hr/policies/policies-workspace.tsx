"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, FileText, Download, Trash2, X, ScrollText } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { POLICY_CATEGORIES } from "@/lib/hr/policy-types";
import { uploadPolicy, deletePolicy } from "@/app/(app)/policies/actions";
import { formatDate } from "@/lib/format";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface Policy {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  sizeBytes: number | null;
  signedUrl: string | null;
  uploadedAt: string;
}
interface Group {
  category: string;
  label: string;
  accent: string;
  hint: string;
  policies: Policy[];
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return formatDate(iso);
}

export function PoliciesWorkspace({ groups, isAdmin }: { groups: Group[]; isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const total = groups.reduce((n, g) => n + g.policies.length, 0);

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Upload size={14} /> Upload policy
          </button>
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-14 text-center">
          <ScrollText size={30} className="mx-auto text-ink-soft" />
          <p className="mt-3 text-[14px] font-medium text-ink-muted">
            No policies published yet.
            {isAdmin ? " Upload the first one above." : " Check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.category}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: g.accent }} />
                <h2 className="text-[15px] font-bold text-ink-strong">{g.label}</h2>
                <span className="text-[12px] font-semibold text-ink-soft">{g.policies.length}</span>
              </div>
              <ul className="space-y-2">
                {g.policies.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3">
                    <FileText size={18} className="shrink-0 text-ink-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink-strong">{p.title}</div>
                      <div className="truncate text-[12px] text-ink-muted">
                        {p.description ? `${p.description} · ` : ""}
                        {p.fileName} {p.sizeBytes ? `· ${fmtSize(p.sizeBytes)}` : ""} · {fmtDate(p.uploadedAt)}
                      </div>
                    </div>
                    <a
                      href={p.signedUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!p.signedUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong transition hover:border-[var(--color-altus-red)]"
                    >
                      <Download size={13} /> Open
                    </a>
                    {isAdmin && <DeleteButton id={p.id} onDone={() => router.refresh()} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open && <UploadDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function DeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      onClick={async () => {
        if (busy) return;
        if (!confirm("Delete this policy for everyone?")) return;
        setBusy(true);
        const res = await deletePolicy(id);
        setBusy(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: "Policy deleted", type: "success" });
        onDone();
      }}
      className="inline-flex items-center rounded-lg border border-hairline px-2 py-1.5 text-ink-muted transition hover:border-[var(--color-altus-red)] hover:text-[var(--color-altus-red)]"
      aria-label="Delete policy"
      disabled={busy}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  );
}

function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await uploadPolicy(fd);
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Policy uploaded", type: "success" });
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl border border-hairline bg-surface-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-ink-strong">Upload Policy</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink-strong"><X size={18} /></button>
        </div>
        <form ref={formRef} onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input name="title" required autoFocus maxLength={200} placeholder="e.g. Leave Policy 2026" className={inputCls} />
          </Field>
          <Field label="Category">
            <select name="category" required defaultValue="hr_general" className={inputCls}>
              {POLICY_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional)">
            <input name="description" maxLength={2000} placeholder="Short note or version" className={inputCls} />
          </Field>
          <Field label="File">
            <input name="file" type="file" required className="block w-full text-[13px] text-ink-strong file:mr-3 file:rounded-lg file:border-0 file:bg-surface-soft file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13.5px] text-ink-strong outline-none focus:border-[var(--color-altus-red)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
