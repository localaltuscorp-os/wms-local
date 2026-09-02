"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, MoreHorizontal, Archive, ArchiveRestore, Trash2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  setModuleAdminFields,
  decideModule,
  setModuleArchived,
  deleteModuleSubmission,
} from "@/app/(app)/forms/actions";
import { visibleFields, fieldPairs, type FormFieldDef } from "@/lib/forms/field-types";
import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import { formatDate } from "@/lib/format";
import { Field, FieldInput } from "./form-fields";

type Status = "pending" | "approved" | "rejected";

const PENDING_STYLE = { bg: "rgba(245,158,11,0.12)", fg: "#B45309" };
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: PENDING_STYLE,
  approved: { bg: "rgba(22,163,74,0.12)", fg: "#15803D" },
  rejected: { bg: "rgba(225,6,0,0.10)", fg: "#A80400" },
};

export function ModuleList({
  rows,
  isAdmin,
  requestFields,
  adminFields,
  productOptions,
  grantLabel = "Approve",
  approvedLabel = "Approved",
  view = "active",
  primaryKey,
}: {
  rows: ModuleSubmissionRow[];
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  grantLabel?: string;
  approvedLabel?: string;
  view?: "active" | "archived";
  /** request field key shown as the card's headline (e.g. expense_for). */
  primaryKey?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[15px] text-ink-subtle">{view === "archived" ? "Nothing archived." : "No submissions yet."}</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} row={r} isAdmin={isAdmin} requestFields={requestFields} adminFields={adminFields}
          productOptions={productOptions} grantLabel={grantLabel} approvedLabel={approvedLabel} view={view} primaryKey={primaryKey} />
      ))}
    </ul>
  );
}

function Card({
  row, isAdmin, requestFields, adminFields, productOptions, grantLabel, approvedLabel, view, primaryKey,
}: {
  row: ModuleSubmissionRow;
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  grantLabel: string;
  approvedLabel: string;
  view: "active" | "archived";
  primaryKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const style = STATUS_STYLE[row.status] ?? PENDING_STYLE;
  const statusText = row.status === "approved" ? approvedLabel : row.status === "rejected" ? "Rejected" : "Pending";

  const headline =
    (primaryKey && row.fields[primaryKey]) ||
    requestFields.map((f) => row.fields[f.key]).find((v) => v) ||
    "Submission";

  const pairs = fieldPairs(visibleFields(requestFields, row.fields), row.fields);
  const adminPairs = fieldPairs(adminFields, row.adminFields);

  function decide(status: Status) {
    start(async () => {
      const res = await decideModule({ id: row.id, status });
      fireToast(res.ok
        ? { message: status === "approved" ? `${approvedLabel}.` : status === "rejected" ? "Rejected." : "Reopened.", type: status === "rejected" ? "info" : "success" }
        : { message: res.error, type: "error" });
    });
  }

  return (
    <li className="rounded-section bg-surface-card p-5 max-md:p-4" style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[16px] font-semibold text-ink-strong break-words">{headline}</span>
            <span className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold" style={{ background: style.bg, color: style.fg }}>{statusText}</span>
          </div>
          <p className="text-[13.5px] text-ink-subtle mt-1">
            {isAdmin ? `${row.employeeName} · ` : ""}{formatDate(row.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && row.status !== "approved" && (
            <button type="button" disabled={pending} onClick={() => decide("approved")}
              className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
              {grantLabel}
            </button>
          )}
          {isAdmin && row.status !== "rejected" && (
            <button type="button" disabled={pending} onClick={() => decide("rejected")}
              className="rounded-md px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50" style={{ background: "rgba(225,6,0,0.08)", color: "#A80400", border: "1px solid rgba(225,6,0,0.25)" }}>
              Reject
            </button>
          )}
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-soft">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Details
          </button>
          {isAdmin && <CardMenu row={row} view={view} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-hairline)" }}>
          <dl className="grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-2.5">
            {pairs.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</dt>
                <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {!isAdmin && adminPairs.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-2.5">
              {adminPairs.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] font-semibold uppercase tracking-wide text-altus-red">{label}</dt>
                  <dd className="text-[14.5px] text-ink-strong mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {isAdmin && adminFields.length > 0 && (
            <AdminPanel row={row} adminFields={adminFields} productOptions={productOptions} />
          )}
        </div>
      )}
    </li>
  );
}

function AdminPanel({ row, adminFields, productOptions }: { row: ModuleSubmissionRow; adminFields: FormFieldDef[]; productOptions: string[] }) {
  const [values, setValues] = useState<Record<string, string>>(row.adminFields ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setValue = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));
  const visible = visibleFields(adminFields, values);

  function save() {
    setError(null);
    start(async () => {
      const res = await setModuleAdminFields({ id: row.id, adminFields: values });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: "Saved." });
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-hairline p-4 bg-black/[0.015]">
      <p className="text-[12px] font-black uppercase tracking-[0.05em] text-altus-red mb-3">Admin · Response</p>
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
        {visible.map((f) => (
          <Field key={f.key} label={f.label} required={f.required}>
            <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} productOptions={productOptions} isAdmin />
          </Field>
        ))}
      </div>
      {error && <div role="alert" className="mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#A80400]">{error}</div>}
      <button type="button" onClick={save} disabled={pending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
        <Check size={14} /> {pending ? "Saving…" : "Save response"}
      </button>
    </div>
  );
}

function CardMenu({ row, view }: { row: ModuleSubmissionRow; view: "active" | "archived" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function archive(next: boolean) {
    setOpen(false);
    start(async () => {
      const res = await setModuleArchived({ id: row.id, archived: next });
      fireToast(res.ok ? { message: next ? "Archived." : "Restored.", type: "success" } : { message: res.error, type: "error" });
    });
  }
  function remove() {
    setOpen(false);
    if (!confirm("Delete this submission permanently?")) return;
    start(async () => {
      const res = await deleteModuleSubmission({ id: row.id });
      fireToast(res.ok ? { message: "Deleted.", type: "success" } : { message: res.error, type: "error" });
    });
  }

  return (
    <div className="relative">
      <button type="button" disabled={pending} onClick={() => setOpen((v) => !v)} aria-label="More actions"
        className="inline-flex items-center justify-center size-9 rounded-md text-ink-soft hover:bg-surface-soft disabled:opacity-50">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-hairline bg-white p-1.5 shadow-xl" style={{ boxShadow: "0 12px 28px -10px rgba(15,23,42,0.22)" }}>
            {view === "archived" ? (
              <button type="button" onClick={() => archive(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-strong hover:bg-surface-soft"><ArchiveRestore size={15} /> Restore</button>
            ) : (
              <button type="button" onClick={() => archive(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-strong hover:bg-surface-soft"><Archive size={15} /> Archive</button>
            )}
            <button type="button" onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium text-[#A80400] hover:bg-[#FEF2F2]"><Trash2 size={15} /> Delete</button>
          </div>
        </>
      )}
    </div>
  );
}
