"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, UploadCloud, Loader2, Paperclip } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { DOC_TYPES, docTypeMeta, type DossierDocType } from "@/lib/dossier/types";
import { uploadEmployeeDocument } from "@/app/(app)/dossier/actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export function UploadDialog({
  employeeId,
  employeeName,
  presetDocType,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  presetDocType?: DossierDocType;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [docType, setDocType] = React.useState<DossierDocType>(presetDocType ?? "appointment");
  const [file, setFile] = React.useState<File | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  React.useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    form.set("employeeId", employeeId);
    form.set("docType", docType);
    if (!(form.get("file") instanceof File) || (form.get("file") as File).size === 0) {
      fireToast({ message: "Pick a file to upload.", type: "error" });
      return;
    }
    setBusy(true);
    const res = await uploadEmployeeDocument(form);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `Added to ${employeeName}'s dossier`, type: "success" });
    router.refresh();
    onClose();
  }

  if (!mounted) return null;
  const meta = docTypeMeta(docType);

  return createPortal(
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="wg-rise w-full max-w-[520px] overflow-hidden rounded-[24px] bg-surface-card"
        style={{ boxShadow: "0 40px 90px -30px rgba(15,23,42,0.5), inset 0 0 0 1px var(--color-hairline)" }}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-6 py-5" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          <UploadCloud size={20} strokeWidth={2.2} className="text-white" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-black text-white">Add a Document</div>
            <div className="truncate text-[12.5px] font-semibold text-white/80">to {employeeName}&apos;s dossier</div>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Close">
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-6">
          {/* doc type */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Document type</span>
            <div className="flex flex-wrap gap-1.5">
              {DOC_TYPES.map((d) => {
                const on = d.key === docType;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDocType(d.key)}
                    className="rounded-pill px-3 py-1.5 text-[12.5px] font-bold transition"
                    style={{
                      background: on ? `color-mix(in srgb, ${d.accent} 14%, transparent)` : "var(--color-surface-soft)",
                      color: on ? d.accent : "var(--color-ink-muted)",
                      boxShadow: on ? `inset 0 0 0 1.5px ${d.accent}` : "inset 0 0 0 1px var(--color-hairline)",
                    }}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <span className="text-[12px] font-medium text-ink-subtle">{meta.hint}</span>
          </label>

          {/* title */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Title</span>
            <input
              ref={titleRef}
              name="title"
              required
              defaultValue={meta.label}
              maxLength={200}
              className="rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5 text-[14.5px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {/* effective date */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Letter date <span className="font-medium normal-case text-ink-subtle">(optional)</span></span>
              <input name="effectiveDate" type="date" className="rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
            </label>
            {/* file */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">File</span>
              <div className="relative flex items-center gap-2 rounded-xl border border-solid border-hairline-strong bg-surface-soft px-3.5 py-2.5">
                <Paperclip size={15} className="shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-muted">{file ? file.name : "Choose PDF / image…"}</span>
                <input name="file" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="absolute inset-0 cursor-pointer opacity-0" />
              </div>
            </label>
          </div>

          {/* notes */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Notes <span className="font-medium normal-case text-ink-subtle">(optional)</span></span>
            <textarea name="notes" rows={2} maxLength={2000} className="resize-none rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5 text-[13.5px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
          </label>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" onClick={() => !busy && onClose()} className="bg-surface-card rounded-pill px-4 py-2 text-[13.5px] font-bold text-ink-muted hover:text-ink-strong">Cancel</button>
            <button
              type="submit"
              disabled={busy}
              className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -10px ${RED_DEEP}` }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} strokeWidth={2.4} />}
              {busy ? "Uploading…" : "Add Document"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
