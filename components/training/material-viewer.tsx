"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Check, Loader2, Download, ExternalLink, GraduationCap, Archive, Trash2, RotateCcw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { markWatched, archiveMaterial, deleteMaterial } from "@/app/(app)/training/actions";
import type { TcMaterialDetail } from "@/lib/queries/training";

function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-[14.5px] font-semibold text-ink-strong">{children}</div>
    </div>
  );
}

export function MaterialViewer({
  material,
  createdByNames,
  assistedByNames,
  inductionDeptNames,
  canManage = false,
}: {
  material: TcMaterialDetail;
  createdByNames: string[];
  assistedByNames: string[];
  inductionDeptNames: string[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [watched, setWatched] = React.useState(material.watchedByMe);
  const [marking, setMarking] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onArchive() {
    setBusy("arch");
    const res = await archiveMaterial(material.id, !material.archived);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: material.archived ? "Restored." : "Archived.", type: "success" });
    router.refresh();
  }
  async function onDelete() {
    if (!confirm("Delete this material permanently? Its tests, questions and all attempt/watch records are removed too. This can't be undone.")) return;
    setBusy("del");
    const res = await deleteMaterial(material.id);
    if (!res.ok) {
      setBusy(null);
      return fireToast({ message: res.error, type: "error" });
    }
    fireToast({ message: "Deleted.", type: "success" });
    router.push("/training" as Route);
    router.refresh();
  }

  async function onMarkWatched() {
    if (watched || marking) return;
    setMarking(true);
    const res = await markWatched(material.id);
    setMarking(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setWatched(true);
    fireToast({ message: "Marked as watched.", type: "success" });
    router.refresh();
  }

  const embed = material.videoUrl ? embedUrl(material.videoUrl) : null;

  return (
    <div className="grid grid-cols-[1.6fr_1fr] gap-6 max-lg:grid-cols-1 items-start">
      {/* LEFT — the content */}
      <section className="rounded-section border border-hairline bg-surface-card p-5 max-md:p-4" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <div className="overflow-hidden rounded-xl border border-hairline bg-black/[0.02]">
          {/* Uploaded video */}
          {material.fileType === "video" && material.fileUrl ? (
            <video controls className="w-full" style={{ maxHeight: 520 }} src={material.fileUrl} />
          ) : material.fileType === "pdf" && material.fileUrl ? (
            <iframe title="Material PDF" src={material.fileUrl} className="w-full" style={{ height: 600, border: 0 }} />
          ) : embed ? (
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe title="Material video" src={embed} allow="accelerated-rotation; autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
            </div>
          ) : material.fileType === "xls" && material.fileUrl ? (
            <div className="flex flex-col items-center gap-3 py-14">
              <Table2Icon />
              <a href={material.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-surface-track px-5 py-3 text-[15px] font-bold text-ink-strong hover:bg-surface-soft">
                <Download size={17} strokeWidth={2.4} /> Download Spreadsheet
              </a>
            </div>
          ) : material.videoUrl ? (
            <div className="flex flex-col items-center gap-3 py-14">
              <a href={material.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-surface-track px-5 py-3 text-[15px] font-bold text-ink-strong hover:bg-surface-soft">
                <ExternalLink size={17} strokeWidth={2.4} /> Open Video
              </a>
            </div>
          ) : (
            <div className="py-14 text-center text-[14px] font-semibold text-ink-subtle">No previewable content.</div>
          )}
        </div>

        {material.notes && (
          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-soft">{material.notes}</p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3 border-t border-hairline pt-4">
          {watched ? (
            <span className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}>
              <Check size={16} strokeWidth={3} /> Watched
            </span>
          ) : (
            <button type="button" onClick={onMarkWatched} disabled={marking} className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-[14.5px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              {marking ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} Mark as Watched
            </button>
          )}
        </div>
      </section>

      {/* RIGHT — metadata */}
      <aside className="rounded-section border border-hairline bg-surface-card p-5 flex flex-col gap-4" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        {material.subject && <Meta label="Subject">{material.subject}</Meta>}
        {material.los && <Meta label="LOS">{material.los}</Meta>}
        {material.version && <Meta label="Version">{material.version}{material.versionNotes ? <span className="block text-[13px] font-medium text-ink-subtle">{material.versionNotes}</span> : null}</Meta>}
        {createdByNames.length > 0 && <Meta label="Created by">{createdByNames.join(", ")}</Meta>}
        {assistedByNames.length > 0 && <Meta label="Assisted by">{assistedByNames.join(", ")}</Meta>}
        {material.partOfInduction && (
          <Meta label="Induction">
            <span className="inline-flex items-center gap-1.5"><GraduationCap size={15} style={{ color: "var(--color-purple-deep)" }} /> {inductionDeptNames.length ? inductionDeptNames.join(", ") : "All flagged departments"}</span>
          </Meta>
        )}
        <Meta label="Added on">{material.addedOn}</Meta>

        {canManage && (
          <div className="mt-1 flex gap-2 border-t border-hairline pt-4">
            <button type="button" onClick={onArchive} disabled={busy !== null} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline-strong bg-white py-2.5 text-[13.5px] font-bold text-ink-soft hover:border-ink-subtle disabled:opacity-50">
              {busy === "arch" ? <Loader2 size={14} className="animate-spin" /> : material.archived ? <RotateCcw size={14} /> : <Archive size={14} />} {material.archived ? "Restore" : "Archive"}
            </button>
            <button type="button" onClick={onDelete} disabled={busy !== null} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2.5 text-[13.5px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red disabled:opacity-50" aria-label="Delete material">
              {busy === "del" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        )}
        {material.archived && (
          <div className="rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}>
            <span className="inline-flex items-center gap-1.5"><Archive size={13} /> Archived — hidden from learners.</span>
          </div>
        )}
      </aside>
    </div>
  );
}

function Table2Icon() {
  return <Download size={28} strokeWidth={1.8} style={{ color: "var(--color-ink-subtle)" }} />;
}
