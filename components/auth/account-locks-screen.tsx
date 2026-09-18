"use client";

import * as React from "react";
import { LockKeyhole, ShieldCheck, Loader2, Search } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { UNLOCKER_NAMES } from "@/lib/auth/lockout-copy";
import { lookupLockState, unlockAccountAction } from "@/app/(app)/account-locks/actions";

export interface LockedRow {
  email: string;
  employeeName: string | null;
  failedCount: number;
  lockedAt: string | null;
  lastFailedAt: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "17 Sep 2026, 10:04 pm" in India time, computed so server and browser agree. */
function istDateTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 330 * 60 * 1000);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 === 0 ? 12 : h % 12}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function AccountLocksScreen({ rows, maxAttempts }: { rows: LockedRow[]; maxAttempts: number }) {
  const [locked, setLocked] = React.useState(rows);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [checking, setChecking] = React.useState(false);

  async function unlock(email: string) {
    if (busy) return;
    setBusy(email);
    try {
      const res = await unlockAccountAction(email);
      if (res.ok) {
        setLocked((prev) => prev.filter((r) => r.email !== email));
        fireToast({ message: `${email} can sign in again.`, type: "success" });
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function checkAndUnlock() {
    const email = query.trim().toLowerCase();
    if (!email || checking) return;
    setChecking(true);
    try {
      const state = await lookupLockState(email);
      if (!state.ok) {
        fireToast({ message: state.error, type: "error" });
        return;
      }
      if (!state.locked) {
        fireToast({
          message: `${email} is not locked${state.failedCount ? ` (${state.failedCount} failed attempt(s) so far)` : ""}.`,
          type: "success",
        });
        return;
      }
      await unlock(email);
      setQuery("");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="pb-10">
      <div className="mb-5 mt-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "#E10600" }}>
          Security
        </p>
        <h1
          className="mt-1 text-[26px] font-black leading-tight text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Locked accounts
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] font-medium leading-relaxed text-ink-muted">
          An account locks after {maxAttempts} wrong passwords in a row. While it is locked the person cannot sign in and
          cannot reset their own password. Only {UNLOCKER_NAMES} can release it.
        </p>
      </div>

      <section className="rounded-2xl border border-hairline bg-white p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}>
            <LockKeyhole size={18} />
          </span>
          <div>
            <h2 className="text-[16px] font-black leading-tight text-ink-strong">
              {locked.length === 0 ? "Nobody is locked out" : `${locked.length} locked ${locked.length === 1 ? "account" : "accounts"}`}
            </h2>
            <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
              Unlocking clears the count and lets the person sign in or reset their password again.
            </p>
          </div>
        </div>

        {locked.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface-soft text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Account</th>
                  <th className="px-4 py-2.5">Locked</th>
                  <th className="px-4 py-2.5">Last wrong password</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {locked.map((r) => (
                  <tr key={r.email} className="border-t border-hairline">
                    <td className="px-4 py-2.5">
                      <span className="block text-[13.5px] font-bold text-ink-strong">{r.employeeName ?? "Not an employee account"}</span>
                      <span className="block text-[12px] font-medium text-ink-muted">{r.email}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium text-ink-muted">{istDateTime(r.lockedAt)}</td>
                    <td className="px-4 py-2.5 text-[13px] font-medium text-ink-muted">{istDateTime(r.lastFailedAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void unlock(r.email)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}
                      >
                        {busy === r.email ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                        {busy === r.email ? "Unlocking…" : "Unlock"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Check or unlock by email</p>
          <p className="mt-1 text-[12.5px] font-medium text-ink-muted">
            Useful when someone says they are locked out but their address is not listed above — for example a typo in the
            address they were trying.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                id="lock-email"
                type="email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="name@altuscorp.in"
                className="w-full rounded-xl border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[13.5px] font-medium outline-none focus:border-ink-muted"
              />
            </div>
            <button
              type="button"
              onClick={() => void checkAndUnlock()}
              disabled={checking || busy !== null || !query.trim()}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Check &amp; unlock
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
