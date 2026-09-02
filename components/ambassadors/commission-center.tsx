"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallet, Check, X, Receipt, History, AlertCircle } from "lucide-react";
import type { ReferralRow } from "@/lib/queries/ambassadors";
import { recordPayout } from "@/app/(app)/ambassadors/actions";
import { inr, inrCompact } from "@/lib/ambassadors/format";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";

/** Today's date as YYYY-MM-DD (local), for the default "paid on" value. */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0]!.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

interface Group {
  ambassadorId: string;
  ambassadorName: string;
  rows: ReferralRow[];
  subtotal: number;
}

function groupByAmbassador(rows: ReferralRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    let g = map.get(r.ambassadorId);
    if (!g) {
      g = { ambassadorId: r.ambassadorId, ambassadorName: r.ambassadorName || "Unknown", rows: [], subtotal: 0 };
      map.set(r.ambassadorId, g);
    }
    g.rows.push(r);
    g.subtotal += r.commissionAmount ?? 0;
  }
  return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
}

const CARD_SHADOW = "0 1px 0 rgba(0,0,0,0.02), 0 10px 30px -22px rgba(0,0,0,0.35)";
const PANEL_SHADOW = "0 10px 30px -24px rgba(0,0,0,0.4)";

export function CommissionCenter({ owed, paid }: { owed: ReferralRow[]; paid: ReferralRow[] }) {
  const router = useRouter();
  const groups = React.useMemo(() => groupByAmbassador(owed), [owed]);

  // selection state — a Set of referral ids, all belonging to one ambassador.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [activeAmb, setActiveAmb] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const totalOwed = React.useMemo(() => owed.reduce((s, r) => s + (r.commissionAmount ?? 0), 0), [owed]);
  const totalPaid = React.useMemo(() => paid.reduce((s, r) => s + (r.commissionAmount ?? 0), 0), [paid]);
  const owedAmbassadors = groups.length;

  const selectedRows = React.useMemo(() => owed.filter((r) => selected.has(r.id)), [owed, selected]);
  const selectedTotal = React.useMemo(
    () => selectedRows.reduce((s, r) => s + (r.commissionAmount ?? 0), 0),
    [selectedRows],
  );
  const activeGroup = React.useMemo(
    () => (activeAmb ? groups.find((g) => g.ambassadorId === activeAmb) ?? null : null),
    [groups, activeAmb],
  );

  function toggleRow(r: ReferralRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) {
        next.delete(r.id);
        if (next.size === 0) setActiveAmb(null);
      } else {
        next.add(r.id);
        setActiveAmb(r.ambassadorId);
      }
      return next;
    });
  }

  function toggleGroup(g: Group) {
    setSelected((prev) => {
      const ids = g.rows.map((r) => r.id);
      const allOn = ids.every((id) => prev.has(id));
      if (allOn) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        if (next.size === 0) setActiveAmb(null);
        return next;
      }
      setActiveAmb(g.ambassadorId);
      return new Set(ids);
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setActiveAmb(null);
  }

  return (
    <div className="space-y-7 pb-24">
      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <KpiTile
          icon={Wallet}
          tint="rgba(214,138,20,0.12)"
          value={inrCompact(totalOwed)}
          label="Commission Owed"
          sub={`${owed.length} ${owed.length === 1 ? "referral" : "referrals"} awaiting payout`}
        />
        <KpiTile
          icon={Check}
          tint="rgba(20,140,80,0.12)"
          value={inrCompact(totalPaid)}
          label="Commission Paid"
          sub={`${paid.length} ${paid.length === 1 ? "referral" : "referrals"} settled`}
        />
        <KpiTile
          icon={Receipt}
          tint="rgba(225,6,0,0.10)"
          value={String(owedAmbassadors)}
          label={owedAmbassadors === 1 ? "Partner Owed Money" : "Partners Owed Money"}
          sub="Ready to settle"
        />
      </div>

      {/* ── Owed, grouped by ambassador ── */}
      <section>
        <SectionHeading title="Owed" hint="Select referrals from one partner, then record a payout." />
        {groups.length === 0 ? (
          <EmptyState icon={Check} text="Nothing owed — every commission is settled." />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const locked = activeAmb != null && activeAmb !== g.ambassadorId;
              const ids = g.rows.map((r) => r.id);
              const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
              return (
                <div
                  key={g.ambassadorId}
                  className="rounded-2xl border border-hairline bg-white"
                  style={{ boxShadow: CARD_SHADOW, opacity: locked ? 0.55 : 1, transition: "opacity 160ms ease" }}
                >
                  {/* group header */}
                  <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 max-sm:px-3">
                    <label className="flex cursor-pointer items-center" title={locked ? "Finish the current selection first" : "Select all referrals"}>
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] cursor-pointer accent-[color:var(--color-altus-red)] disabled:cursor-not-allowed"
                        checked={allOn}
                        disabled={locked}
                        onChange={() => toggleGroup(g)}
                        aria-label={`Select all referrals from ${g.ambassadorName}`}
                      />
                    </label>
                    <Avatar name={g.ambassadorName} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-ink-strong">{g.ambassadorName}</div>
                      <div className="text-[12px] font-semibold text-ink-muted">
                        {g.rows.length} {g.rows.length === 1 ? "referral" : "referrals"} owed
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[16px] font-extrabold tabular-nums text-ink-strong">{inr(g.subtotal)}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Subtotal</div>
                    </div>
                  </div>

                  {/* desktop table */}
                  <table className="w-full border-collapse text-left max-sm:hidden">
                    <tbody>
                      {g.rows.map((r) => {
                        const on = selected.has(r.id);
                        return (
                          <tr
                            key={r.id}
                            className="cursor-pointer transition-colors hover:bg-surface-soft"
                            style={{ borderBottom: "1px solid var(--color-hairline)", background: on ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" : undefined }}
                            onClick={() => !locked && toggleRow(r)}
                          >
                            <td className="w-12 px-4 py-3 align-middle">
                              <input
                                type="checkbox"
                                className="h-[18px] w-[18px] cursor-pointer accent-[color:var(--color-altus-red)] disabled:cursor-not-allowed"
                                checked={on}
                                disabled={locked}
                                onChange={() => toggleRow(r)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select referral for ${r.prospectName}`}
                              />
                            </td>
                            <td className="px-2 py-3 align-middle">
                              <div className="font-semibold text-ink-strong">{r.prospectName}</div>
                              {r.prospectCompany && <div className="text-[12.5px] text-ink-subtle">{r.prospectCompany}</div>}
                            </td>
                            <td className="px-4 py-3 align-middle text-[13.5px] tabular-nums text-ink-soft">
                              {r.dealAmount != null ? <>Deal {inr(r.dealAmount)}</> : <span className="text-ink-subtle">—</span>}
                            </td>
                            <td className="px-2 py-3 align-middle">
                              {r.commissionBasis && <StatusPill text={r.commissionBasis} tone="slate" />}
                            </td>
                            <td className="px-4 py-3 text-right align-middle">
                              <span className="text-[15px] font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount ?? 0)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* mobile cards */}
                  <div className="sm:hidden">
                    {g.rows.map((r) => {
                      const on = selected.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={locked}
                          onClick={() => toggleRow(r)}
                          className="flex w-full items-start gap-3 border-b border-hairline px-3 py-3 text-left transition-colors disabled:cursor-not-allowed"
                          style={{ background: on ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" : undefined }}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-[18px] w-[18px] accent-[color:var(--color-altus-red)]"
                            checked={on}
                            disabled={locked}
                            readOnly
                            aria-label={`Select referral for ${r.prospectName}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink-strong">{r.prospectName}</div>
                            {r.prospectCompany && <div className="text-[12.5px] text-ink-subtle">{r.prospectCompany}</div>}
                            <div className="mt-1 flex items-center gap-2">
                              {r.dealAmount != null && <span className="text-[12.5px] tabular-nums text-ink-soft">Deal {inr(r.dealAmount)}</span>}
                              {r.commissionBasis && <StatusPill text={r.commissionBasis} tone="slate" />}
                            </div>
                          </div>
                          <span className="text-[15px] font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount ?? 0)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Payment history ── */}
      <section>
        <SectionHeading title="Payment History" hint="Commissions already settled, newest first." icon={History} />
        {paid.length === 0 ? (
          <EmptyState icon={History} text="No payouts recorded yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-hairline bg-white" style={{ boxShadow: PANEL_SHADOW }}>
            <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Th>Settled</Th>
                  <Th>Partner</Th>
                  <Th>Prospect</Th>
                  <Th>Basis</Th>
                  <Th right>Commission</Th>
                </tr>
              </thead>
              <tbody>
                {paid.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td>{fmtDate(r.createdAt ?? null)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={r.ambassadorName} size={24} />
                        <span className="font-semibold text-ink-strong">{r.ambassadorName}</span>
                      </span>
                    </Td>
                    <Td>
                      <div className="text-ink-strong">{r.prospectName}</div>
                      {r.prospectCompany && <div className="text-[12.5px] text-ink-subtle">{r.prospectCompany}</div>}
                    </Td>
                    <Td>{r.commissionBasis ? <StatusPill text={r.commissionBasis} tone="green" /> : <span className="text-ink-subtle">—</span>}</Td>
                    <Td right><span className="text-[14px] font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount ?? 0)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sticky action bar ── */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white/95 backdrop-blur px-8 py-3.5 max-md:px-4" style={{ boxShadow: "0 -10px 30px -20px rgba(0,0,0,0.4)" }}>
          <div className="mx-auto flex w-full items-center gap-4">
            <div className="flex items-center gap-3">
              {activeGroup && <Avatar name={activeGroup.ambassadorName} size={32} />}
              <div>
                <div className="text-[13px] font-semibold text-ink-muted">
                  {selected.size} {selected.size === 1 ? "referral" : "referrals"} selected{activeGroup ? ` · ${activeGroup.ambassadorName}` : ""}
                </div>
                <div className="text-[20px] font-extrabold tabular-nums text-ink-strong">{inr(selectedTotal)}</div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white py-2.5 px-4 text-[14px] font-bold text-ink-soft transition-colors hover:text-altus-red"
              >
                <X size={15} strokeWidth={2.6} /> Clear
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}
              >
                <Wallet size={16} strokeWidth={2.6} /> Record Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && activeGroup && (
        <PayoutModal
          group={activeGroup}
          referralIds={Array.from(selected)}
          defaultAmount={selectedTotal}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Payout modal ──────────────────────────────────────────────────────────────
function PayoutModal({
  group,
  referralIds,
  defaultAmount,
  onClose,
  onDone,
}: {
  group: Group;
  referralIds: string[];
  defaultAmount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(String(Math.round(defaultAmount * 100) / 100));
  const [paidOn, setPaidOn] = React.useState(todayISO());
  const [method, setMethod] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    amountRef.current?.focus();
    amountRef.current?.select();
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (busy) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      fireToast({ message: "Enter a valid payout amount.", type: "error" });
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    const res = await recordPayout({
      ambassadorId: group.ambassadorId,
      amount: amt,
      paidOn,
      method: method.trim() || undefined,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      referralIds,
    });
    setBusy(false);
    if (res.ok) {
      fireToast({ message: `Payout of ${inr(amt)} recorded for ${group.ambassadorName}.`, type: "success" });
      onDone();
    } else {
      fireToast({ message: res.error || "Couldn't record the payout.", type: "error" });
    }
  }

  function onFormKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Record payout"
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-hairline bg-white"
        style={{ boxShadow: "0 30px 70px -30px rgba(0,0,0,0.55)" }}
        onKeyDown={onFormKeyDown}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <Avatar name={group.ambassadorName} size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-bold text-ink-strong">{group.ambassadorName}</div>
            <div className="text-[12.5px] font-semibold text-ink-muted">
              Settling {referralIds.length} {referralIds.length === 1 ? "referral" : "referrals"}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-surface-soft hover:text-altus-red">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* body */}
        <div className="space-y-4 px-5 py-5">
          <Field label="Amount (₹)">
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT + " tabular-nums"}
              aria-label="Payout amount"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Paid On">
              <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={INPUT} aria-label="Paid on date" />
            </Field>
            <Field label="Method">
              <input
                type="text"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="UPI, NEFT, cash…"
                className={INPUT}
                aria-label="Payment method"
              />
            </Field>
          </div>
          <Field label="Reference">
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / cheque no. (optional)"
              className={INPUT}
              aria-label="Payment reference"
            />
          </Field>
          <Field label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note…"
              className={INPUT + " resize-none"}
              aria-label="Payout note"
            />
          </Field>

          {Math.abs(Number(amount) - defaultAmount) > 0.005 && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium" style={{ background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)", color: "var(--color-altus-red-deep)" }}>
              <AlertCircle size={15} strokeWidth={2.4} className="mt-px shrink-0" />
              <span>Amount differs from the selected total of {inr(defaultAmount)}. The selected referrals will still be marked paid.</span>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-hairline-strong bg-white py-2.5 px-4 text-[14px] font-bold text-ink-soft transition-colors hover:text-altus-red"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}
          >
            <Check size={16} strokeWidth={2.6} /> {busy ? "Recording…" : "Record Payout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────
const INPUT =
  "w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}

function KpiTile({
  icon: Icon,
  tint,
  value,
  label,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tint: string;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="mb-2 inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: tint }}>
        <Icon size={17} strokeWidth={2.5} className="text-ink-strong" />
      </div>
      <div
        className="text-ink-strong tabular-nums"
        style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: "clamp(22px,2.2vw,30px)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">{label}</div>
      {sub && <div className="text-[11.5px] font-medium text-ink-soft">{sub}</div>}
    </div>
  );
}

function SectionHeading({
  title,
  hint,
  icon: Icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="flex items-center gap-2 text-[17px] font-extrabold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui" }}>
        {Icon && <Icon size={17} strokeWidth={2.5} className="text-ink-soft" />}
        {title}
      </h2>
      {hint && <span className="text-[12.5px] font-medium text-ink-muted">{hint}</span>}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; text: string }) {
  return (
    <div className="rounded-2xl border border-solid border-hairline-strong bg-white px-5 py-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
      <Icon size={26} strokeWidth={2} className="mx-auto mb-2 text-ink-subtle" />
      <p className="text-[14.5px] font-semibold text-ink-muted">{text}</p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap ${right ? "text-right" : "text-left"}`}
      style={{ background: "var(--color-surface-soft)" }}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3 align-middle text-[14px] text-ink-soft ${right ? "text-right" : ""}`}>{children}</td>;
}

function StatusPill({ text, tone }: { text: string; tone: "slate" | "green" }) {
  const map = {
    slate: { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
    green: { bg: "color-mix(in srgb, var(--color-green) 14%, transparent)", fg: "var(--color-green-deep)" },
  }[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: map.bg, color: map.fg }}>
      {text}
    </span>
  );
}
