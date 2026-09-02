"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, ExternalLink, FileArchive } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { CaReturnRow } from "@/lib/accounts/ca-constants";
import { deleteReturn } from "@/app/(app)/accounts/ca-handover/actions";
import { ReturnDialog } from "./return-dialog";

/** The document-link columns, grouped for display. `key` matches CaReturnRow. */
export const IT_DOC_FIELDS: { key: keyof CaReturnRow; label: string }[] = [
  { key: "itrV", label: "ITR-V" },
  { key: "filedComputation", label: "Filed Computation" },
  { key: "filedItrForm", label: "Filed ITR Form" },
  { key: "balanceSheet", label: "Balance Sheet" },
  { key: "pnl", label: "P&L" },
  { key: "taxAuditReport", label: "Tax Audit Report" },
  { key: "selfAssessmentChallan", label: "Self-Assessment Challan" },
  { key: "form26as", label: "26AS" },
  { key: "ais", label: "AIS" },
  { key: "assessmentOrder", label: "Assessment Order" },
  { key: "refundAsPerReturn", label: "Refund as per Return" },
  { key: "refundReceived", label: "Refund Received" },
];

export const GST_DOC_FIELDS: { key: keyof CaReturnRow; label: string }[] = [
  { key: "gstr1", label: "GSTR-1" },
  { key: "gstr3b", label: "GSTR-3B" },
  { key: "gstr2b", label: "GSTR-2B" },
  { key: "gstWorkingExcel", label: "GST Working Excel" },
  { key: "gstr9", label: "GSTR-9" },
];

export function ReturnsArchive({ rows }: { rows: CaReturnRow[] }) {
  const [editing, setEditing] = React.useState<CaReturnRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(20px, 2vw, 26px)",
              letterSpacing: "-0.02em",
            }}
          >
            Returns Archive
          </h2>
          <p className="mt-0.5 text-ink-muted font-medium" style={{ fontSize: 13.5 }}>
            Filed income-tax &amp; GST documents per financial year and entity — {rows.length} record{rows.length === 1 ? "" : "s"}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="wg-btn wg-sheen cursor-pointer inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          <Plus size={15} strokeWidth={2.6} /> Add FY Record
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-section border border-hairline bg-surface-card px-6 py-12 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          <FileArchive size={28} strokeWidth={2} className="mx-auto mb-3 text-ink-subtle" aria-hidden />
          <p className="text-ink-muted font-medium" style={{ fontSize: 14.5 }}>
            No returns archived yet. Click “Add FY record” to start one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {rows.map((r) => (
            <ReturnCard key={r.id} row={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ReturnDialog
          row={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}

function ReturnCard({ row, onEdit }: { row: CaReturnRow; onEdit: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  function remove() {
    if (!confirm(`Delete the returns record for ${row.entityName} (FY ${row.fy})?`)) return;
    setDeleting(true);
    deleteReturn(row.id)
      .then((res) => {
        setDeleting(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: "Record deleted." });
        router.refresh();
      })
      .catch((e) => {
        setDeleting(false);
        fireToast({ message: e instanceof Error ? e.message : "Failed.", type: "error" });
      });
  }

  return (
    <div className="rounded-section border border-hairline bg-surface-card overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-hairline">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
            {row.entityName}
          </h3>
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "rgba(225,6,0,0.08)", color: "var(--color-altus-red-deep)" }}>
            FY {row.fy}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEdit} aria-label="Edit record" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer">
            <Pencil size={15} />
          </button>
          <button type="button" onClick={remove} disabled={deleting} aria-label="Delete record" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer disabled:opacity-50">
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px max-md:grid-cols-1" style={{ background: "var(--color-hairline)" }}>
        <DocGroup title="Income Tax" fields={IT_DOC_FIELDS} row={row} />
        <DocGroup title="GST" fields={GST_DOC_FIELDS} row={row} />
      </div>

      {row.note && (
        <div className="px-5 py-3 border-t border-hairline text-ink-muted font-medium" style={{ fontSize: 13, background: "var(--color-surface-soft)" }}>
          {row.note}
        </div>
      )}
    </div>
  );
}

function DocGroup({
  title,
  fields,
  row,
}: {
  title: string;
  fields: { key: keyof CaReturnRow; label: string }[];
  row: CaReturnRow;
}) {
  return (
    <div className="bg-surface-card p-5">
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">{title}</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 max-md:grid-cols-1 list-none m-0 p-0">
        {fields.map((f) => {
          const val = row[f.key] as string | null;
          return (
            <li key={String(f.key)} className="flex items-center justify-between gap-2 border-b border-solid pb-1.5" style={{ borderColor: "var(--color-hairline)" }}>
              <span className="text-ink-soft font-semibold" style={{ fontSize: 12.5 }}>{f.label}</span>
              {val ? (
                <a href={val} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-altus-red hover:underline shrink-0" style={{ fontSize: 12.5 }}>
                  Open <ExternalLink size={12} strokeWidth={2.4} />
                </a>
              ) : (
                <span className="text-ink-subtle shrink-0" style={{ fontSize: 12.5 }}>—</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
