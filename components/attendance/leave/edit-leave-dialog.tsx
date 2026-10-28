"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Check, Mic, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  LEAVE_KIND_LABELS,
  OFFICE_PHONE_AVAILABILITY_LABELS,
  type LeaveKind,
  type OfficePhoneAvailability,
} from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { leaveDays } from "@/lib/attendance/leave-cycle";
import { editLeave } from "@/app/(app)/attendance/leave/actions";
import { useDictation } from "@/components/ui/use-dictation";
import {
  LEAVE_INPUT_CLASS,
  LEAVE_INPUT_RING,
  LeaveField,
  dayCountLabel,
  prettyDate,
} from "./leave-ui";

type Portion = "full" | "half";

const GREEN = "#15803d";
const RED = "#b91c1c";
const SLATE = "#475569";

const OFFICE_PHONE_OPTIONS: readonly { value: OfficePhoneAvailability; label: string }[] = [
  { value: "na", label: "NA" },
  { value: "yes", label: OFFICE_PHONE_AVAILABILITY_LABELS.yes },
  { value: "no", label: OFFICE_PHONE_AVAILABILITY_LABELS.no },
];

const DURATION_BOX = {
  background: "var(--color-surface-track)",
  border: "1px solid var(--color-hairline-strong)",
} as const;

export interface EditLeaveDialogProps {
  row: LeaveRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedKinds?: readonly LeaveKind[];
  paidRemaining?: number;
  paidEligible?: boolean;
  categories?: readonly { id: string; name: string }[];
}

