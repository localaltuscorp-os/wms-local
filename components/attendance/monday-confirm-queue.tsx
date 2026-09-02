"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import type { MondayConfirmQueue } from "@/lib/attendance/confirmations";
import { confirmWeek } from "@/app/(app)/attendance/confirmations/actions";

const DOW = ["S", "M", "T", "W", "T", "F", "S"] as const; // index by weekday 0=Sun

export function MondayConfirmQueueView({ queue }: { queue: MondayConfirmQueue }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const r of queue.rows) if (r.confirmed) m[r.employeeId] = true;
    return m;
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState(false);

  const remaining = queue.rows.filter((r) => !confirmed[r.employeeId]).length;

  function confirmOne(ownerId: string, silent = false) {
    setBusy(ownerId);
    setConfirmed((m) => ({ ...m, [ownerId]: true }));
    return confirmWeek({ ownerEmployeeId: ownerId, weekStart: queue.week.start, silent }).then((res) => {
      setBusy((b) => (b === ownerId ? null : b));
      if (!res.ok) {
        setConfirmed((m) => {
          const n = { ...m };
          delete n[ownerId];
          return n;
        });
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      return true;
    });
  }

  function confirmAll() {
    const targets = queue.rows.filter((r) => !confirmed[r.employeeId]);
    if (targets.length === 0) return;
    setBulk(true);
    startTransition(async () => {
      let anyFail = false;
      for (const r of targets) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await confirmOne(r.employeeId, true);
        if (!ok) anyFail = true;
      }
      setBulk(false);
      if (!anyFail) fireToast({ message: "All confirmed.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="wg-rise">
      {/* summary bar */}
      <div
        className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-surface-card px-5 py-4 max-md:flex-col max-md:items-stretch"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
      >
        <div className="text-[14px] font-semibold text-ink-muted">
          {remaining === 0 ? (
            <span className="inline-flex items-center gap-2" style={{ color: "var(--color-green-deep)" }}>
              <CheckCircle2 size={18} /> Every person confirmed for this week.
            </span>
          ) : (
            <>
              <span className="text-ink-strong">{remaining}</span> of {queue.rows.length} still to confirm
            </>
          )}
        </div>
        <button
          type="button"
          onClick={confirmAll}
          disabled={remaining === 0 || bulk}
          className="inline-flex items-center justify-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {bulk ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
          Confirm All
        </button>
      </div>

      {/* rows */}
      <ul className="flex flex-col gap-3">
        {queue.rows.map((r) => {
          const isConfirmed = !!confirmed[r.employeeId];
          const isBusy = busy === r.employeeId;
          return (
            <li
              key={r.employeeId}
              className="flex items-center gap-4 rounded-2xl bg-surface-card px-5 py-4 max-md:flex-col max-md:items-stretch"
              style={{
                boxShadow: isConfirmed
                  ? "inset 0 0 0 1px color-mix(in srgb, var(--color-green) 45%, transparent)"
                  : "inset 0 0 0 1px var(--color-hairline-strong)",
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={r.name} avatarUrl={r.avatarUrl} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-extrabold text-ink-strong">{r.name}</div>
                  <div className="text-[12.5px] font-semibold text-ink-subtle">
                    {r.presentDays} present · {r.absentDays} absent
                    {r.department ? ` · ${r.department}` : ""}
                  </div>
                </div>
              </div>

              {/* week strip */}
              <div className="flex items-center gap-1.5 max-md:justify-center">
                {r.cells.map((c) => {
                  const bg = c.weeklyOff
                    ? "var(--color-surface-track, #eef2f7)"
                    : c.present
                      ? "color-mix(in srgb, var(--color-green) 20%, transparent)"
                      : "color-mix(in srgb, var(--color-altus-red) 16%, transparent)";
                  const fg = c.weeklyOff
                    ? "var(--color-ink-subtle)"
                    : c.present
                      ? "var(--color-green-deep)"
                      : "var(--color-altus-red-deep)";
                  return (
                    <div
                      key={c.date}
                      title={`${c.date}${c.weeklyOff ? " · weekly off" : c.present ? " · present" : " · absent"}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold"
                      style={{ background: bg, color: fg }}
                    >
                      {DOW[c.weekday]}
                    </div>
                  );
                })}
              </div>

              {/* confirm control */}
              <div className="flex shrink-0 items-center max-md:justify-end">
                {isConfirmed ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--color-green) 16%, transparent)",
                      color: "var(--color-green-deep)",
                    }}
                  >
                    <CheckCircle2 size={15} /> Confirmed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => startTransition(() => void confirmOne(r.employeeId))}
                    disabled={isBusy || isPending}
                    className="brand-btn inline-flex items-center gap-1.5 rounded-pill border px-4 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-50"
                    style={{
                      borderColor: "var(--color-hairline-strong)",
                      color: "var(--color-ink-strong)",
                    }}
                  >
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
                    Confirm
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
