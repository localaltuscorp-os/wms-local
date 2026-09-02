"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, FileText, Upload, Loader2, Download, Trash2 } from "lucide-react";
import type { AmbassadorDetail } from "@/lib/queries/ambassadors";
import {
  uploadAmbassadorDocument,
  ambassadorDocumentUrl,
  deleteAmbassadorDocument,
} from "@/app/(app)/ambassadors/doc-ai-actions";
import { fireToast } from "@/lib/toast";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TabDocuments({ detail }: { detail: AmbassadorDetail }) {
  const router = useRouter();
  const docs = detail.documents;
  const ambassadorId = detail.ambassador.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("ambassadorId", ambassadorId);
    form.set("name", file.name);
    form.set("file", file);
    startTransition(async () => {
      const res = await uploadAmbassadorDocument(form);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: `Uploaded (v${res.version}).`, type: "success" });
      router.refresh();
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function open(id: string) {
    setBusyId(id);
    const res = await ambassadorDocumentUrl(id);
    setBusyId(null);
    if (!res.ok) {
      fireToast({ message: res.error });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function remove(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteAmbassadorDocument(id);
      setBusyId(null);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Document deleted.", type: "success" });
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white overflow-hidden" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="inline-grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(225,6,0,0.08)" }}>
            <FolderOpen size={16} strokeWidth={2.4} style={{ color: "var(--color-altus-red-deep)" }} />
          </span>
          <h2 className="text-[15px] font-bold text-ink-strong">Document Center</h2>
        </div>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl py-2 px-3.5 text-[13.5px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} strokeWidth={2.6} />}
          Upload
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="mx-auto max-w-md text-[13.5px] font-medium leading-relaxed text-ink-muted">
            Agreements, brochures, and signed paperwork for this partner live here — with version
            history, so re-uploading the same file name keeps the older copies intact.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--color-hairline)]">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
              <span className="inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(225,6,0,0.08)" }}>
                <FileText size={17} strokeWidth={2.4} className="text-ink-strong" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink-strong">{d.name}</div>
                <div className="text-[12px] font-medium text-ink-muted">
                  v{d.version}
                  {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                  {d.sizeBytes != null ? ` · ${fmtSize(d.sizeBytes)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => open(d.id)}
                disabled={busyId === d.id}
                aria-label="Open document"
                className="inline-grid h-8 w-8 place-items-center rounded-lg border border-hairline text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
              >
                {busyId === d.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={15} strokeWidth={2.4} />}
              </button>
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={busyId === d.id}
                aria-label="Delete document"
                className="inline-grid h-8 w-8 place-items-center rounded-lg border border-altus-red/30 text-altus-red transition-colors hover:bg-altus-red/8 disabled:opacity-50"
              >
                <Trash2 size={15} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
