"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  FileText,
  LayoutTemplate,
  Loader2,
  Paperclip,
  TriangleAlert,
  Upload,
  Video,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import {
  JD_ATTACHMENT_KINDS,
  JD_ATTACHMENT_META,
  JD_MAX_FILES_PER_KIND,
  checkJdFile,
  formatBytes,
  jdAcceptAttr,
  jdAttachmentHref,
  type JdAttachmentKind,
  type JdUploadRef,
} from "@/lib/jd/attachments";
import {
  attachJdFiles,
  createJdUploadUrl,
  deleteJdAttachment,
  discardJdUpload,
  uploadJdFileDirect,
} from "@/app/(app)/operations/job-description/attachment-actions";
import type { JdEntryRow } from "@/lib/queries/job-description";

/**
 * THE THREE SOP BOXES — Video · Guidelines · Templates, side by side, each
 * taking several files (account holder, 2026-09-18). One component for the
 * New JD form (files staged before the JD exists) and for the detail drawer
 * (files saved on it), so the two cannot drift into different controls.
 *
 * A file is uploaded the moment it is picked, straight to Storage (see
 * attachment-actions.ts), so Save only sends the refs.
 */

const ICONS: Record<JdAttachmentKind, React.ComponentType<{ className?: string }>> = {
  video: Video,
  guidelines: FileText,
  template: LayoutTemplate,
};

/** Upload one file to a server-minted path and return its ref. */
async function uploadJdFile(kind: JdAttachmentKind, file: File): Promise<JdUploadRef> {
  const signed = await createJdUploadUrl({ kind, fileName: file.name, size: file.size });
  if (!signed.ok) throw new Error(signed.error);
  if (signed.direct && signed.token) {
    const { error } = await getSupabaseClient()
      .storage.from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw new Error(`Couldn't upload “${file.name}”: ${error.message}`);
  } else {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    fd.set("path", signed.path);
    const res = await uploadJdFileDirect(fd);
    if (!res.ok) throw new Error(res.error);
  }
  return { kind, path: signed.path, fileName: file.name, size: file.size };
}

/** One row in a box. */
interface BoxItem {
  key: string;
  fileName: string;
  sizeBytes: number | null;
  state: "uploading" | "ready" | "error";
  error?: string;
  /** Where clicking the name goes — saved files only. */
  href?: string | null;
}

/* ── The box ─────────────────────────────────────────────────────────────── */

function AttachmentBox({
  kind,
  items,
  link,
  onPick,
  onRemove,
  disabled,
}: {
  kind: JdAttachmentKind;
  items: BoxItem[];
  /** Editable link (the form) or a saved one to open (the drawer). */
  link?: { value: string; onChange: (v: string) => void } | { href: string | null };
  onPick: (files: File[]) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const meta = JD_ATTACHMENT_META[kind];
  const Icon = ICONS[kind];
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const full = items.filter((i) => i.state !== "error").length >= JD_MAX_FILES_PER_KIND;

  return (
    <div
      onDragOver={(e) => {
        if (disabled || full) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && !full) onPick(Array.from(e.dataTransfer.files));
      }}
      className={`flex min-w-0 flex-col rounded-xl border p-3.5 transition-colors ${
        over ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50/70"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-800">{meta.title}</p>
          <p className="text-[11px] text-slate-500">{meta.hint}</p>
        </div>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">
            {items.filter((i) => i.state !== "error").length}
          </span>
        )}
      </div>

      {link && "onChange" in link && (
        <input
          value={link.value}
          onChange={(e) => link.onChange(e.target.value)}
          placeholder="Paste a link — https://…"
          aria-label={`${meta.title} link`}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
        />
      )}
      {link && "href" in link && link.href && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{link.href}</span>
        </a>
      )}

      {items.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className={`flex min-w-0 items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ${
                it.state === "error" ? "ring-red-200" : "ring-slate-200"
              }`}
            >
              {it.state === "uploading" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
              ) : it.state === "error" ? (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-600" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="min-w-0 flex-1">
                {it.href ? (
                  <a
                    href={it.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[12.5px] font-semibold text-slate-800 hover:underline"
                    title={it.fileName}
                  >
                    {it.fileName}
                  </a>
                ) : (
                  <span className="block truncate text-[12.5px] font-semibold text-slate-800" title={it.fileName}>
                    {it.fileName}
                  </span>
                )}
                <span className={`block truncate text-[10.5px] ${it.state === "error" ? "text-red-700" : "text-slate-400"}`}>
                  {it.state === "error" ? it.error : it.state === "uploading" ? "Uploading…" : formatBytes(it.sizeBytes)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(it.key)}
                disabled={disabled}
                aria-label={`Remove ${it.fileName}`}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || full}
        className="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {full ? `${JD_MAX_FILES_PER_KIND} files — the most a box holds` : "Add files"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={jdAcceptAttr(kind)}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Add ${meta.title} files`}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = ""; // picking the same file again must fire again
          if (picked.length) onPick(picked);
        }}
      />
      <p className="mt-1.5 text-[10.5px] text-slate-400">
        {meta.allowed} · up to 25 MB each · or drop files here
      </p>
    </div>
  );
}

