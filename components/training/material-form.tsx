"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, Loader2, Save, Upload, FileText, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { createMaterial, addTcLookup, softDeleteTcLookup } from "@/app/(app)/training/actions";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)]";
const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={LABEL}>{label}</label>
      {children}
    </div>
  );
}
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <div className="mb-4">
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 17, letterSpacing: "-0.01em" }}>{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] font-medium text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function MaterialForm({
  subjects,
  employeeOptions,
  departmentOptions,
}: {
  subjects: LookupOption[];
  employeeOptions: { value: string; label: string }[];
  departmentOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  React.useEffect(() => {
    // Keyboard-first: land the caret in the first typeable field on open. The
    // Subject control is a LookupSelect (custom combobox) whose trigger would
    // auto-open its popover on focus, so we focus the first native input (LOS).
    document.getElementById("los")?.focus();
  }, []);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [los, setLos] = React.useState("");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [version, setVersion] = React.useState("");
  const [versionNotes, setVersionNotes] = React.useState("");
  const [createdByIds, setCreatedByIds] = React.useState<string[]>([]);
  const [assistedByIds, setAssistedByIds] = React.useState<string[]>([]);
  const [partOfInduction, setPartOfInduction] = React.useState(false);
  const [inductionDeptIds, setInductionDeptIds] = React.useState<string[]>([]);

  const [file, setFile] = React.useState<{ path: string; fileName: string; fileType: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/training/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Upload failed.");
      } else {
        setFile({ path: json.path, fileName: json.fileName, fileType: json.fileType });
      }
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file && !videoUrl.trim()) {
      setError("Add a material file or a video URL.");
      return;
    }
    setSubmitting(true);
    const res = await createMaterial({
      subjectId,
      los,
      filePath: file?.path ?? null,
      fileName: file?.fileName ?? null,
      fileType: file?.fileType ?? null,
      videoUrl: videoUrl || null,
      notes,
      version,
      versionNotes,
      createdByIds,
      assistedByIds,
      partOfInduction,
      inductionDeptIds,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Training material added.", type: "success" });
    router.push("/training" as Route);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Section title="Material" hint="What this training covers and where it sits.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Subject">
            <LookupSelect
              label="subject"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects}
              onAdd={(name) => addTcLookup("subject", name)}
              onDelete={(id) => softDeleteTcLookup("subject", id)}
              className={FIELD}
            />
          </Field>
          <Field label="LOS (List of Subjects)" htmlFor="los">
            <input id="los" className={FIELD} value={los} maxLength={200} onChange={(e) => setLos(e.target.value)} placeholder="Grouping / classification" />
          </Field>
        </div>
      </Section>

      <Section title="Content" hint="Upload a file (PDF / xls / short video) or paste a video URL.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Material File">
            <input ref={fileInputRef} type="file" accept=".mp4,.webm,.mov,.mkv,.pdf,.xls,.xlsx" className="hidden" onChange={onPickFile} />
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-soft px-3 py-3">
                <FileText size={17} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                <span className="flex-1 truncate text-[14px] font-semibold text-ink-strong">{file.fileName}</span>
                <span className="text-[11px] font-bold uppercase text-ink-subtle">{file.fileType}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="text-ink-subtle hover:text-altus-red"><X size={16} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={FIELD + " flex items-center gap-2 text-ink-subtle disabled:opacity-60"}>
                {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} strokeWidth={2.2} />}
                {uploading ? "Uploading…" : "Choose File (≤100MB)"}
              </button>
            )}
          </Field>
          <Field label="Video URL" htmlFor="videoUrl">
            <input id="videoUrl" className={FIELD} value={videoUrl} maxLength={1000} onChange={(e) => setVideoUrl(e.target.value)} placeholder="YouTube / Vimeo / Drive link" inputMode="url" />
          </Field>
          <Field label="Video / Notes" htmlFor="notes" className="col-span-2 max-md:col-span-1">
            <textarea id="notes" className={FIELD + " min-h-[80px] resize-y"} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Notes attached to this material" />
          </Field>
        </div>
      </Section>

      <Section title="Credits & Version">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Created By">
            <MultiSelect options={employeeOptions} selected={createdByIds} onChange={setCreatedByIds} placeholder="Select people…" className={FIELD} />
          </Field>
          <Field label="Assisted By">
            <MultiSelect options={employeeOptions} selected={assistedByIds} onChange={setAssistedByIds} placeholder="Select people…" className={FIELD} />
          </Field>
          <Field label="Version" htmlFor="version">
            <input id="version" className={FIELD} value={version} maxLength={50} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v1.0" />
          </Field>
          <Field label="Version Notes" htmlFor="vnotes">
            <input id="vnotes" className={FIELD} value={versionNotes} maxLength={2000} onChange={(e) => setVersionNotes(e.target.value)} placeholder="What changed in this version" />
          </Field>
        </div>
      </Section>

      <Section title="Induction" hint="Flag this as induction material and choose which departments' new hires get it automatically.">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={partOfInduction} onChange={(e) => setPartOfInduction(e.target.checked)} className="size-5 rounded accent-[var(--color-altus-red)]" />
          <span className="text-[15px] font-semibold text-ink-strong">Part of Induction</span>
        </label>
        {partOfInduction && (
          <div className="mt-4">
            <label className={LABEL}>Applies to Departments</label>
            <MultiSelect options={departmentOptions} selected={inductionDeptIds} onChange={setInductionDeptIds} placeholder="Select departments…" className={FIELD} />
          </div>
        )}
      </Section>

      {error && (
        <div role="alert" className="rounded-lg px-4 py-3 text-[14px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}>
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <button type="button" onClick={() => router.push("/training" as Route)} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong hover:border-hairline-strong">
          <ArrowLeft size={16} strokeWidth={2.4} /> Cancel
        </button>
        <button type="submit" disabled={submitting || uploading} className="inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}>
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.4} />}
          Add Material
        </button>
      </div>
    </form>
  );
}
