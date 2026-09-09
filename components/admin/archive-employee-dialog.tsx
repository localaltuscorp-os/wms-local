"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  EXIT_REASONS,
  EXIT_REASON_LABELS,
  REHIRE_ELIGIBILITIES,
  REHIRE_LABELS,
  type ExitReason,
  type RehireEligibility,
} from "@/db/enums";
import { archiveEmployee } from "@/app/(admin)/admin/employees/offboarding-actions";

/**
 * OFFBOARDING WIZARD — replaces the old "Delete permanently" dialog.
 *
 * Three steps, in this order for a reason: the admin describes the departure
 * BEFORE they are shown the irreversible button. The old dialog led with
 * destruction and asked for nothing; this one collects a record and makes the
 * destructive part the last thing you reach.
 *
 * Step 3 is a plain-language review of exactly what is about to happen —
 * what dies, what survives, where the work goes — because "irreversible" in
 * small print is not informed consent.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    name: string;
    email: string;
    joinedAt: string | null;
  };
  /** Active colleagues who could inherit the open work. */
  successorOptions: { value: string; label: string }[];
  /** Only a super-admin may place a legal hold during the exit. */
  canSetLegalHold: boolean;
}

const inputCls =
  "w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/20";
const labelCls = "block text-[13px] font-semibold text-[#334155] mb-1.5";

