"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Mail, Download, Trash2, X, Search, PenLine } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LETTER_TYPES } from "@/lib/hr/letter-types";
import { uploadLetter, deleteLetter } from "@/app/(app)/letters/actions";
import { SignatureStatusPill } from "@/components/documents/signature-status-pill";
import { formatDate } from "@/lib/format";
import type { SignatureStatus } from "@/lib/documents/signing";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface Letter {
  id: string;
  employeeId: string;
  employeeName: string | null;
  letterType: string;
  letterLabel: string;
  title: string;
  effectiveDate: string | null;
  fileName: string;
  sizeBytes: number | null;
  notes: string | null;
  signedUrl: string | null;
  uploadedAt: string;
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return formatDate(iso);
}

interface SignatureLite {
  signatureId: string;
  status: SignatureStatus;
  signedPdfPath: string | null;
}

export function LettersWorkspace({
  letters,
  isAdmin,
  roster,
  signatures = {},
}: {
  letters: Letter[];
  isAdmin: boolean;
  roster: Array<{ id: string; name: string }>;
  signatures?: Record<string, SignatureLite>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return letters;
    return letters.filter(
      (l) =>
        (l.employeeName ?? "").toLowerCase().includes(s) ||
        l.title.toLowerCase().includes(s) ||
        l.letterLabel.toLowerCase().includes(s),
    );
  }, [letters, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin ? (
          <div className="relative min-w-[220px] flex-1 max-w-[360px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Local search — person, letter or title" title="Local search — filters only the list on this page" aria-label="Local search — person, letter or title — this page only"
              className="w-full rounded-pill border border-hairline bg-surface-card py-2 pl-9 pr-3 text-[13px] text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
            />
          </div>
        ) : <span />}
        {isAdmin && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Upload size={14} /> Issue letter
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-14 text-center">
          <Mail size={30} className="mx-auto text-ink-soft" />
          <p className="mt-3 text-[14px] font-medium text-ink-muted">
            {letters.length === 0
              ? isAdmin
                ? "No letters issued yet. Issue the first one above."
                : "You have no letters yet."
              : "No letters match your search."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((l) => {
            const sig = signatures[l.id] ?? null;
            const isSigned = sig?.status === "signed";
            return (
            <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "#E1060014" }}>
                <Mail size={16} style={{ color: RED_DEEP }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-ink-strong">{l.title}</span>
                  <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-ink-muted">{l.letterLabel}</span>
                  {sig && <SignatureStatusPill status={sig.status} />}
                </div>
                <div className="truncate text-[12px] text-ink-muted">
                  {isAdmin && l.employeeName ? `${l.employeeName} · ` : ""}
                  {l.effectiveDate ? `${fmtDate(l.effectiveDate)} · ` : ""}
                  {l.fileName} {l.sizeBytes ? `· ${fmtSize(l.sizeBytes)}` : ""}
                </div>
              </div>
              <a
                href={l.signedUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!l.signedUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong transition hover:border-[var(--color-altus-red)]"
              >
                <Download size={13} /> Open
              </a>
              {!isSigned && (
                <a
                  href={`/documents/sign?kind=letter&doc=${l.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  <PenLine size={13} /> {sig?.status === "verified" ? "Finish signing" : "Review & sign"}
                </a>
              )}
              {isSigned && (
                <a
                  href={`/documents/sign?kind=letter&doc=${l.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong transition hover:border-[var(--color-altus-red)]"
                >
                  <PenLine size={13} /> Signed
                </a>
              )}
              {isAdmin && <DeleteButton id={l.id} onDone={() => router.refresh()} />}
            </li>
            );
          })}
        </ul>
      )}

      {open && <IssueDialog roster={roster} onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function DeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      onClick={async () => {
        if (busy) return;
        if (!confirm("Delete this letter?")) return;
        setBusy(true);
        const res = await deleteLetter(id);
        setBusy(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: "Letter deleted", type: "success" });
        onDone();
      }}
      className="inline-flex items-center rounded-lg border border-hairline px-2 py-1.5 text-ink-muted transition hover:border-[var(--color-altus-red)] hover:text-[var(--color-altus-red)]"
      aria-label="Delete letter"
      disabled={busy}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  );
}

function IssueDialog({
  roster,
  onClose,
  onDone,
}: {
  roster: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await uploadLetter(fd);
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Letter issued", type: "success" });
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl border border-hairline bg-surface-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-ink-strong">Issue Letter</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink-strong"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Employee">
            <select name="employeeId" required defaultValue="" autoFocus className={inputCls}>
              <option value="" disabled>Select a person…</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Letter Type">
            <select name="letterType" required defaultValue="letter_offer" className={inputCls}>
              {LETTER_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input name="title" required maxLength={200} placeholder="e.g. Offer Letter — Jul 2026" className={inputCls} />
          </Field>
          <Field label="Effective Date (optional)">
            <input name="effectiveDate" type="date" className={inputCls} />
          </Field>
          <Field label="Notes (optional)">
            <input name="notes" maxLength={2000} className={inputCls} />
          </Field>
          <Field label="File">
            <input name="file" type="file" required className="block w-full text-[13px] text-ink-strong file:mr-3 file:rounded-lg file:border-0 file:bg-surface-soft file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Issue
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
