"use client";

import * as React from "react";
import { ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
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
 * WORK SAMPLES & LINKS - optional, at the end of Personal Details (2026-09-18).
 *
 * Links are typed and added; files upload straight to storage on pick (signed
 * URL, like the photo) and only their keys enter the answer. The whole list is
 * one answer key (`personal.workSamples`), so it autosaves with the form and is
 * never required - see lib/hr/candidate/work-samples.ts.
 */
export function CandidateWorkSamplesField({
  value,
  onChange,
  uploadUrl,
  fileUrl,
}: {
  /** The stored JSON (or ""). */
  value: string;
  onChange: (json: string) => void;
  uploadUrl: WorkUploadUrlFn;
  fileUrl: WorkFileUrlFn;
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
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold text-ink-strong">Work samples &amp; links</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Optional. Add links to your work (portfolio, GitHub, LinkedIn, a Drive folder) and attach
            files: pictures, PDFs or documents, up to 25 MB each.
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-pill bg-surface-soft px-2.5 py-1 text-[11.5px] font-bold text-ink-muted">
          Optional
        </span>
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
