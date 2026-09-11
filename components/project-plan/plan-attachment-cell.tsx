"use client";

import * as React from "react";
import { Paperclip, Loader2, Trash2, Upload, X, FileText, Eye, Download } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { isPdf, isPreviewable } from "@/lib/storage/previewable";
import {
  listPlanAttachments,
  uploadPlanAttachment,
  deletePlanAttachment,
  type PlanAttachmentView,
} from "@/app/(app)/project-plan/attachment-actions";

/** The plan module's red, matching the board and the registers. */
const ACCENT_DEEP = "#A80400";
const ACCENT_WASH = "#FDF0F0";
const ACCENT_WASH_HOVER = "#FAE2E2";

/**
 * The tallest the panel gets — header, a full scrolled list, the upload row and
 * the padding around them. Used only to decide which way to open, so it wants
 * to be a slight over-estimate: guessing too big drops a panel below the
 * trigger that would just have fitted above, which is merely the old
 * behaviour, while guessing too small opens one upward off the top of the
 * window. Matches `PlanLinksCell`, the cell beside this one.
 */
const PANEL_MAX_H = 320;

/** "1.2 MB" / "840 KB" / "" when the size was never recorded. */
function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Project Plan — the Attachments cell.
 *
 * Shows a COUNT and nothing else until it is opened. That is the whole design
 * point: a signed URL costs a round-trip per file, so the register loads counts
 * in one batched query (`attachmentCounts`) and the panel fetches the real
 * links only when somebody actually looks — a page of sixty milestones spends
 * one query on this column, not sixty.
 *
 * A ROW WITH FILES IS RED. The paperclip and its count take the module's red on
 * a wash, so a column of sixty rows says at a glance which ones carry something
 * — an empty cell is a grey dash and a full one is impossible to miss.
 *
 * IT OPENS ON HOVER. Point at the cell and the file list appears, with the
 * count, each file's name and size, and a delete on every one of them; no click
 * needed to find out what is in there. Clicking still opens it and PINS it, so
 * the panel does not evaporate while you are reaching for a filename — and the
 * pin is set automatically while the OS file picker is up, which is otherwise
 * exactly when the pointer wanders off and takes the panel (and the upload)
 * with it.
 *
 * PERMISSIONS. None here beyond the flag: attachments are open to any
 * signed-in employee, like everything in this module except STATUS. `canManage`
 * is kept so a caller can still draw the cell read-only if it ever needs to,
 * and every call site currently passes it.
 */
