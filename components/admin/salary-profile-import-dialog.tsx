"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CloudDownload, CheckCircle2, RefreshCw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  previewSalaryProfileImport,
  confirmSalaryProfileImport,
  type ProfileImportPreview,
} from "@/app/(app)/salary/import/profile-actions";

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function SalaryProfileImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProfileImportPreview | null>(null);

  function reset() {
    setError(null);
    setPreview(null);
  }

  function runPreview() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewSalaryProfileImport();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }

  function onConfirm() {
    startTransition(async () => {
      const res = await confirmSalaryProfileImport();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: `Updated ${res.updatedProfiles} profile(s) · +${res.createdDesignations} designation(s), +${res.createdEntities} entity(ies).`,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const changed = preview
    ? preview.matched.filter((m) => m.isNew || m.ctcChanged)
    : [];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) runPreview();
        else reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          <CloudDownload size={15} strokeWidth={2.2} />
          Import from Salary Sheet
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Import from “Altus Corp Salary Payment”
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Reads the <strong>Salary Breakup</strong> tab live (each person’s
            latest month) and fills <strong>Annual&nbsp;CTC</strong>,{" "}
            <strong>PT-exemption</strong>, <strong>Designation</strong> and{" "}
            <strong>Paying&nbsp;Entity</strong>. TDS is never touched (the sheet
            has no TDS column). Matches by name; re-running is safe.
          </Dialog.Description>

          {pending && !preview && (
            <p className="mt-4 text-[14px] text-[#64748B]">Reading the sheet…</p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
            >
              {error}
            </div>
          )}

          {preview && (
            <div className="mt-2 rounded-lg border border-[#E2E8F0] p-4">
              <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
                <Stat label="Sheet Employees" value={String(preview.sheetEmployees)} />
                <Stat label="Matched" value={String(preview.matched.length)} />
                <Stat label="Will Change" value={String(changed.length)} />
                <Stat label="New Designations" value={String(preview.newDesignations.length)} />
                <Stat label="New Entities" value={String(preview.newEntities.length)} />
                <Stat label="Unmatched Names" value={String(preview.unmatchedNames.length)} />
              </div>

              {preview.unmatchedNames.length > 0 && (
                <p
                  className="mt-3 rounded-md border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#9A3412]"
                  style={{ lineHeight: 1.5 }}
                >
                  Not in the app (fix the name in the sheet or add the employee,
                  then re-import):{" "}
                  <span className="font-medium">
                    {preview.unmatchedNames.join(", ")}
                  </span>
                </p>
              )}

              {(preview.newDesignations.length > 0 || preview.newEntities.length > 0) && (
                <p
                  className="mt-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#475569]"
                  style={{ lineHeight: 1.5 }}
                >
                  Will create:{" "}
                  {[...preview.newDesignations, ...preview.newEntities].join(", ")}
                </p>
              )}

              {changed.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                        <th className="py-1.5 pr-3 font-semibold">Employee</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Current CTC</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">New CTC</th>
                        <th className="py-1.5 pr-3 font-semibold">PT</th>
                        <th className="py-1.5 pr-3 font-semibold">Designation</th>
                        <th className="py-1.5 font-semibold">Entity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changed.map((m) => (
                        <tr key={m.employeeId} className="border-b border-[#F1F5F9]">
                          <td className="py-1.5 pr-3 text-[#0F172A]">
                            {m.employeeName}
                            {m.isNew && (
                              <span className="ml-1.5 text-[10px] font-bold uppercase text-[#E10600]">
                                new
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-[#94A3B8] tabular-nums">
                            {m.currentCtc > 0 ? `₹${num(m.currentCtc)}` : "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-[#0F172A] font-semibold tabular-nums">
                            ₹{num(m.annualCtc)}
                          </td>
                          <td className="py-1.5 pr-3 text-[#475569]">
                            {m.ptExempt ? "Exempt" : "₹200"}
                          </td>
                          <td className="py-1.5 pr-3 text-[#475569]">{m.designation ?? "—"}</td>
                          <td className="py-1.5 text-[#475569]">{m.payingEntity ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-[14px] text-[#475569]">
                  Every matched employee already has these exact values — nothing
                  to change. (Re-running still safely re-stamps designation/entity.)
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={pending}
                  className="brand-btn inline-flex items-center gap-1.5 px-4 py-2.5 text-[14px] font-medium text-[#64748B] disabled:opacity-50"
                >
                  <RefreshCw size={14} strokeWidth={2.2} />
                  Re-read
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={pending || preview.matched.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  {pending
                    ? "Importing…"
                    : `Apply to ${preview.matched.length} employee(s)`}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end border-t border-[#E2E8F0] pt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="brand-btn px-4 py-2 text-[14px] font-medium text-[#64748B]"
                disabled={pending}
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </div>
      <div className="text-[16px] font-bold text-[#0F172A]">{value}</div>
    </div>
  );
}
