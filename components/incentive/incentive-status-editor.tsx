"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Check, HandCoins, Wallet, BadgeCheck, Users } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import type { IncentiveEntryStatusRow } from "@/lib/queries/incentive-status";
import { setEntryStatusAmounts } from "@/app/(app)/incentive/status-actions";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const AMBER = "#d97706";

function toNum(s: string): number {
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Set Booked / Accrued / Paid on one permanent incentive entry. */
export function IncentiveStatusEditor({
  row,
  onClose,
}: {
  row: IncentiveEntryStatusRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [booked, setBooked] = React.useState("");
  const [accrued, setAccrued] = React.useState("");
  const [paid, setPaid] = React.useState("");
  const [paidDate, setPaidDate] = React.useState("");

  React.useEffect(() => {
    if (!row) return;
    setBooked(row.booked ? String(row.booked) : "");
    setAccrued(row.accrued ? String(row.accrued) : "");
    setPaid(row.paid ? String(row.paid) : "");
    setPaidDate("");
  }, [row]);

  const split = (row?.participantCount ?? 0) > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    startTransition(async () => {
      const res = await setEntryStatusAmounts({
        id: row.id,
        bookedAmt: toNum(booked),
        accruedAmt: toNum(accrued),
        paidAmt: toNum(paid),
        paidDate: paidDate ? paidDate : null,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Status amounts saved." });
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog.Root open={row != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-[22px] bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.8), 0 24px 60px -24px rgba(15,23,42,0.4)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            {row && <EmployeeAvatar name={row.empName} size="md" />}
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}
              >
                Set Status Amounts
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-semibold" style={{ fontSize: 13 }}>
                {row?.empName} · {row?.incentiveName}
                {row?.approvedAmt ? ` · approved ${formatInr(row.approvedAmt)}` : ""}
              </Dialog.Description>
            </div>
          </div>

          {split && (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
              style={{ background: `color-mix(in srgb, ${AMBER} 10%, transparent)`, boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              <Users size={15} strokeWidth={2.4} style={{ color: AMBER }} className="mt-0.5 shrink-0" />
              <p className="text-[12.5px] font-semibold text-ink-soft">
                A team split ({row?.participantCount} participants) is active — the <b>Paid</b> total for
                reporting comes from the split, not from these entry-level amounts.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            <MoneyField label="Booked" hint="client paid partial" color={AMBER} icon={<HandCoins size={14} strokeWidth={2.5} />} value={booked} onChange={setBooked} autoFocus />
            <MoneyField label="Accrued" hint="client paid in full" color={GREEN} icon={<Wallet size={14} strokeWidth={2.5} />} value={accrued} onChange={setAccrued} />
            <MoneyField label="Paid" hint="paid to employee" color={GREEN_DEEP} icon={<BadgeCheck size={14} strokeWidth={2.5} />} value={paid} onChange={setPaid} />
            <div>
              <label className="block font-semibold text-ink-strong mb-1.5" style={{ fontSize: 13 }}>
                Paid Date
              </label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full rounded-chip border border-hairline bg-surface-card px-3.5 h-11 text-ink-strong outline-none transition-all focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/25"
                style={{ fontSize: 14.5 }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button type="button" className="bg-surface-card cursor-pointer px-4 py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 14 }} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="wg-btn wg-sheen inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50"
                style={{
                  fontSize: 14,
                  background: `linear-gradient(135deg, #E10600, #A80400)`,
                  boxShadow: `0 10px 24px -12px color-mix(in srgb, #A80400 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}
                {pending ? "Saving…" : "Save Amounts"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MoneyField({
  label,
  hint,
  color,
  icon,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  hint: string;
  color: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-strong" style={{ fontSize: 13 }}>
        <span className="inline-grid size-5 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          {icon}
        </span>
        {label}
        <span className="font-medium text-ink-subtle">· {hint}</span>
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" style={{ fontSize: 14.5 }}>
          ₹
        </span>
        <input
          autoFocus={autoFocus}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full rounded-chip border border-hairline bg-surface-card pl-8 pr-3.5 h-11 text-ink-strong tabular-nums outline-none transition-all focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/25"
          style={{ fontSize: 14.5 }}
        />
      </div>
    </div>
  );
}