export function EditLeaveDialog({
  row,
  open,
  onOpenChange,
  allowedKinds = ["paid", "unpaid"],
  paidRemaining = 0,
  paidEligible = true,
  categories = [],
}: EditLeaveDialogProps) {
  const router = useRouter();
  const [kind, setKind] = useState<LeaveKind>(row.kind);
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [startDate, setStartDate] = useState(row.startDate);
  const [endDate, setEndDate] = useState(row.endDate);
  const [startPortion, setStartPortion] = useState<Portion>(row.startHalfDay ? "half" : "full");
  const [endPortion, setEndPortion] = useState<Portion>(row.endHalfDay ? "half" : "full");
  const [reason, setReason] = useState(row.reason ?? "");
  const [personalPhone, setPersonalPhone] = useState(
    row.availPersonalPhone === true ? "yes" : row.availPersonalPhone === false ? "no" : "",
  );
  const [officePhone, setOfficePhone] = useState(row.availOfficePhone ?? "");
  const [computer, setComputer] = useState(
    row.availComputer === true ? "yes" : row.availComputer === false ? "no" : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dictation = useDictation({
    value: reason,
    onChange: (v) => setReason(v.slice(0, 1000)),
  });

  const singleDay = startDate === endDate;
  const startHalfDay = startPortion === "half";
  const endHalfDay = !singleDay && endPortion === "half";

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && endDate >= startDate;
  const days = validRange ? leaveDays({ startDate, endDate, startHalfDay, endHalfDay }) : null;

  // Available balance accounts for the current request's days if already approved and paid
  const currentDaysIfApprovedPaid = row.status === "approved" && row.kind === "paid" ? Number(row.days) : 0;
  const effectiveAvailable = paidRemaining + currentDaysIfApprovedPaid;
  const overBalance = kind === "paid" && days != null && paidEligible && days > effectiveAvailable;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    if (overBalance) {
      setError(
        `You have ${effectiveAvailable} paid ${effectiveAvailable === 1 ? "day" : "days"} available.`,
      );
      return;
    }
    startTransition(async () => {
      const res = await editLeave({
        id: row.id,
        kind,
        categoryId: categoryId || null,
        startDate,
        endDate,
        startHalfDay,
        endHalfDay,
        reason: reason.trim() || undefined,
        availPersonalPhone: personalPhone ? personalPhone === "yes" : null,
        availOfficePhone: (officePhone || null) as OfficePhoneAvailability | null,
        availComputer: computer ? computer === "yes" : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Leave request updated." });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[95vw] max-w-[860px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[22px] bg-white p-7 shadow-2xl focus:outline-none max-md:p-5"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-4">
            <div>
              <Dialog.Title className="text-[19px] font-bold text-ink-strong">
                Edit Leave Request
              </Dialog.Title>
              <p className="mt-0.5 text-[12.5px] text-ink-subtle">
                Update request dates, duration, or details.{" "}
                {row.status === "approved" && (
                  <span className="font-semibold text-amber-700">
                    Changes to dates or type will re-submit for approval.
                  </span>
                )}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <X size={16} strokeWidth={2.4} />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                <AlertCircle size={15} strokeWidth={2.4} />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Left Column: Dates & Duration */}
              <div className="flex flex-col gap-4">
                <LeaveField label="Leave Type">
                  <div className="flex gap-2">
                    {allowedKinds.map((k) => {
                      const active = kind === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setKind(k)}
                          className="flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition-all"
                          style={
                            active
                              ? { background: "var(--color-altus-red)", color: "#fff" }
                              : {
                                  background: "var(--color-surface-soft)",
                                  color: "var(--color-ink-muted)",
                                  border: "1px solid var(--color-hairline)",
                                }
                          }
                        >
                          {LEAVE_KIND_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </LeaveField>

                {categories.length > 0 && (
                  <LeaveField label="Category">
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className={LEAVE_INPUT_CLASS}
                      style={{ ...LEAVE_INPUT_RING }}
                    >
                      <option value="">Select category…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </LeaveField>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <LeaveField label="Start Date">
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (endDate < e.target.value) setEndDate(e.target.value);
                      }}
                      className={LEAVE_INPUT_CLASS}
                      style={{ ...LEAVE_INPUT_RING }}
                    />
                  </LeaveField>
                  <LeaveField label="End Date">
                    <input
                      type="date"
                      required
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={LEAVE_INPUT_CLASS}
                      style={{ ...LEAVE_INPUT_RING }}
                    />
                  </LeaveField>
                </div>

                <div className="rounded-xl p-3.5" style={DURATION_BOX}>
                  <div className="flex items-center justify-between text-[12.5px] font-bold text-ink-muted">
                    <span>Duration & Half-Day</span>
                    {days != null && (
                      <span className="tabular-nums text-ink-strong">{dayCountLabel(days)}</span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-ink-soft">
                        {singleDay ? "Day portion" : `Start (${prettyDate(startDate)})`}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setStartPortion("full")}
                          className={`rounded px-2.5 py-1 text-[11.5px] font-bold ${
                            startPortion === "full" ? "bg-white text-ink-strong shadow-sm" : "text-ink-subtle"
                          }`}
                        >
                          Full Day
                        </button>
                        <button
                          type="button"
                          onClick={() => setStartPortion("half")}
                          className={`rounded px-2.5 py-1 text-[11.5px] font-bold ${
                            startPortion === "half" ? "bg-white text-ink-strong shadow-sm" : "text-ink-subtle"
                          }`}
                        >
                          Half Day
                        </button>
                      </div>
                    </div>

                    {!singleDay && (
                      <div className="flex items-center justify-between border-t border-hairline/60 pt-2">
                        <span className="text-[12px] text-ink-soft">End ({prettyDate(endDate)})</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEndPortion("full")}
                            className={`rounded px-2.5 py-1 text-[11.5px] font-bold ${
                              endPortion === "full" ? "bg-white text-ink-strong shadow-sm" : "text-ink-subtle"
                            }`}
                          >
                            Full Day
                          </button>
                          <button
                            type="button"
                            onClick={() => setEndPortion("half")}
                            className={`rounded px-2.5 py-1 text-[11.5px] font-bold ${
                              endPortion === "half" ? "bg-white text-ink-strong shadow-sm" : "text-ink-subtle"
                            }`}
                          >
                            Half Day
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Reason & Availability */}
              <div className="flex flex-col gap-4">
                <LeaveField label="Reason">
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for leave…"
                      className={`${LEAVE_INPUT_CLASS} resize-none pr-9`}
                      style={{ ...LEAVE_INPUT_RING }}
                    />
                    {dictation.supported && (
                      <button
                        type="button"
                        onClick={dictation.toggle}
                        title={dictation.listening ? "Stop dictation" : "Dictate reason"}
                        className={`absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full transition-colors ${
                          dictation.listening
                            ? "bg-red-500 text-white animate-pulse"
                            : "text-ink-subtle hover:text-ink-strong"
                        }`}
                      >
                        <Mic size={13} />
                      </button>
                    )}
                  </div>
                </LeaveField>

                <div className="flex flex-col gap-2.5 rounded-xl border border-hairline bg-surface-soft p-3.5">
                  <span className="text-[12.5px] font-bold text-ink-muted">Reachability while away</span>

                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">Personal Phone</span>
                    <div className="flex gap-1">
                      {["yes", "no"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPersonalPhone(personalPhone === v ? "" : v)}
                          className={`rounded px-2 py-0.5 font-bold uppercase transition-colors ${
                            personalPhone === v
                              ? v === "yes" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                              : "bg-white text-ink-subtle border border-hairline"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">Office Phone</span>
                    <div className="flex gap-1">
                      {OFFICE_PHONE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setOfficePhone(officePhone === opt.value ? "" : opt.value)}
                          className={`rounded px-2 py-0.5 font-bold transition-colors ${
                            officePhone === opt.value
                              ? opt.value === "yes"
                                ? "bg-emerald-600 text-white"
                                : opt.value === "no"
                                ? "bg-red-600 text-white"
                                : "bg-slate-600 text-white"
                              : "bg-white text-ink-subtle border border-hairline"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">Computer / Laptop</span>
                    <div className="flex gap-1">
                      {["yes", "no"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setComputer(computer === v ? "" : v)}
                          className={`rounded px-2 py-0.5 font-bold uppercase transition-colors ${
                            computer === v
                              ? v === "yes" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                              : "bg-white text-ink-subtle border border-hairline"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-hairline pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || overBalance}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "var(--color-altus-red)" }}
              >
                {pending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
