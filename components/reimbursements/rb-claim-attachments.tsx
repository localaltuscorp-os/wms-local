"use client";

import * as React from "react";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import {
  deleteClaimAttachment,
  attachClaimFiles,
  listClaimAttachments,
  type ClaimAttachmentView,
} from "@/app/(app)/reimbursements/attachment-actions";
import { CLAIM_MAX_FILES, formatBytes } from "@/lib/reimbursements/attachment-rules";
import { RbFilePicker } from "./rb-file-picker";
import { uploadClaimFiles } from "./upload-claim-files";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/**
 * The documents on one claim.
 *
 * ── LOADED WHEN THE CARD OPENS, NOT WITH THE PAGE ──────────────────────────
 * Every file needs a freshly SIGNED url, which is a storage round-trip each.
 * The list can hold hundreds of claims, so signing them all up front would
 * spend most of a page load minting links nobody follows — and the links are
 * short-lived anyway, so ones minted early would be stale by the time someone
 * scrolled to them. The count badge comes from the page's single grouped count
 * query; the URLs are fetched here, on open.
 *
 * ── WHY THE LINKS LOOK ORDINARY ────────────────────────────────────────────
 * `url` is a short-lived signed Supabase URL, minted only after the server
 * confirmed the viewer owns the claim or is an admin. The bucket is private, so
 * there is no public address for a receipt; when the signature expires the link
 * simply stops working and reopening the card mints a new one.
 */
