"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import { LEAVE_KINDS, LEAVE_KIND_LABELS, type LeaveKind } from "@/db/enums";
import { requestLeave } from "@/app/(app)/attendance/leave/actions";

export function RequestLeaveForm({ today }: { today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<LeaveKind>("paid");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    startTransition(async () => {
      const res = await requestLeave({
        kind,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Leave request submitted.", type: "success" });
      setReason("");
      router.refresh();
    });
  }

  return (
    <section
      className="rounded-section bg-surface-card p-6 max-md:p-5"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <h2 className="text-[18px] font-semibold text-ink-strong mb-1">
        Request leave
      </h2>
      <p className="text-[14px] text-ink-subtle mb-5" style={{ lineHeight: 1.5 }}>
        Calendar days are counted inclusively. Weekly-offs and holidays inside
        the range aren&apos;t auto-excluded — an admin can adjust if needed.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Type">
          <div className="flex gap-2 flex-wrap">
            {LEAVE_KINDS.map((k) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="rounded-md px-4 py-2.5 text-[14px] font-semibold transition-colors"
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg, #E10600, #A80400)",
                          color: "#fff",
                        }
                      : {
                          background: "var(--color-surface-soft)",
                          color: "var(--color-ink-soft)",
                          border: "1px solid var(--color-hairline)",
                        }
                  }
                >
                  {LEAVE_KIND_LABELS[k]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
          <Field label="Start date">
            <input
              required
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
            />
          </Field>
        </div>

        <Field label="Reason" hint="Optional">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Family function"
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md py-2.5 px-6 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {pending ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {hint && (
          <span className="ml-2 text-[12px] font-normal text-ink-subtle">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
