"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  FileSignature, BadgeCheck, IndianRupee, TrendingUp, ShieldCheck,
  ClipboardList, Files, Plus, Eye, Download, Archive, Trash2, ArchiveRestore,
  ChevronLeft, Calendar, type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import { DOC_TYPES, docTypeMeta, type DossierDocType } from "@/lib/dossier/types";
import { formatDate } from "@/lib/format";
import type { EmployeeDossier, DossierDoc } from "@/lib/queries/dossier";
import { DocViewer, type ViewerDoc } from "./doc-viewer";
import { UploadDialog } from "./upload-dialog";
import { setEmployeeDocumentArchived, deleteEmployeeDocument } from "@/app/(app)/dossier/actions";

const ICONS: Record<string, LucideIcon> = {
  FileSignature, BadgeCheck, IndianRupee, TrendingUp, ShieldCheck, ClipboardList, Files,
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(iso);
}
function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function EmployeeDossierView({
  data,
  isAdmin,
  backHref,
}: {
  data: EmployeeDossier;
  isAdmin: boolean;
  backHref: string | null;
}) {
  const [viewer, setViewer] = React.useState<ViewerDoc | null>(null);
  const [uploadFor, setUploadFor] = React.useState<DossierDocType | null>(null);

  const byType = React.useMemo(() => {
    const m = new Map<string, DossierDoc[]>();
    for (const d of data.docs) m.set(d.docType, [...(m.get(d.docType) ?? []), d]);
    return m;
  }, [data.docs]);

  const totalDocs = data.docs.filter((d) => !d.archived).length;

  return (
    <div className="flex flex-col gap-5">
      {/* profile header */}
      <div
        className="wg-rise flex flex-wrap items-center gap-4 rounded-[24px] bg-surface-card p-6 max-md:p-5"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 12px 40px -28px rgba(15,23,42,0.35)" }}
      >
        {backHref && (
          <Link href={backHref as Route} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink-muted hover:text-ink-strong" aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2.4} />
          </Link>
        )}
        <Avatar name={data.employee.name} avatarUrl={data.employee.avatarUrl} size={58} />
        <div className="min-w-0 flex-1">
          <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 900, fontSize: "clamp(22px,2.4vw,30px)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            {data.employee.name}
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold text-ink-muted">
            {data.employee.designation ?? "—"} · <span className="tabular-nums">{totalDocs}</span> document{totalDocs === 1 ? "" : "s"} on file
          </div>
        </div>
      </div>

      {/* sections */}
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {DOC_TYPES.map((meta, i) => {
          const docs = byType.get(meta.key) ?? [];
          const Icon = ICONS[meta.icon] ?? Files;
          return (
            <section
              key={meta.key}
              className="wg-rise flex flex-col rounded-[22px] bg-surface-card p-5"
              style={{ animationDelay: `${i * 45}ms`, boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 8px 30px -24px rgba(15,23,42,0.3)" }}
            >
              {/* section head */}
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[13px]" style={{ background: `color-mix(in srgb, ${meta.accent} 12%, transparent)`, color: meta.accent }}>
                  <Icon size={19} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black text-ink-strong">{meta.label}</div>
                  <div className="text-[12px] font-medium text-ink-subtle">{meta.hint}</div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setUploadFor(meta.key)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ background: `linear-gradient(135deg, ${meta.accent}, color-mix(in srgb, ${meta.accent} 70%, black))` }}
                    title={`Add ${meta.label}`}
                    aria-label={`Add ${meta.label}`}
                  >
                    <Plus size={16} strokeWidth={2.6} />
                  </button>
                )}
              </div>

              {/* onboarding form CTA — the structured fillable form lives here */}
              {meta.key === "onboarding" && (
                <Link
                  href={`/dossier/onboarding?emp=${data.employee.id}` as Route}
                  className="mt-3 inline-flex w-fit items-center gap-2 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${meta.accent}, color-mix(in srgb, ${meta.accent} 70%, black))` }}
                >
                  <ClipboardList size={14} strokeWidth={2.4} /> Open Onboarding Form
                </Link>
              )}

              {/* docs */}
              <div className="mt-3 flex flex-col gap-2">
                {docs.length === 0 ? (
                  <div className="rounded-xl border border-solid border-hairline-strong px-3.5 py-3 text-[13px] font-medium text-ink-subtle">
                    No document yet.
                  </div>
                ) : (
                  docs.map((d) => (
                    <DocRow
                      key={d.id}
                      doc={d}
                      accent={meta.accent}
                      isAdmin={isAdmin}
                      onView={() => setViewer({ title: d.title, fileName: d.fileName, mimeType: d.mimeType, signedUrl: d.signedUrl })}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {viewer && <DocViewer doc={viewer} onClose={() => setViewer(null)} />}
      {uploadFor && (
        <UploadDialog
          employeeId={data.employee.id}
          employeeName={data.employee.name}
          presetDocType={uploadFor}
          onClose={() => setUploadFor(null)}
        />
      )}
    </div>
  );
}

function DocRow({
  doc, accent, isAdmin, onView,
}: {
  doc: DossierDoc;
  accent: string;
  isAdmin: boolean;
  onView: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const date = fmtDate(doc.effectiveDate);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { fireToast({ message: res.error ?? "Failed", type: "error" }); return; }
    fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  return (
    <div
      className="group flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition"
      style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <button type="button" onClick={onView} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13.5px] font-bold text-ink-strong group-hover:text-[color:var(--color-altus-red)]">{doc.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] font-medium text-ink-subtle">
          {date && <span className="inline-flex items-center gap-1 tabular-nums"><Calendar size={11} />{date}</span>}
          <span className="truncate">{doc.fileName}</span>
          {doc.sizeBytes ? <span className="tabular-nums">{fmtSize(doc.sizeBytes)}</span> : null}
          {doc.archived && <span className="rounded-full bg-ink-subtle/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-ink-subtle">Archived</span>}
        </div>
      </button>

      <div className="flex items-center gap-1">
        <IconBtn title="View" onClick={onView} accent={accent}><Eye size={15} strokeWidth={2.3} /></IconBtn>
        {doc.signedUrl && (
          <a href={doc.signedUrl} download={doc.fileName} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle hover:bg-white hover:text-ink-strong" title="Download">
            <Download size={15} strokeWidth={2.3} />
          </a>
        )}
        {isAdmin && !doc.archived && (
          <IconBtn title="Archive" disabled={busy} onClick={() => act(() => setEmployeeDocumentArchived(doc.id, true), "Archived")}><Archive size={15} strokeWidth={2.3} /></IconBtn>
        )}
        {isAdmin && doc.archived && (
          <IconBtn title="Restore" disabled={busy} onClick={() => act(() => setEmployeeDocumentArchived(doc.id, false), "Restored")}><ArchiveRestore size={15} strokeWidth={2.3} /></IconBtn>
        )}
        {isAdmin && (
          <IconBtn title="Delete" danger disabled={busy} onClick={() => {
            if (!window.confirm(`Delete "${doc.title}" permanently? This removes the file.`)) return;
            void act(() => deleteEmployeeDocument(doc.id), "Deleted");
          }}><Trash2 size={15} strokeWidth={2.3} /></IconBtn>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children, onClick, title, danger, accent, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle transition hover:bg-white disabled:opacity-40"
      style={{ color: danger ? "var(--color-altus-red)" : accent ? undefined : undefined }}
    >
      {children}
    </button>
  );
}