export function RbClaimAttachments({
  submissionId,
  count,
  canEdit,
}: {
  submissionId: string;
  /** From the page's grouped count — what to show before the fetch lands. */
  count: number;
  /** The claimant, while the claim is still pending. Admins never edit these. */
  canEdit: boolean;
}) {
  const [files, setFiles] = React.useState<ClaimAttachmentView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Starts TRUE so the first read sets no state synchronously — see the effect.
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [picked, setPicked] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);

  /**
   * Push one list result into state — the single place that decides what an
   * error, an empty list and a full one look like, shared by the first read and
   * by the reloads after an upload or a delete.
   */
  const applyResult = React.useCallback(
    (res: Awaited<ReturnType<typeof listClaimAttachments>> | null) => {
      if (res === null) setError("Could not load the documents.");
      else if (!res.ok) setError(res.error);
      else {
        setError(null);
        setFiles(res.files);
      }
      setLoading(false);
    },
    [],
  );

  /** Re-read after a write, spinner and all. */
  const reload = React.useCallback(async () => {
    setLoading(true);
    applyResult(await listClaimAttachments(submissionId).catch(() => null));
  }, [submissionId, applyResult]);

  // THE FIRST READ. The card only mounts this when it is expanded, so mounting
  // IS the trigger. `loading` already starts true, so nothing is set
  // synchronously here — state moves only once the fetch answers, and `alive`
  // drops a reply that arrives after the card was collapsed again. Same shape
  // as components/project-plan/plan-attachment-cell.tsx.
  React.useEffect(() => {
    let alive = true;
    void listClaimAttachments(submissionId)
      .catch(() => null)
      .then((res) => {
        if (alive) applyResult(res);
      });
    return () => {
      alive = false;
    };
  }, [submissionId, applyResult]);

  async function saveNew() {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const refs = await uploadClaimFiles(picked);
      const res = await attachClaimFiles({ submissionId, refs });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: refs.length === 1 ? "Document added." : `${refs.length} documents added.` });
      setPicked([]);
      setAdding(false);
      await reload();
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Upload failed.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: ClaimAttachmentView) {
    if (!confirm(`Remove “${f.fileName}” from this claim?`)) return;
    setBusy(true);
    const res = await deleteClaimAttachment(f.id);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Document removed." });
    await reload();
  }

  const shown = files ?? [];
  const total = files?.length ?? count;
  const roomLeft = Math.max(0, CLAIM_MAX_FILES - shown.length);

  if (!loading && files != null && shown.length === 0 && !canEdit && !error) {
    return (
      <p className="text-[13px] font-medium text-ink-subtle">
        No documents attached to this claim.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
          <Paperclip size={12} strokeWidth={2.6} aria-hidden />
          Documents
          {total > 0 && <span className="tabular-nums">({total})</span>}
        </h4>
        {canEdit && !adding && roomLeft > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="wg-btn inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            <Plus size={11} strokeWidth={2.8} /> Add
          </button>
        )}
      </div>

      {loading && files == null && (
        <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-subtle">
          <Loader2 size={13} className="animate-spin" aria-hidden /> Loading documents…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "#A80400" }}
        >
          <AlertTriangle size={13} strokeWidth={2.5} aria-hidden /> {error}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {shown.map((f) => (
            <AttachmentTile
              key={f.id}
              file={f}
              // A LEGACY bill (a mobile upload recorded only in `bill_url`) has
              // no attachment row, so there is nothing to delete — and the
              // mobile app would write the field again anyway.
              canEdit={canEdit && !f.legacy}
              busy={busy}
              onRemove={() => void remove(f)}
            />
          ))}
        </ul>
      )}

      {shown.length === 0 && files != null && !error && canEdit && !adding && (
        <p className="text-[13px] font-medium text-ink-subtle">
          No documents yet — add the bill so this claim can be settled.
        </p>
      )}

      {adding && (
        <div className="mt-2.5">
          <RbFilePicker files={picked} onChange={setPicked} disabled={busy} />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setPicked([]);
              }}
              className="rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || picked.length === 0}
              onClick={() => void saveNew()}
              className="wg-btn rounded-pill px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
            >
              {busy ? "Uploading…" : "Attach"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One document.
 *
 * The label is the ORIGINAL filename (the object key is a uuid, so this row is
 * the only place it survives) plus its size. Images get a thumbnail; images and
 * PDFs open in a tab; everything else — Word, above all — downloads, which is
 * the only sensible behaviour for a format no browser renders.
 */
function AttachmentTile({
  file,
  canEdit,
  busy,
  onRemove,
}: {
  file: ClaimAttachmentView;
  canEdit: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const missing = file.url == null;

  return (
    <li
      className="group relative flex items-center gap-2.5 rounded-xl bg-surface-soft px-2.5 py-2"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <span
        className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg"
        style={{ background: "var(--color-surface-card)" }}
      >
        {file.thumbnail && file.url ? (
          /* A signed, short-lived storage URL cannot go through next/image: the
             loader needs a stable allow-listed host, and the signature expires.
             This is a 40px thumbnail, so there is nothing to optimise anyway. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt="" className="size-10 object-cover" loading="lazy" />
        ) : file.mime?.startsWith("image/") ? (
          <ImageIcon size={16} strokeWidth={2.3} className="text-ink-soft" aria-hidden />
        ) : (
          <FileText size={16} strokeWidth={2.3} className="text-ink-soft" aria-hidden />
        )}
      </span>

      <span className="min-w-0 max-w-[210px]">
        <span
          className="block truncate text-[12.5px] font-bold text-ink-strong"
          title={file.fileName}
        >
          {file.fileName}
        </span>
        <span className="block text-[11px] font-medium text-ink-subtle">
          {file.legacy
            ? "Filed from the mobile app"
            : [formatBytes(file.sizeBytes), formatDate(new Date(file.createdAt))]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-0.5">
        {missing ? (
          <span
            className="inline-flex items-center gap-1 px-1 text-[11px] font-bold"
            style={{ color: "#A80400" }}
            title="The stored file could not be found."
          >
            <AlertTriangle size={12} strokeWidth={2.6} aria-hidden /> Missing
          </span>
        ) : (
          <>
            <a
              href={file.url!}
              target="_blank"
              rel="noopener noreferrer"
              // `download` on a cross-origin URL is advisory only, so a Word
              // file is asked for by name and the browser decides — which for a
              // .docx is always a download.
              {...(file.inline ? {} : { download: file.fileName })}
              aria-label={`${file.inline ? "Open" : "Download"} ${file.fileName}`}
              title={file.inline ? "Open in a new tab" : "Download"}
              className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-black/[0.06] hover:text-ink-strong"
            >
              {file.inline ? (
                <ExternalLink size={13} strokeWidth={2.5} aria-hidden />
              ) : (
                <Download size={13} strokeWidth={2.5} aria-hidden />
              )}
            </a>
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                aria-label={`Remove ${file.fileName}`}
                className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-black/[0.06] hover:text-altus-red disabled:opacity-40"
              >
                <Trash2 size={13} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </>
        )}
      </span>
    </li>
  );
}
