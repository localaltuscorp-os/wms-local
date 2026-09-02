"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, Pencil, Trash2, RefreshCw, X, Check } from "lucide-react";
import {
  uploadDocument,
  updateDocument,
  deleteDocument,
  replaceDocumentFile,
} from "@/app/(app)/documents/actions";
import { fireToast } from "@/lib/toast";
import type { DocumentRow } from "@/lib/queries/documents";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentLibrary({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return fireToast({ message: "Title is required." });
    if (!file) return fireToast({ message: "Pick a file." });
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("file", file);
    setBusy(true);
    const res = await uploadDocument(fd);
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error });
    fireToast({ message: `${title.trim()} uploaded.` });
    setTitle("");
    setDescription("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload form */}
      <form
        onSubmit={submit}
        className="rounded-section border border-hairline bg-surface-card p-5 flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-subtle">
          <Upload size={15} strokeWidth={2.4} /> Upload a document
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (required)"
            maxLength={200}
            className="rounded-md border border-hairline-strong px-3 py-2 text-[15px] outline-none"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={2000}
            className="rounded-md border border-hairline-strong px-3 py-2 text-[15px] outline-none"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[14px]"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md py-2 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      {/* Library */}
      {documents.length === 0 ? (
        <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-12 text-center">
          <FileText size={28} className="mx-auto text-ink-subtle mb-2" />
          <p className="font-serif text-ink-strong" style={{ fontStyle: "italic", fontSize: 20 }}>
            No documents yet
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocumentRow }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(doc.title);
  const [description, setDescription] = React.useState(doc.description ?? "");
  const [pending, start] = React.useTransition();
  const replaceRef = React.useRef<HTMLInputElement>(null);

  function saveEdit() {
    start(async () => {
      const res = await updateDocument(doc.id, { title: title.trim(), description });
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: "Saved." });
      setEditing(false);
      router.refresh();
    });
  }
  function del() {
    start(async () => {
      const res = await deleteDocument(doc.id);
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: `${doc.title} deleted.` });
      router.refresh();
    });
  }
  function replace(f: File) {
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const res = await replaceDocumentFile(doc.id, fd);
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: "File replaced." });
      router.refresh();
    });
  }

  return (
    <div className="group rounded-chip border border-hairline bg-white px-4 py-3 flex items-center gap-3">
      <FileText size={20} className="text-ink-subtle shrink-0" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-hairline-strong px-2 py-1 text-[14px] font-semibold outline-none" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded border border-hairline px-2 py-1 text-[13px] outline-none" />
          </div>
        ) : (
          <>
            <div className="text-[15px] font-semibold text-ink-strong truncate">{doc.title}</div>
            {doc.description && <div className="text-[13px] text-ink-subtle truncate">{doc.description}</div>}
            <div className="text-[11.5px] text-ink-subtle mt-0.5">
              {doc.uploadedByName ? `${doc.uploadedByName} · ` : ""}
              {prettySize(doc.sizeBytes)}
            </div>
          </>
        )}
      </div>
      <input ref={replaceRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(f); e.target.value = ""; }} />
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button type="button" onClick={saveEdit} disabled={pending} aria-label="Save" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft"><Check size={16} /></button>
            <button type="button" onClick={() => { setEditing(false); setTitle(doc.title); setDescription(doc.description ?? ""); }} aria-label="Cancel" className="p-1.5 rounded-md text-ink-muted hover:bg-surface-soft"><X size={16} /></button>
          </>
        ) : (
          <>
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label="Download" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft"><Download size={16} /></a>
            )}
            <button type="button" onClick={() => replaceRef.current?.click()} disabled={pending} aria-label="Replace file" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><RefreshCw size={15} /></button>
            <button type="button" onClick={() => setEditing(true)} disabled={pending} aria-label="Edit" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><Pencil size={15} /></button>
            <button type="button" onClick={del} disabled={pending} aria-label="Delete" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft hover:text-[var(--color-red-deep)] opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><Trash2 size={15} /></button>
          </>
        )}
      </div>
    </div>
  );
}
