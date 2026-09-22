"use client";

import * as React from "react";
import { LockKeyhole, ShieldCheck, Loader2, Search, KeyRound, UserPlus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { UNLOCKER_NAMES } from "@/lib/auth/lockout-copy";
import { SECURITY_ROLE_DEFS } from "@/lib/auth/security-roles-catalog";
import {
  grantUnlockRoleAction,
  lookupLockState,
  revokeUnlockRoleAction,
  unlockAccountAction,
} from "@/app/(app)/account-locks/actions";

export interface LockedRow {
  email: string;
  employeeName: string | null;
  failedCount: number;
  lockedAt: string | null;
  lastFailedAt: string | null;
}

export interface Holder {
  employeeId: string;
  name: string;
  email: string;
  /** Named in code: permanent, and not revocable from here. */
  builtIn: boolean;
  grantedAt: string | null;
}

export interface Grantable {
  id: string;
  name: string;
  email: string;
}

const RED = "#E10600";
const RED_DEEP = "#A80400";
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

const ROLE = SECURITY_ROLE_DEFS.account_unlock;

export function AccountLocksScreen({
  rows,
  canGrant,
  holders,
  grantable,
}: {
  rows: LockedRow[];
  canGrant: boolean;
  holders: Holder[];
  grantable: Grantable[];
}) {
  const [locked, setLocked] = React.useState(rows);
  const [people, setPeople] = React.useState(holders);
  const [candidates, setCandidates] = React.useState(grantable);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [pick, setPick] = React.useState("");
  const [granting, setGranting] = React.useState(false);

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

  async function give() {
    if (!pick || granting) return;
    const person = candidates.find((c) => c.id === pick);
    if (!person) return;
    setGranting(true);
    try {
      const res = await grantUnlockRoleAction(person.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setPeople((prev) =>
        [...prev, { employeeId: person.id, name: person.name, email: person.email, builtIn: false, grantedAt: new Date().toISOString() }].sort(
          (a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name),
        ),
      );
      setCandidates((prev) => prev.filter((c) => c.id !== person.id));
      setPick("");
      fireToast({ message: `${person.name} can now unlock accounts.`, type: "success" });
    } finally {
      setGranting(false);
    }
  }

  async function take(holder: Holder) {
    if (busy) return;
    setBusy(holder.employeeId);
    try {
      const res = await revokeUnlockRoleAction(holder.employeeId, holder.email);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setPeople((prev) => prev.filter((h) => h.employeeId !== holder.employeeId));
      setCandidates((prev) =>
        [...prev, { id: holder.employeeId, name: holder.name, email: holder.email }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      fireToast({ message: `${holder.name} can no longer unlock accounts.`, type: "success" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-10">
      <div className="mb-5 mt-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: RED }}>
          Security
        </p>
        <h1
          className="mt-1 text-[26px] font-black leading-tight text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Locked accounts
        </h1>
      </div>

      <div className="grid gap-5">
        {/* ── Locked right now ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <div className="mb-4 flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}
            >
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2 className="text-[16px] font-black leading-tight text-ink-strong">
                {locked.length === 0
                  ? "Nobody is locked out"
                  : `${locked.length} locked ${locked.length === 1 ? "account" : "accounts"}`}
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
                        <span className="block text-[13.5px] font-bold text-ink-strong">
                          {r.employeeName ?? "Not an employee account"}
                        </span>
                        <span className="block text-[12px] font-medium text-ink-muted">{r.email}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-ink-muted">{istDateTime(r.lockedAt)}</td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-ink-muted">
                        {istDateTime(r.lastFailedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void unlock(r.email)}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                          style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}
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
              Useful when someone says they are locked out but their address is not listed above — for example a typo in
              the address they were trying.
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
                {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Check &amp;
                unlock
              </button>
            </div>
          </div>
        </section>

        {/* ── Who holds the role ───────────────────────────────────────── */}
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <div className="mb-4 flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}
            >
              <KeyRound size={18} />
            </span>
            <div>
              <h2 className="text-[16px] font-black leading-tight text-ink-strong">Who can unlock accounts</h2>
              <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-ink-muted">
                {ROLE.blurb} Give somebody the role and it takes effect at once — no developer, no deploy.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-hairline rounded-xl border border-hairline">
            {people.map((h) => (
              <li key={h.employeeId || h.email} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-ink-strong">{h.name}</span>
                  <span className="block text-[12px] font-medium text-ink-muted">{h.email}</span>
                </span>
                {h.builtIn ? (
                  <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "#f4f4f5", color: "#52525b" }}>
                    Permanent
                  </span>
                ) : (
                  <>
                    <span className="text-[12px] font-medium text-ink-subtle">since {istDateTime(h.grantedAt)}</span>
                    {canGrant && (
                      <button
                        type="button"
                        onClick={() => void take(h)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
                      >
                        {busy === h.employeeId ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Remove
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {canGrant ? (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Give the role to</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  id="grant-person"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="min-w-[240px] flex-1 rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-medium"
                >
                  <option value="">Choose a person…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void give()}
                  disabled={!pick || granting}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}
                >
                  {granting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Give role
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-subtle">{ROLE.caution}</p>
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] font-medium text-ink-muted">
              You can unlock accounts. Changing who else can is limited to {UNLOCKER_NAMES} and super-admins.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
