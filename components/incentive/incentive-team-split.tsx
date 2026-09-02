"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Check, Plus, Trash2, Users, Scale } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { IncentiveEntryStatusRow } from "@/lib/queries/incentive-status";
import { getIncentiveSplit, saveIncentiveSplit } from "@/app/(app)/incentive/status-actions";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const AMBER = "#d97706";
const RED = "#E10600";
const RED_DEEP = "#A80400";

interface Share {
  empName: string;
  employeeId: string | null;
  booked: string;
  accrued: string;
  paid: string;
}

function toNum(s: string): number {
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const blank = (): Share => ({ empName: "", employeeId: null, booked: "", accrued: "", paid: "" });

/**
 * Divide one incentive among N participants, each with their own Booked /
 * Accrued / Paid share. Saving REPLACES the whole participant set; the canonical
 * PAID producer then folds these rows in place of the parent's own amounts.
 */
export function IncentiveTeamSplit({
  row,
  employees,
  onClose,
}: {
  row: IncentiveEntryStatusRow | null;
  employees: EmployeeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [loading, setLoading] = React.useState(false);
  const [shares, setShares] = React.useState<Share[]>([blank()]);

  // Load the existing split whenever a row opens.
  React.useEffect(() => {
    let cancelled = false;
    if (!row) return;
    setLoading(true);
    setShares([blank()]);
    (async () => {
      const res = await getIncentiveSplit("entry", row.id);
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.rows.length) {
        setShares(
          res.rows.map((r) => ({
            empName: r.empName,
            employeeId: r.employeeId,
            booked: r.booked ? String(r.booked) : "",
            accrued: r.accrued ? String(r.accrued) : "",
            paid: r.paid ? String(r.paid) : "",
          })),
        );
      } else if (res.ok) {
        // Seed from the parent so the admin can split an existing solo amount.
        setShares([
          {
            empName: row.empName,
            employeeId: row.employeeId,
            booked: row.booked ? String(row.booked) : "",
            accrued: row.accrued ? String(row.accrued) : "",
            paid: row.paid ? String(row.paid) : "",
          },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const empOptions = employees.map((e) => ({ value: e.id, label: e.name }));

  function update(i: number, patch: Partial<Share>) {
    setShares((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function pickEmployee(i: number, id: string) {
    const e = employees.find((x) => x.id === id);
    update(i, { employeeId: id || null, empName: e ? e.name : shares[i]?.empName ?? "" });
  }
  function addRow() {
    setShares((s) => [...s, blank()]);
  }
  function removeRow(i: number) {
    setShares((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  }

  const totals = shares.reduce(
    (acc, s) => {
      acc.booked += toNum(s.booked);
      acc.accrued += toNum(s.accrued);
      acc.paid += toNum(s.paid);
      return acc;
    },
    { booked: 0, accrued: 0, paid: 0 },
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    const clean = shares.filter((s) => s.empName.trim().length > 0);
    if (clean.length === 0) {
      fireToast({ message: "Add at least one participant, or delete the split.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await saveIncentiveSplit({
        parentKind: "entry",
        parentId: row.id,
        periodMonth: row.periodMonth,
        shares: clean.map((s) => ({
          empName: s.empName.trim(),
          employeeId: s.employeeId,
          bookedAmt: toNum(s.booked),
          accruedAmt: toNum(s.accrued),
          paidAmt: toNum(s.paid),
        })),
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Split saved across ${res.count} participant${res.count === 1 ? "" : "s"}.` });
      router.refresh();
      onClose();
    });
  }

  async function clearSplit() {
    if (!row) return;
    startTransition(async () => {
      const res = await saveIncentiveSplit({
        parentKind: "entry",
        parentId: row.id,
        periodMonth: row.periodMonth,
        shares: [],
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Team split removed." });
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
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-[22px] bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.8), 0 24px 60px -24px rgba(15,23,42,0.4)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <span
              className="inline-grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${RED} 12%, transparent)`, color: RED_DEEP }}
            >
              <Users size={20} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}
              >
                Divide Incentive Among the Team
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-semibold" style={{ fontSize: 13 }}>
                {row?.incentiveName}
                {row?.approvedAmt ? ` · approved ${formatInr(row.approvedAmt)}` : ""} — each row is one person’s share.
              </Dialog.Description>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-ink-subtle" style={{ fontSize: 14 }}>
              <Loader2 size={16} className="animate-spin" /> Loading current split…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="hidden grid-cols-[1fr_92px_92px_92px_32px] gap-2 px-1 md:grid">
                <HeadCell>Participant</HeadCell>
                <HeadCell color={AMBER} align="right">Booked</HeadCell>
                <HeadCell color={GREEN} align="right">Accrued</HeadCell>
                <HeadCell color={GREEN_DEEP} align="right">Paid</HeadCell>
                <span />
              </div>

              {shares.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_92px_92px_92px_32px] gap-2 max-md:grid-cols-2 max-md:gap-2.5 max-md:rounded-xl max-md:p-3"
                  style={{ boxShadow: "var(--tw-empty,)" }}
                >
                  <div className="max-md:col-span-2">
                    <Select
                      options={empOptions}
                      value={s.employeeId ?? ""}
                      onValueChange={(id) => pickEmployee(i, id)}
                      placeholder={s.empName || "— Select participant —"}
                      ariaLabel="Participant"
                      searchable
                    />
                  </div>
                  <ShareInput label="Booked" value={s.booked} onChange={(v) => update(i, { booked: v })} />
                  <ShareInput label="Accrued" value={s.accrued} onChange={(v) => update(i, { accrued: v })} />
                  <ShareInput label="Paid" value={s.paid} onChange={(v) => update(i, { paid: v })} />
                  <button
                    type="button"
                    aria-label="Remove participant"
                    onClick={() => removeRow(i)}
                    disabled={shares.length <= 1}
                    className="inline-flex h-11 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft disabled:opacity-30 max-md:w-full max-md:col-span-2"
                  >
                    <Trash2 size={15} strokeWidth={2.3} style={{ color: "var(--color-red-deep)" }} />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={addRow}
                  className="bg-surface-card wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 font-bold text-ink-soft transition-colors hover:text-ink-strong"
                  style={{ fontSize: 13, boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                >
                  <Plus size={15} strokeWidth={2.6} /> Add Participant
                </button>
                <div className="flex items-center gap-3 tabular-nums" style={{ fontSize: 12.5 }}>
                  <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: AMBER }}>
                    <Scale size={13} strokeWidth={2.5} /> {formatInr(totals.booked)}
                  </span>
                  <span className="font-bold" style={{ color: GREEN }}>{formatInr(totals.accrued)}</span>
                  <span className="font-black" style={{ color: GREEN_DEEP }}>{formatInr(totals.paid)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                {(row?.participantCount ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={clearSplit}
                    disabled={pending}
                    className="cursor-pointer text-[13px] font-bold text-[var(--color-red-deep)] disabled:opacity-50"
                  >
                    Remove Split
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex justify-end gap-2">
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
                      background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
                      boxShadow: `0 10px 24px -12px color-mix(in srgb, ${RED_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                    }}
                  >
                    {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}
                    {pending ? "Saving…" : "Save Split"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HeadCell({
  children,
  align = "left",
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  color?: string;
}) {
  return (
    <span
      className="uppercase font-bold tracking-[0.06em]"
      style={{ fontSize: 10.5, textAlign: align, color: color ?? "var(--color-ink-subtle)" }}
    >
      {children}
    </span>
  );
}

function ShareInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      aria-label={label}
      className="w-full rounded-chip border border-hairline bg-surface-card px-2.5 h-11 text-right text-ink-strong tabular-nums outline-none transition-all focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/25"
      style={{ fontSize: 14 }}
    />
  );
}