export function PlanAttachmentCell({
  nodeId,
  initialCount,
  canManage,
}: {
  nodeId: string;
  initialCount: number;
  canManage: boolean;
}) {
  const [count, setCount] = React.useState(initialCount);
  const [open, setOpen] = React.useState(false);
  /** Opened by a CLICK (or holding the file picker) — hover-out must not close it. */
  const [pinned, setPinned] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  // The register re-renders with fresh server counts after a revalidate; adopt
  // them so this cell never sticks on a stale local number.
  //
  // Adjusted DURING RENDER rather than in an effect — React's own pattern for
  // "reset state when a prop changes". An effect would render the stale count
  // once, then immediately render again, which is the cascading-render warning
  // and a visible flicker on a table of sixty of these.
  const [lastServerCount, setLastServerCount] = React.useState(initialCount);
  if (lastServerCount !== initialCount) {
    setLastServerCount(initialCount);
    setCount(initialCount);
  }

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  React.useEffect(() => cancelClose, [cancelClose]);

  function close() {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }

  /**
   * Which way the panel opens. BELOW the trigger by default, like every other
   * hover surface in the app — opening upward covered the rows you had just
   * read on the way down to this one.
   *
   * Flipped up only when the panel genuinely cannot fit below (a trigger near
   * the bottom of the window) and can fit above — the same rule, and the same
   * constant, as the cell beside this one.
   */
  const [below, setBelow] = React.useState(true);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  /** Measured at OPEN time, not on every render: the answer only changes when
   *  the panel appears, and a render-time rect read would thrash on scroll. */
  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Below by default; up only when the panel genuinely cannot fit down
    // there AND can fit up here.
    const roomBelow = window.innerHeight - r.bottom;
    setBelow(roomBelow >= PANEL_MAX_H + 12 || r.top < PANEL_MAX_H + 12);
  }, []);

  /** Hover opens — mouse only. A touch fires `pointerenter` too, and on a phone
   *  that would open the panel on the way to somewhere else. */
  function onEnter(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    place();
    setOpen(true);
  }

  /** A short grace period, so a pointer clipping the corner on its way past
   *  does not snap the panel shut mid-read. */
  function onLeave(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  function toggle() {
    if (open && pinned) {
      close();
      return;
    }
    cancelClose();
    place();
    setOpen(true);
    setPinned(true);
  }

  const label = count === 0 ? "No files attached" : `${count} file${count === 1 ? "" : "s"} attached`;

  return (
    <div className="relative" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={label}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold transition-colors"
        style={
          count > 0
            ? { color: ACCENT_DEEP, background: open ? ACCENT_WASH_HOVER : ACCENT_WASH }
            : { color: "var(--color-ink-subtle)" }
        }
      >
        <Paperclip size={13} strokeWidth={2.4} className="shrink-0" aria-hidden />
        {count > 0 ? count : "—"}
      </button>

      {open && (
        <>
          {/* Click-away, only once the panel is PINNED. A hover-opened panel
              closes itself on the way out, and a full-screen overlay under a
              merely-hovered popover would swallow clicks meant for the row. */}
          {pinned && (
            <button
              type="button"
              aria-label="Close attachments"
              onClick={close}
              className="fixed inset-0 z-[40] cursor-default"
            />
          )}
          {/* PADDING rather than a margin, either way up: the gap between the
              trigger and the panel has to be INSIDE the hover area, or
              crossing it counts as leaving and the panel shuts in your face. */}
          <div
            className={`absolute right-0 z-[41] ${below ? "top-full pt-1" : "bottom-full pb-1"}`}
          >
            <div className="w-[320px] rounded-xl border border-hairline-strong bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="text-ink-subtle hover:text-ink-strong"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>
              <PlanAttachmentPanel
                nodeId={nodeId}
                canManage={canManage}
                onCountChange={setCount}
                onPickerOpen={() => setPinned(true)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The file list and its uploader — everything the Attachments popover shows,
 * and the same block the row's Edit dialog embeds.
 *
 * ONE COPY, because these are the same files: a list, a signed link each, a
 * delete each, and one upload button. Two implementations would eventually
 * disagree about what "removed" means, and the dialog is where people go to
 * fill a row in — being sent to a different screen for its files is exactly the
 * split this module keeps closing.
 *
 * It loads ITSELF on mount. That is what makes it cheap to embed: the register
 * still pays one batched count query for the whole page, and the round-trip for
 * real URLs happens only where this panel is actually rendered.
 */
export function PlanAttachmentPanel({
  nodeId,
  canManage,
  onCountChange,
  onPickerOpen,
}: {
  nodeId: string;
  canManage: boolean;
  /** Told the new total after every upload and delete. */
  onCountChange?: (count: number) => void;
  /** Fired just before the OS file picker opens — see the pin note on the cell. */
  onPickerOpen?: () => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [files, setFiles] = React.useState<PlanAttachmentView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // The latest callback, without making it a dependency of the fetch — a
  // caller passing an inline arrow would otherwise re-run the load on every
  // render of the dialog this panel sits in.
  const report = React.useRef(onCountChange);
  React.useEffect(() => { report.current = onCountChange; });

  /** Push one list result into state. Shared by the first read and by the
   *  reloads that follow an upload or a delete, so there is one place that
   *  decides what an error, an empty list and a full one look like. */
  const applyResult = React.useCallback(
    (res: Awaited<ReturnType<typeof listPlanAttachments>> | null) => {
      if (res === null) {
        setError("Could not load the attachments.");
        setFiles([]);
      } else if (!res.ok) {
        setError(res.error);
        setFiles([]);
      } else {
        setError(null);
        setFiles(res.files);
        report.current?.(res.files.length);
      }
      setLoading(false);
    },
    [],
  );

  /** Re-read after a write, spinner and all. */
  const reload = React.useCallback(async () => {
    setLoading(true);
    applyResult(await listPlanAttachments(nodeId).catch(() => null));
  }, [nodeId, applyResult]);

  // Moved to a different row — reset DURING RENDER rather than in an effect,
  // the same pattern the cell's count uses above, so the panel never paints
  // one row's files under another row's name.
  const [lastNodeId, setLastNodeId] = React.useState(nodeId);
  if (lastNodeId !== nodeId) {
    setLastNodeId(nodeId);
    setFiles(null);
    setError(null);
    setLoading(true);
  }

  // THE FIRST READ. `loading` already starts true, so nothing is set
  // synchronously here — state moves only once the fetch answers, and `alive`
  // drops a reply that arrives after the panel closed or changed row.
  React.useEffect(() => {
    let alive = true;
    void listPlanAttachments(nodeId)
      .catch(() => null)
      .then((res) => { if (alive) applyResult(res); });
    return () => { alive = false; };
  }, [nodeId, applyResult]);

  /**
   * Upload everything that was picked, ONE AT A TIME.
   *
   * Sequential rather than `Promise.all`: each upload re-counts the row's
   * files server-side, and firing five together would have five writes racing
   * over the same count. It also means a rejected file (over 20 MB, say) stops
   * being a mystery — the toast names it, and the others still land.
   */
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Clear immediately so picking the SAME file twice still fires a change.
    e.target.value = "";
    if (picked.length === 0) return;

    setBusy(true);
    const failed: string[] = [];
    let done = 0;
    try {
      for (const file of picked) {
        try {
          const fd = new FormData();
          fd.set("nodeId", nodeId);
          fd.set("file", file);
          const res = await uploadPlanAttachment(fd);
          if (res.ok) {
            done++;
            report.current?.(res.count);
          } else {
            failed.push(`${file.name} — ${res.error}`);
          }
        } catch {
          failed.push(`${file.name} — that upload didn't go through`);
        }
      }
      await reload();
      if (done > 0) {
        fireToast({
          message: picked.length === 1
            ? `Attached ${picked[0]!.name}.`
            : `Attached ${done} of ${picked.length} files.`,
          type: "success",
        });
      }
      if (failed.length > 0) {
        fireToast({ message: failed.join(" · "), type: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    setBusy(true);
    try {
      const res = await deletePlanAttachment(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      report.current?.(res.count);
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== id));
      fireToast({ message: `Removed ${name}.`, type: "success" });
    } catch {
      fireToast({ message: "That delete didn't go through.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {loading && (
        <p className="flex items-center gap-2 py-3 text-[13px] font-medium text-ink-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Loading…
        </p>
      )}

      {!loading && error && (
        <p className="py-3 text-[13px] font-medium text-[#B4160E]">{error}</p>
      )}

      {!loading && !error && files?.length === 0 && (
        <p className="py-3 text-[13px] font-medium text-ink-muted">
          Nothing attached yet.
        </p>
      )}

      {!loading && !error && !!files?.length && (
        <ul className="mb-2 max-h-[210px] space-y-1 overflow-auto">
          {files.map((f) => {
            const size = formatSize(f.sizeBytes);
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-soft">
                <FileText size={13} className="shrink-0 text-ink-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[12.5px] font-semibold text-ink-strong hover:underline"
                      title={`${f.fileName}${f.uploadedByName ? ` — ${f.uploadedByName}` : ""}`}
                    >
                      {f.fileName}
                    </a>
                  ) : (
                    // The row exists but its object has gone from the bucket.
                    // Say so rather than render a link that 404s.
                    <span
                      className="block truncate text-[12.5px] font-medium text-ink-subtle"
                      title="This file is missing from storage"
                    >
                      {f.fileName} (missing)
                    </span>
                  )}
                  {(size || f.uploadedByName) && (
                    <span className="block truncate text-[11px] font-medium text-ink-subtle">
                      {[size, f.uploadedByName].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {/* VIEW or DOWNLOAD, whichever this file can actually do.
                    A PDF or an image opens in a tab; a spreadsheet cannot be
                    rendered by a browser, so the button says Download rather
                    than promising a view and delivering a save dialog.
                    `isPreviewable` is the same allow-list the serving route
                    uses to decide inline vs attachment, so the label and the
                    response can never disagree. */}
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${isPreviewable(f.fileName) ? "View" : "Download"} ${f.fileName}`}
                    title={
                      isPreviewable(f.fileName)
                        ? `View ${f.fileName}${isPdf(f.fileName) ? " (PDF)" : ""}`
                        : `Download ${f.fileName}`
                    }
                    className="shrink-0 text-ink-subtle transition-colors hover:text-ink-strong"
                  >
                    {isPreviewable(f.fileName) ? (
                      <Eye size={13} strokeWidth={2.2} />
                    ) : (
                      <Download size={13} strokeWidth={2.2} />
                    )}
                  </a>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void remove(f.id, f.fileName)}
                    disabled={busy}
                    aria-label={`Remove ${f.fileName}`}
                    title={`Remove ${f.fileName}`}
                    className="shrink-0 text-ink-subtle transition-colors hover:text-[#B4160E] disabled:opacity-40"
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            onChange={onPick}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => {
              onPickerOpen?.();
              fileInput.current?.click();
            }}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-hairline-strong px-2 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Upload size={13} strokeWidth={2.2} aria-hidden />
            )}
            Add files
          </button>
          <p className="mt-1.5 text-center text-[11px] font-medium text-ink-subtle">
            Pick several at once · up to 20 MB each
          </p>
        </>
      )}
    </>
  );
}