/** A picked file refused before upload, or failed during it, stays visible with its reason. */
function refusal(kind: JdAttachmentKind, file: File): string | null {
  const check = checkJdFile(kind, { name: file.name, size: file.size });
  return check.ok ? null : check.error;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/* ── The New JD form: staged files ───────────────────────────────────────── */

interface Staged extends BoxItem {
  kind: JdAttachmentKind;
  ref?: JdUploadRef;
}

export interface NewJdAttachmentsHandle {
  /** The uploaded files, ready to save with the JD. */
  refs: () => JdUploadRef[];
  /** Throw away every staged upload — the form was cancelled. */
  discardAll: () => void;
}

export const NewJdAttachments = React.forwardRef<
  NewJdAttachmentsHandle,
  {
    links: Record<JdAttachmentKind, string>;
    onLinkChange: (kind: JdAttachmentKind, v: string) => void;
    onBusyChange: (busy: boolean) => void;
  }
>(function NewJdAttachments({ links, onLinkChange, onBusyChange }, ref) {
  const [items, setItems] = React.useState<Staged[]>([]);
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const busy = items.some((i) => i.state === "uploading");
  React.useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  React.useImperativeHandle(ref, () => ({
    refs: () => itemsRef.current.filter((i) => i.state === "ready" && i.ref).map((i) => i.ref!),
    discardAll: () => {
      for (const i of itemsRef.current) if (i.ref) void discardJdUpload(i.ref.path);
      setItems([]);
    },
  }));

  const patch = (key: string, next: Partial<Staged>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));

  async function pick(kind: JdAttachmentKind, files: File[]) {
    const room = JD_MAX_FILES_PER_KIND - itemsRef.current.filter((i) => i.kind === kind && i.state !== "error").length;
    const queue = files.map((file, idx) => {
      const why = idx >= room ? `Only ${JD_MAX_FILES_PER_KIND} files fit in ${JD_ATTACHMENT_META[kind].title}.` : refusal(kind, file);
      return {
        file,
        item: {
          key: newKey(),
          kind,
          fileName: file.name,
          sizeBytes: file.size,
          state: why ? "error" : "uploading",
          error: why ?? undefined,
        } as Staged,
      };
    });
    setItems((prev) => [...prev, ...queue.map((q) => q.item)]);

    // One at a time: a dozen parallel uploads on office Wi-Fi help nobody.
    for (const { file, item } of queue) {
      if (item.state === "error") continue;
      try {
        const r = await uploadJdFile(kind, file);
        const now = itemsRef.current.find((i) => i.key === item.key);
        if (!now) void discardJdUpload(r.path); // removed while it was uploading
        else patch(item.key, { state: "ready", ref: r });
      } catch (err) {
        patch(item.key, { state: "error", error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
  }

  function remove(key: string) {
    const it = itemsRef.current.find((i) => i.key === key);
    if (!it) return;
    if (it.state === "uploading") {
      // Hide it now; the uploader finds it gone and discards the object when it lands.
      setItems((prev) => prev.filter((i) => i.key !== key));
      return;
    }
    if (it.ref) void discardJdUpload(it.ref.path);
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {JD_ATTACHMENT_KINDS.map((kind) => (
        <AttachmentBox
          key={kind}
          kind={kind}
          items={items.filter((i) => i.kind === kind)}
          link={{ value: links[kind], onChange: (v) => onLinkChange(kind, v) }}
          onPick={(files) => void pick(kind, files)}
          onRemove={remove}
        />
      ))}
    </div>
  );
});

/* ── The drawer: files saved on a JD ─────────────────────────────────────── */

export function SavedJdAttachments({ entry }: { entry: JdEntryRow }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<(BoxItem & { kind: JdAttachmentKind })[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const saved = entry.files ?? [];

  const linkOf: Record<JdAttachmentKind, string | null> = {
    video: entry.videoUrl,
    guidelines: entry.guidelinesUrl,
    template: entry.templateUrl,
  };

  async function pick(kind: JdAttachmentKind, files: File[]) {
    setError(null);
    const already = saved.filter((f) => f.kind === kind).length;
    const rows = files.map((file) => ({
      file,
      item: {
        key: newKey(),
        kind,
        fileName: file.name,
        sizeBytes: file.size,
        state: "uploading" as BoxItem["state"],
        error: undefined as string | undefined,
      },
    }));
    for (const [idx, r] of rows.entries()) {
      const why =
        already + idx >= JD_MAX_FILES_PER_KIND
          ? `Only ${JD_MAX_FILES_PER_KIND} files fit in ${JD_ATTACHMENT_META[kind].title}.`
          : refusal(kind, r.file);
      if (why) Object.assign(r.item, { state: "error", error: why });
    }
    setPending((p) => [...p, ...rows.map((r) => r.item)]);

    const refs: JdUploadRef[] = [];
    for (const r of rows) {
      if (r.item.state === "error") continue;
      try {
        refs.push(await uploadJdFile(kind, r.file));
        setPending((p) => p.filter((i) => i.key !== r.item.key));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setPending((p) => p.map((i) => (i.key === r.item.key ? { ...i, state: "error", error: msg } : i)));
      }
    }
    if (refs.length === 0) return;
    const res = await attachJdFiles({ jdId: entry.id, refs });
    if (!res.ok) {
      setError(res.error);
      for (const r of refs) void discardJdUpload(r.path);
      return;
    }
    router.refresh();
  }

  async function remove(key: string) {
    if (pending.some((p) => p.key === key)) {
      setPending((p) => p.filter((i) => i.key !== key));
      return;
    }
    const file = saved.find((f) => f.id === key);
    if (!file || !window.confirm(`Delete “${file.fileName}” from this job description?`)) return;
    setError(null);
    setBusyId(key);
    try {
      const res = await deleteJdAttachment(key);
      if (!res.ok) setError(res.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {JD_ATTACHMENT_KINDS.map((kind) => (
        <AttachmentBox
          key={kind}
          kind={kind}
          link={{ href: linkOf[kind] }}
          items={[
            ...saved
              .filter((f) => f.kind === kind)
              .map<BoxItem>((f) => ({
                key: f.id,
                fileName: f.fileName,
                sizeBytes: f.sizeBytes,
                state: busyId === f.id ? "uploading" : "ready",
                href: jdAttachmentHref(f.id),
              })),
            ...pending.filter((p) => p.kind === kind),
          ]}
          onPick={(files) => void pick(kind, files)}
          onRemove={(key) => void remove(key)}
          disabled={busyId !== null}
        />
      ))}
      {error && <p className="text-[12.5px] text-red-700">{error}</p>}
    </div>
  );
}
