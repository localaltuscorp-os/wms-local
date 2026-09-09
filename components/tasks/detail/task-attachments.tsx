"use client";

/**
 * Task Attachments card. Renders a task's files as a horizontal strip of
 * cards (click opens the short-TTL signed URL in a new tab), with hover-to-
 * delete and, when editable, a dashed add tile backed by a hidden file input.
 * Uploads go through the attachment Server Actions and refresh the
 * server-rendered list.
 *
 * Images get a hover lightbox. It is positioned `fixed` off a measured
 * `getBoundingClientRect()` rather than `absolute` inside the card, because the
 * strip is an `overflow-x-auto` scroller — an absolutely positioned popover
 * would be clipped by it on every axis, which is the whole reason a preview
 * that "works" in isolation shows up as a sliver in a scrolling row.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileImage, File as FileIcon, Loader2, Plus, Trash2 } from "lucide-react";
import type { AttachmentView } from "@/lib/queries/task-detail-extras";
import { uploadTaskAttachment, deleteTaskAttachment } from "@/app/(app)/tasks/attachment-actions";
import { fireToast } from "@/lib/toast";

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  const rounded = u === 0 ? n : Math.round(n * 10) / 10;
  return `${rounded} ${units[u]}`;
}

function FileTypeIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith("image/")) {
    return <FileImage className="h-5 w-5 text-violet-600" aria-hidden />;
  }
  if (mime === "application/pdf") {
    return <FileText className="h-5 w-5 text-altus-red" aria-hidden />;
  }
  return <FileIcon className="h-5 w-5 text-ink-subtle" aria-hidden />;
}

/** The hovered image and where on screen to hang its preview. */
type Preview = { id: string; url: string; name: string; left: number; top: number };