/** `YYYY-MM-DD` for a date input, from an ISO timestamp or null. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function ArchiveEmployeeDialog({
  open,
  onOpenChange,
  employee,
  successorOptions,
  canSetLegalHold,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, startTransition] = useTransition();

  const [exitReason, setExitReason] = useState<ExitReason>("resigned");
  const [exitReasonOther, setExitReasonOther] = useState("");
  const [rehire, setRehire] = useState<RehireEligibility>("with_review");
  const [rehireNote, setRehireNote] = useState("");

  const [joinedAt, setJoinedAt] = useState(toDateInput(employee.joinedAt));
  const [resignationDate, setResignationDate] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");

  const [noticeServed, setNoticeServed] = useState(false);
  const [noticeDays, setNoticeDays] = useState("");
  const [paidInLieu, setPaidInLieu] = useState(false);

  const [successorId, setSuccessorId] = useState("");
  const [legalHold, setLegalHold] = useState(false);
  const [legalHoldReason, setLegalHoldReason] = useState("");

  const [assetsReturned, setAssetsReturned] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [knowledgeTransferDone, setKnowledgeTransferDone] = useState(false);
  const [finalSettlementDone, setFinalSettlementDone] = useState(false);
  const [exitInterviewDone, setExitInterviewDone] = useState(false);
  const [handoverNote, setHandoverNote] = useState("");

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [primaryReason, setPrimaryReason] = useState("");
  const [whatWorked, setWhatWorked] = useState("");
  const [whatDidNot, setWhatDidNot] = useState("");
  const [managerFeedback, setManagerFeedback] = useState("");

  const [notes, setNotes] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

  const successorName = useMemo(
    () => successorOptions.find((o) => o.value === successorId)?.label ?? null,
    [successorOptions, successorId],
  );

  const confirmMatches =
    confirmInput.trim().toLowerCase() === employee.email.toLowerCase();

  // Step 1 cannot be left with an `other` that says nothing, or a legal hold
  // with no reason — the server rejects both, and finding that out on the last
  // step after filling in two more pages is a poor way to learn it.
  const step1Valid =
    (exitReason !== "other" || exitReasonOther.trim().length > 0) &&
    (!legalHold || legalHoldReason.trim().length > 0) &&
    (!joinedAt || !lastWorkingDay || lastWorkingDay >= joinedAt);

  function reset() {
    setStep(1);
    setConfirmInput("");
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveEmployee({
        employeeId: employee.id,
        confirmationEmail: confirmInput,
        exitReason,
        exitReasonOther: exitReasonOther.trim() || null,
        rehireEligibility: rehire,
        rehireNote: rehireNote.trim() || null,
        joinedAt,
        resignationDate,
        lastWorkingDay,
        noticeServed,
        noticeDays: noticeDays ? Number(noticeDays) : null,
        paidInLieu,
        successorId: successorId || null,
        legalHold,
        legalHoldReason: legalHoldReason.trim() || null,
        handover: {
          assetsReturned,
          accessRevoked,
          knowledgeTransferDone,
          finalSettlementDone,
          exitInterviewDone,
          note: handoverNote.trim() || null,
        },
        exitInterview: interviewOpen
          ? {
              primaryReason: primaryReason.trim() || null,
              whatWorked: whatWorked.trim() || null,
              whatDidNot: whatDidNot.trim() || null,
              managerFeedback: managerFeedback.trim() || null,
            }
          : null,
        notes: notes.trim() || null,
      });

      if (!res.ok) {
        fireToast({ message: res.error ?? "Archive failed." });
        return;
      }
      const a = res.archived!;
      const moved = a.reassigned.openTasks;
      const bits = [
        `${employee.name} archived`,
        moved > 0 ? `${moved} open task${moved === 1 ? "" : "s"} → ${successorName}` : null,
        a.firebaseDeleted ? "login destroyed" : "LOGIN NOT DELETED — remove it manually",
      ].filter(Boolean);
      fireToast({ message: bits.join(" · ") });
      onOpenChange(false);
      reset();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <div className="flex items-start gap-3 mb-4">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "rgba(225, 6, 0, 0.10)", color: "#A80400" }}
              aria-hidden
            >
              <AlertTriangle size={18} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-serif text-xl text-[#0F172A]">
                Offboard {employee.name}
              </Dialog.Title>
              <Dialog.Description
                className="text-[13.5px] text-[#64748B] mt-1"
                style={{ lineHeight: 1.5 }}
              >
                Step {step} of 3 —{" "}
                {step === 1
                  ? "why they are leaving"
                  : step === 2
                    ? "handover and exit interview"
                    : "review and confirm"}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Reason for leaving</label>
                <select
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value as ExitReason)}
                  className={inputCls}
                >
                  {EXIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {EXIT_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                {exitReason === "other" && (
                  <input
                    type="text"
                    value={exitReasonOther}
                    onChange={(e) => setExitReasonOther(e.target.value)}
                    placeholder="Describe the reason"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </div>

              <div>
                <label className={labelCls}>Eligible for rehire</label>
                <select
                  value={rehire}
                  onChange={(e) => setRehire(e.target.value as RehireEligibility)}
                  className={inputCls}
                >
                  {REHIRE_ELIGIBILITIES.map((r) => (
                    <option key={r} value={r}>
                      {REHIRE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={rehireNote}
                  onChange={(e) => setRehireNote(e.target.value)}
                  placeholder="Note (optional)"
                  className={`${inputCls} mt-2`}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Date of joining</label>
                  <input
                    type="date"
                    value={joinedAt}
                    onChange={(e) => setJoinedAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Resignation date</label>
                  <input
                    type="date"
                    value={resignationDate}
                    onChange={(e) => setResignationDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Last working day</label>
                  <input
                    type="date"
                    value={lastWorkingDay}
                    onChange={(e) => setLastWorkingDay(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              {joinedAt && lastWorkingDay && lastWorkingDay < joinedAt && (
                <p className="text-[12.5px] text-[#A80400]">
                  Last working day cannot precede the joining date.
                </p>
              )}

              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="flex items-center gap-2 text-[13px] text-[#334155]">
                  <input
                    type="checkbox"
                    checked={noticeServed}
                    onChange={(e) => setNoticeServed(e.target.checked)}
                  />
                  Notice served
                </label>
                <div>
                  <label className={labelCls}>Notice days</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={noticeDays}
                    onChange={(e) => setNoticeDays(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-[#334155]">
                  <input
                    type="checkbox"
                    checked={paidInLieu}
                    onChange={(e) => setPaidInLieu(e.target.checked)}
                  />
                  Paid in lieu
                </label>
              </div>

              <div>
                <label className={labelCls}>Transfer open work to</label>
                <select
                  value={successorId}
                  onChange={(e) => setSuccessorId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Nobody — leave tasks unassigned</option>
                  {successorOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-[12px] text-[#64748B] mt-1.5" style={{ lineHeight: 1.5 }}>
                  Moves open tasks and direct reports. Completed tasks keep their
                  original owner — that is a record of who did the work.
                </p>
              </div>

              {canSetLegalHold && (
                <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-[#92400E]">
                    <input
                      type="checkbox"
                      checked={legalHold}
                      onChange={(e) => setLegalHold(e.target.checked)}
                    />
                    <ShieldAlert size={15} /> Place a legal hold
                  </label>
                  <p className="text-[12px] text-[#92400E] mt-1.5" style={{ lineHeight: 1.5 }}>
                    Exempts this record from every retention timer and from
                    anonymisation. Use it if they are leaving under investigation.
                  </p>
                  {legalHold && (
                    <input
                      type="text"
                      value={legalHoldReason}
                      onChange={(e) => setLegalHoldReason(e.target.value)}
                      placeholder="Reason for the hold (required)"
                      className={`${inputCls} mt-2`}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#94A3B8] mb-2">
                  Handover checklist
                </div>
                <div className="space-y-2 text-[13px] text-[#334155]">
                  {(
                    [
                      ["Assets returned (laptop, ID card)", assetsReturned, setAssetsReturned],
                      ["Access revoked (email, third-party tools)", accessRevoked, setAccessRevoked],
                      ["Knowledge transfer completed", knowledgeTransferDone, setKnowledgeTransferDone],
                      ["Final settlement done", finalSettlementDone, setFinalSettlementDone],
                      ["Exit interview conducted", exitInterviewDone, setExitInterviewDone],
                    ] as const
                  ).map(([label, value, setter]) => (
                    <label key={label} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setter(e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <input
                  type="text"
                  value={handoverNote}
                  onChange={(e) => setHandoverNote(e.target.value)}
                  placeholder="Handover note (optional)"
                  className={`${inputCls} mt-3`}
                />
                <p className="text-[12px] text-[#64748B] mt-2" style={{ lineHeight: 1.5 }}>
                  Unticked boxes do not block the archive — they are recorded as
                  outstanding, so the gaps stay visible instead of being lost.
                </p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-[#334155]">
                  <input
                    type="checkbox"
                    checked={interviewOpen}
                    onChange={(e) => setInterviewOpen(e.target.checked)}
                  />
                  Record exit interview
                </label>
                {interviewOpen && (
                  <div className="space-y-2 mt-3">
                    <input
                      type="text"
                      value={primaryReason}
                      onChange={(e) => setPrimaryReason(e.target.value)}
                      placeholder="Primary reason in their words"
                      className={inputCls}
                    />
                    <textarea
                      value={whatWorked}
                      onChange={(e) => setWhatWorked(e.target.value)}
                      placeholder="What worked well"
                      rows={2}
                      className={inputCls}
                    />
                    <textarea
                      value={whatDidNot}
                      onChange={(e) => setWhatDidNot(e.target.value)}
                      placeholder="What did not"
                      rows={2}
                      className={inputCls}
                    />
                    <textarea
                      value={managerFeedback}
                      onChange={(e) => setManagerFeedback(e.target.value)}
                      placeholder="Feedback about their manager"
                      rows={2}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Internal notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="Anything else worth recording"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#A80400] mb-2">
                  Destroyed permanently — cannot be undone
                </div>
                <ul className="space-y-1 text-[13px] text-[#7F1D1D]">
                  <li>· Their Firebase login. They can never sign in again, and it cannot be restored.</li>
                  <li>· Their profile photo, deleted from storage immediately.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#15803D] mb-2">
                  Kept — nothing below is deleted
                </div>
                <ul className="space-y-1 text-[13px] text-[#166534]">
                  <li>· Every task they touched, and every task anyone raised with them.</li>
                  <li>· Their full audit trail, attendance and payroll history.</li>
                  <li>· Their record, in Previous Employees, with the details from step 1.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#94A3B8] mb-2">
                  Summary
                </div>
                <dl className="text-[13px] text-[#334155] space-y-1">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">Reason</dt>
                    <dd className="font-semibold text-right">
                      {exitReason === "other"
                        ? exitReasonOther || "Other"
                        : EXIT_REASON_LABELS[exitReason]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">Rehire</dt>
                    <dd className="font-semibold text-right">{REHIRE_LABELS[rehire]}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">Last working day</dt>
                    <dd className="font-semibold text-right">{lastWorkingDay || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#64748B]">Open work goes to</dt>
                    <dd className="font-semibold text-right">
                      {successorName ?? "Nobody — tasks left unassigned"}
                    </dd>
                  </div>
                  {legalHold && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[#64748B]">Legal hold</dt>
                      <dd className="font-semibold text-right text-[#92400E]">Yes</dd>
                    </div>
                  )}
                </dl>
              </div>

              <label className="block">
                <span className={labelCls}>
                  Type{" "}
                  <span className="font-mono text-[12.5px] text-[#A80400]">
                    {employee.email}
                  </span>{" "}
                  to confirm
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className={inputCls}
                  placeholder={employee.email}
                  disabled={pending}
                />
              </label>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-5">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                  disabled={pending}
                  className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B] inline-flex items-center gap-1.5"
                >
                  <ArrowLeft size={15} /> Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
                  disabled={step === 1 && !step1Valid}
                  className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  style={{ background: "#0F172A" }}
                >
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={!confirmMatches || pending}
                  className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  {pending ? "Archiving…" : "Archive & delete login"}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
