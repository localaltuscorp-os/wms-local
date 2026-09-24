"use client";

import * as React from "react";
import { Check, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { fireToast } from "@/lib/toast";
import {
  WORK_FILE_ACCEPT,
  WORK_SAMPLES_MAX,
  normaliseWorkLink,
  parseWorkSamples,
  serialiseWorkSamples,
  workFileProblem,
  type WorkSample,
} from "@/lib/hr/candidate/work-samples";
import { RESUME_ACCEPT, resumeFileProblem } from "@/lib/hr/candidate/resume";

/** Mints a signed upload URL for one work-sample file (HR or candidate variant). */
export type WorkUploadUrlFn = (input: {
  fileName: string;
  mime?: string | null;
  size?: number | null;
}) => Promise<{ ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }>;

/** Returns a short-lived link to open a stored work-sample file. */
export type WorkFileUrlFn = (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "github.com/someone" - the link as a person reads it, not the full URL. */
function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 80);
  } catch {
    return url;
  }
}

/**
 * RESUME, WORK SAMPLES AND LINKS - closes Personal Details (2026-09-18, renamed
 * and given a mandatory Resume slot 2026-09-23).
 *
 * Resume is a single required upload (`personal.resume` — see
 * lib/hr/candidate/resume.ts; required-ness is enforced in intake-schema.ts's
 * RESUME_KEY handling, not here). Links/other files stay the optional list this
 * section always was — typed and added, or uploaded straight to storage on pick
 * (signed URL, like the photo), with only their keys entering the answer. The
 * whole list is one answer key (`personal.workSamples`), so it autosaves with
 * the form and is never required - see lib/hr/candidate/work-samples.ts.
 */