export function TaskAttachments({
  taskId,
  items,
  canEdit,
}: {
  taskId: string;
  items: AttachmentView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    // CLEAR THE PICKER NOW, before any await — not on the way out.
    //
    // A file input fires `change` only when its value actually CHANGES, so
    // leaving the last pick sitting in it makes re-selecting the SAME file a
    // silent no-op: the dialog opens, you choose the file, and literally
    // nothing happens. That is what a failed first attempt looked like from
    // the outside, because the old reset ran only on paths that returned —
    // never on the ones that threw. Resetting up front means every path,
    // including the ones that blow up, leaves the control ready for the next
    // pick.
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("file", file);
    setUploading(true);
    startTransition(async () => {
      try {
        const res = await uploadTaskAttachment(fd);
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        router.refresh();
      } catch {
        // A THROW IS NOT A RETURNED ERROR, and this call site only handled the
        // second kind. The action REJECTS when the request never reaches it at
        // all — the host's own request-body cap (Vercel rejects around 4.5 MB,
        // far below the 20 MB the action itself allows), a dropped connection,
        // a 500 from the framework. Unhandled, that left `uploading` stuck true
        // forever: the tile read "Uploading…", stayed `disabled` so it could not
        // even be clicked again, and explained nothing. The only way out was a
        // page reload, which is why this reads as "I can't attach files" rather
        // than as one upload that failed.
        fireToast({
          message: `Could not upload "${file.name}" — the server did not accept the request. If it is a large file, try one under 4 MB.`,
          type: "error",
        });
      } finally {
        // Whatever happened, the tile goes back to being a button.
        setUploading(false);
      }
    });
  }

  function handleDelete(id: string) {
    // DROP THE PREVIEW FIRST. Deleting unmounts the card while the pointer is
    // still resting on it, so its `onMouseLeave` — the only thing that used to
    // clear this — never fires. The lightbox is `fixed`, so it does not go with
    // its card: it stayed pinned mid-screen, showing an image that no longer
    // exists, until you happened to hover another attachment.
    setPreview((prev) => (prev?.id === id ? null : prev));
    startTransition(async () => {
      const res = await deleteTaskAttachment(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      router.refresh();
    });
  }

  const isEmpty = items.length === 0;

  // A PREVIEW MAY NEVER OUTLIVE ITS ROW. The clear above handles the delete
  // this component started, but not a row that disappears any other way — a
  // refresh landing someone else's delete, or a re-render that drops it. Both
  // leave the same orphaned popover, so the render reads through `items` rather
  // than trusting the stored id, and the state can only ever paint something
  // that is still on screen. The signed URL is dead the moment the object is,
  // so a stale preview could not render anything but a broken image anyway.
  const livePreview = preview && items.some((a) => a.id === preview.id) ? preview : null;

  return (
    <section className="rounded-2xl border border-[#EBE7E0] bg-white p-4 shadow-xs">
      {/* Hover lightbox. `pointer-events-none` so it can never sit between the
          cursor and the card that spawned it — which would flicker it on and
          off as the two fought over the pointer. */}
      {livePreview && (
        <div
          className="pointer-events-none fixed z-[80] w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-[#EBE7E0] bg-white p-1.5 shadow-2xl"
          style={{ left: livePreview.left, top: livePreview.top - 8 }}
        >
          <img
            src={livePreview.url}
            alt=""
            className="h-40 w-full rounded-lg bg-[#F7F4EF] object-contain"
          />
          <p className="truncate px-1 pt-1.5 text-[11px] font-medium text-slate-500" title={livePreview.name}>
            {livePreview.name}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
          <FileIcon className="h-4 w-4 text-slate-400" aria-hidden />
          Attachments
        </h3>
        {items.length > 0 && (
          <span className="text-xs font-medium tabular-nums text-ink-muted">{items.length}</span>
        )}
      </div>

      {isEmpty && !canEdit ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#E6E1D8] bg-[#F7F4EF] px-3 py-6 text-center text-sm text-slate-500">
          No attachments.
        </p>
      ) : (
        // A horizontal shelf, not a grid: attachments are a short list read
        // left-to-right, and a 2-col grid made three files occupy two rows of
        // half-empty cards. `-mx-1 px-1` keeps focus rings from being clipped
        // by the scroller's own edge.
        <div className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
          {items.map((att) => (
            <div
              key={att.id}
              onMouseEnter={(e) => {
                if (!att.mime?.startsWith("image/") || !att.url) return;
                const r = e.currentTarget.getBoundingClientRect();
                setPreview({
                  id: att.id,
                  url: att.url,
                  name: att.fileName,
                  left: r.left + r.width / 2,
                  top: r.top,
                });
              }}
              onMouseLeave={() => setPreview((prev) => (prev?.id === att.id ? null : prev))}
              className="group relative flex w-[230px] shrink-0 snap-start items-center gap-3 rounded-xl border border-[#E6E1D8] bg-[#F7F4EF] p-3 transition-colors hover:bg-white"
            >
              <a
                href={att.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!att.url}
                className="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 rounded-lg"
                onClick={(e) => {
                  if (!att.url) e.preventDefault();
                }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#E6E1D8] bg-white">
                  <FileTypeIcon mime={att.mime} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800" title={att.fileName}>
                    {att.fileName}
                  </span>
                  <span className="block text-xs tabular-nums text-slate-500">
                    {formatBytes(att.sizeBytes)}
                    {att.uploadedByName ? ` · ${att.uploadedByName}` : ""}
                  </span>
                </span>
              </a>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(att.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-opacity hover:bg-altus-red/10 hover:text-altus-red focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 group-hover:opacity-100 disabled:opacity-60"
                  aria-label={`Delete ${att.fileName}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || isPending}
              className="flex min-h-[68px] w-[150px] shrink-0 snap-start items-center justify-center gap-2 rounded-xl border border-dashed border-[#E6E1D8] bg-white px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-[#B80D22]/40 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Add attachment"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add file
                </>
              )}
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      )}
    </section>
  );
}