export function CandidateWorkSamplesField({
  value,
  onChange,
  uploadUrl,
  fileUrl,
  resumeValue,
  onResumeChange,
  resumeInvalid,
}: {
  /** The stored JSON (or ""). */
  value: string;
  onChange: (json: string) => void;
  uploadUrl: WorkUploadUrlFn;
  fileUrl: WorkFileUrlFn;
  /** The stored resume storage key (or ""). */
  resumeValue: string;
  onResumeChange: (path: string) => void;
  /** True once the form was submitted with no resume attached. */
  resumeInvalid?: boolean;
}) {
  const items = React.useMemo(() => parseWorkSamples(value), [value]);
  // The latest list, for uploads that finish after other edits.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const full = items.length + uploading.length >= WORK_SAMPLES_MAX;

  const [resumeBusy, setResumeBusy] = React.useState(false);
  const resumeRef = React.useRef<HTMLInputElement | null>(null);
  const hasResume = resumeValue.trim().length > 0;
  const resumeName = React.useMemo(() => {
    const clean = resumeValue.split("/").pop() ?? "";
    // Uploaded paths are prefixed with a random id — drop everything up to the
    // last "-" so a resumed draft shows a readable name, not the storage key.
    const dash = clean.lastIndexOf("-");
    return dash === -1 ? clean : clean.slice(dash + 1);
  }, [resumeValue]);

  async function uploadResume(file: File) {
    const problem = resumeFileProblem({ name: file.name, mime: file.type, size: file.size });
    if (problem) {
      fireToast({ message: problem, type: "error" });
      return;
    }
    setResumeBusy(true);
    try {
      const signed = await uploadUrl({ fileName: file.name, mime: file.type || null, size: file.size });
      if (!signed.ok) {
        fireToast({ message: signed.error, type: "error" });
        return;
      }
      const { error } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/pdf" });
      if (error) {
        fireToast({ message: `Upload failed: ${error.message}`, type: "error" });
        return;
      }
      onResumeChange(signed.path);
      fireToast({ message: "Resume attached." });
    } finally {
      setResumeBusy(false);
      if (resumeRef.current) resumeRef.current.value = "";
    }
  }

  async function openResume() {
    const res = await fileUrl(resumeValue);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function commit(next: WorkSample[]) {
    itemsRef.current = next;
    onChange(serialiseWorkSamples(next));
  }

  function addLink() {
    const url = normaliseWorkLink(link);
    if (!url) {
      setLinkError("Enter a web link, e.g. https://github.com/yourname");
      return;
    }
    if (itemsRef.current.some((s) => s.kind === "link" && s.url === url)) {
      setLinkError("That link is already added.");
      return;
    }
    if (full) return;
    commit([...itemsRef.current, { kind: "link", url }]);
    setLink("");
    setLinkError(null);
  }

  async function uploadOne(file: File) {
    const problem = workFileProblem({ name: file.name, mime: file.type, size: file.size });
    if (problem) {
      fireToast({ message: `${file.name}: ${problem}`, type: "error" });
      return;
    }
    setUploading((u) => [...u, file.name]);
    try {
      const signed = await uploadUrl({ fileName: file.name, mime: file.type || null, size: file.size });
      if (!signed.ok) {
        fireToast({ message: signed.error, type: "error" });
        return;
      }
      const { error } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
      if (error) {
        fireToast({ message: `Upload failed (${file.name}): ${error.message}`, type: "error" });
        return;
      }
      commit([
        ...itemsRef.current,
        { kind: "file", path: signed.path, name: file.name, size: file.size, mime: file.type || null },
      ]);
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : `Upload failed (${file.name}).`, type: "error" });
    } finally {
      setUploading((u) => {
        const i = u.indexOf(file.name);
        return i === -1 ? u : [...u.slice(0, i), ...u.slice(i + 1)];
      });
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const room = WORK_SAMPLES_MAX - itemsRef.current.length - uploading.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    if (files.length < list.length) fireToast({ message: `Up to ${WORK_SAMPLES_MAX} items in total.`, type: "error" });
    if (fileRef.current) fileRef.current.value = "";
    // One at a time: a phone on a weak connection uploading five files in
    // parallel tends to fail all five.
    for (const f of files) await uploadOne(f);
  }

  async function open(s: WorkSample) {
    if (s.kind === "link") {
      window.open(s.url, "_blank", "noopener,noreferrer");
      return;
    }
    const res = await fileUrl(s.path);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function remove(i: number) {
    commit(itemsRef.current.filter((_, j) => j !== i));
  }

  return (
    <section className="mt-8 rounded-2xl border border-hairline bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:p-5">
      <h4 className="text-[15px] font-bold text-ink-strong">Resume, Work Samples and Links</h4>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        Resume is compulsory to upload. Work samples and links are optional — add links to your
        work (portfolio, GitHub, LinkedIn, a Drive folder) and attach files: pictures, PDFs or
        documents, up to 25 MB each.
      </p>

      {/* Resume — the one required upload in this section. */}
      <div
        data-invalid={resumeInvalid ? "true" : undefined}
        className="mt-4 rounded-xl border-2 p-4"
        style={{ borderColor: resumeInvalid ? "var(--color-altus-red)" : "color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline))" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <span className="text-[13.5px] font-bold text-ink-strong">
              Resume<span className="text-altus-red" aria-hidden> *</span>
            </span>
            {hasResume && !resumeBusy && (
              <button
                type="button"
                onClick={() => void openResume()}
                className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-strong hover:text-altus-red"
                title={`Open ${resumeName}`}
              >
                <FileText size={14} className="shrink-0 text-ink-muted" />
                <span className="truncate">{resumeName}</span>
                <ExternalLink size={11} className="shrink-0 opacity-50" />
              </button>
            )}
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
            style={
              hasResume
                ? { background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }
                : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }
            }
          >
            {hasResume ? (
              <>
                <Check size={12} strokeWidth={2.8} /> Attached
              </>
            ) : (
              "Required"
            )}
          </span>
        </div>
        <input
          ref={resumeRef}
          type="file"
          accept={RESUME_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadResume(f);
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resumeBusy}
            onClick={() => resumeRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-60"
          >
            {resumeBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} strokeWidth={2.3} />}
            {hasResume ? "Replace resume" : "Upload resume"}
          </button>
          {hasResume && !resumeBusy && (
            <button
              type="button"
              onClick={() => onResumeChange("")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 text-[13.5px] font-bold text-altus-red"
            >
              <Trash2 size={15} strokeWidth={2.3} /> Remove
            </button>
          )}
        </div>
        {resumeInvalid && <p className="mt-2 text-[12px] font-semibold text-altus-red">This field is required.</p>}
      </div>

      {/* Add a link */}
      <div className="mt-4 flex flex-wrap items-stretch gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="url"
            inputMode="url"
            value={link}
            disabled={full}
            onChange={(e) => {
              setLink(e.target.value);
              if (linkError) setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            placeholder="Paste a link, e.g. https://github.com/yourname"
            aria-label="Work sample link"
            aria-invalid={!!linkError}
            className="h-11 w-full rounded-xl border-2 bg-white pl-9 pr-3 text-[14px] text-ink-strong outline-none transition-colors focus:border-altus-red disabled:opacity-50"
            style={{ borderColor: linkError ? "var(--color-altus-red)" : "color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline))" }}
          />
        </div>
        <button
          type="button"
          onClick={addLink}
          disabled={full || !link.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-hairline-strong bg-white px-4 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-50"
        >
          <Plus size={15} strokeWidth={2.4} /> Add link
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={WORK_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={full}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-hairline-strong bg-white px-4 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-50"
        >
          <Paperclip size={15} strokeWidth={2.4} /> Attach files
        </button>
      </div>
      {linkError && <p className="mt-1.5 text-[12px] font-semibold text-altus-red">{linkError}</p>}

      {/* The list */}
      {(items.length > 0 || uploading.length > 0) && (
        <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline" role="list">
          {items.map((s, i) => {
            const Icon = s.kind === "link" ? Link2 : s.mime?.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={s.kind === "link" ? s.url : s.path} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-soft text-ink-muted">
                  <Icon size={15} strokeWidth={2.2} />
                </span>
                <button
                  type="button"
                  onClick={() => void open(s)}
                  className="group min-w-0 flex-1 text-left"
                  title={s.kind === "link" ? s.url : `Open ${s.name}`}
                >
                  <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-ink-strong group-hover:text-altus-red">
                    <span className="truncate">{s.kind === "link" ? linkLabel(s.url) : s.name}</span>
                    <ExternalLink size={12} className="shrink-0 opacity-50" />
                  </span>
                  <span className="block text-[11.5px] text-ink-subtle">
                    {s.kind === "link" ? "Link" : ["File", fmtSize(s.size)].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${s.kind === "link" ? linkLabel(s.url) : s.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-altus-red/10 hover:text-altus-red"
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
          {uploading.map((name, i) => (
            <li key={`up-${i}-${name}`} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink-muted">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-soft">
                <Loader2 size={15} className="animate-spin" />
              </span>
              <span className="min-w-0 flex-1 truncate">Uploading {name}…</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
