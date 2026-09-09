"use client";

import { useMemo, useState, useTransition } from "react";
import {
  saveCtcBreakup,
  saveRetentionBonus,
  addAdjustment,
  removeAdjustment,
} from "@/app/(app)/salary/ctc/actions";
import {
  applyAdjustments,
  type SalaryAdjustment,
} from "@/lib/salary/adjustments";
import { buildCtcBreakup } from "@/lib/salary/ctc-breakup";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";
const RED = "#e10600";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export interface CtcFormEmployee {
  employeeId: string;
  name: string;
  month: string; // YYYY-MM
  payingEntityId: string | null;
  payingEntityName: string | null;
  annualCtc: number;
  ptMonthly: number;
  /** per-day rate used to value adjustment days (proration v2). */
  perDay: number;
  /** baseline "Amount Payable" before adjustments (after-PT monthly payable). */
  amountPayableBeforeAdjust: number;
  components: { label: string; annualAmount: number }[];
  retention: {
    amount: number;
    payableDate: string | null;
    paid: boolean;
    paidDate: string | null;
    note: string | null;
  } | null;
  adjustments: {
    id: string;
    kind: "deduct" | "ex_gratia";
    days: number;
    reason: string;
  }[];
  /** When false, v2 math is dark — the form still saves but figures are muted. */
  v2Enabled: boolean;
}

export function CtcBreakupForm({ emp }: { emp: CtcFormEmployee }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── CTC components ──
  const [annualCtc, setAnnualCtc] = useState(emp.annualCtc);
  const [components, setComponents] = useState(
    emp.components.length
      ? emp.components
      : [{ label: "Basic", annualAmount: 0 }],
  );

  // ── Retention bonus ──
  const [rbAmount, setRbAmount] = useState(emp.retention?.amount ?? 0);
  const [rbPayable, setRbPayable] = useState(emp.retention?.payableDate ?? "");
  const [rbPaid, setRbPaid] = useState(emp.retention?.paid ?? false);
  const [rbPaidDate, setRbPaidDate] = useState(emp.retention?.paidDate ?? "");

  // ── Adjustment (new) ──
  const [adjKind, setAdjKind] = useState<"deduct" | "ex_gratia">("deduct");
  const [adjDays, setAdjDays] = useState(1);
  const [adjReason, setAdjReason] = useState("");

  const breakup = useMemo(
    () =>
      buildCtcBreakup({
        employeeId: emp.employeeId,
        employeeName: emp.name,
        payingEntityId: emp.payingEntityId,
        payingEntityName: emp.payingEntityName,
        annualCtc,
        components,
        retentionBonus:
          rbAmount > 0
            ? { amount: rbAmount, payableDate: rbPayable || null, paid: rbPaid }
            : null,
        ptMonthly: emp.ptMonthly,
      }),
    [emp, annualCtc, components, rbAmount, rbPayable, rbPaid],
  );

  const adjResult = useMemo(() => {
    const list: SalaryAdjustment[] = emp.adjustments.map((a) => ({
      kind: a.kind,
      days: a.days,
      reason: a.reason,
    }));
    return applyAdjustments({
      amountPayableBeforeAdjust: emp.amountPayableBeforeAdjust,
      perDay: emp.perDay,
      adjustments: list,
    });
  }, [emp]);

  function flash(r: { ok: boolean; error?: string }, okText: string) {
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Failed" });
  }

  return (
    <div className="grid gap-5">
      {msg && (
        <div
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold"
          style={{
            background: msg.ok ? "color-mix(in srgb, #E10600 12%, transparent)" : "color-mix(in srgb, #e10600 12%, transparent)",
            color: msg.ok ? GREEN_DEEP : RED,
          }}
        >
          {msg.text}
        </div>
      )}

      {!emp.v2Enabled && (
        <div
          className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold"
          style={{ background: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#92400e" }}
        >
          SALARY_V2 is OFF — you can edit and save these details, but computed figures stay dark until Sir flips the flag.
        </div>
      )}

      {/* ── CTC breakup ── */}
      <Card title="CTC Breakup" accent={GREEN}>
        <label className="block text-[12px] font-bold uppercase tracking-wide text-ink-subtle">
          Annual CTC
          <input
            type="number"
            value={annualCtc}
            onChange={(e) => setAnnualCtc(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] tabular-nums"
          />
        </label>

        <div className="mt-3 grid gap-2">
          {components.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={c.label}
                placeholder="Component (Basic, HRA…)"
                onChange={(e) => {
                  const next = [...components];
                  next[i] = { ...c, label: e.target.value };
                  setComponents(next);
                }}
                className="flex-1 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px]"
              />
              <input
                type="number"
                value={c.annualAmount}
                onChange={(e) => {
                  const next = [...components];
                  next[i] = { ...c, annualAmount: Number(e.target.value) || 0 };
                  setComponents(next);
                }}
                className="w-36 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] tabular-nums"
              />
              <button
                type="button"
                onClick={() => setComponents(components.filter((_, j) => j !== i))}
                className="rounded-lg px-2 py-1.5 text-[12px] font-bold text-ink-subtle hover:text-[color:var(--color-altus-red)]"
                aria-label="Remove component"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setComponents([...components, { label: "", annualAmount: 0 }])}
            className="justify-self-start rounded-lg px-3 py-1.5 text-[12px] font-bold"
            style={{ color: GREEN_DEEP, background: "color-mix(in srgb, #E10600 10%, transparent)" }}
          >
            + Add Component
          </button>
        </div>

        {breakup.ctcMismatch && (
          <p className="mt-2 text-[12px] font-semibold" style={{ color: RED }}>
            Components differ from Annual CTC by {inr(breakup.ctcMismatchAmount)}.
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <Stat label="Monthly CTC" value={emp.v2Enabled ? inr(breakup.monthlyCtc) : "—"} />
          <Stat label="PT / month" value={emp.v2Enabled ? inr(breakup.ptMonthly) : "—"} />
          <Stat
            label="Salary Payable (after PT)"
            value={emp.v2Enabled ? inr(breakup.monthlyPayableAfterPt) : "—"}
            strong
          />
        </dl>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCtcBreakup({
                employeeId: emp.employeeId,
                payingEntityId: emp.payingEntityId,
                annualCtc,
                components: components.filter((c) => c.label.trim()),
              });
              flash(r, "CTC breakup saved.");
            })
          }
          className="mt-3 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
        >
          Save CTC Breakup
        </button>
      </Card>

      {/* ── Retention bonus ── */}
      <Card title="Retention Bonus" accent="#7c3aed">
        <p className="mb-2 text-[12px] text-ink-subtle">
          Added before Salary Payable in the CTC breakup (with its date). Shown in the payslip
          <strong> only if actually paid</strong>.
        </p>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Field label="Amount">
            <input
              type="number"
              value={rbAmount}
              onChange={(e) => setRbAmount(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] tabular-nums"
            />
          </Field>
          <Field label="Payable date">
            <input
              type="date"
              value={rbPayable}
              onChange={(e) => setRbPayable(e.target.value)}
              className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px]"
            />
          </Field>
          <Field label="Paid?">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={rbPaid} onChange={(e) => setRbPaid(e.target.checked)} />
              Actually paid (show in payslip)
            </label>
          </Field>
          {rbPaid && (
            <Field label="Paid date">
              <input
                type="date"
                value={rbPaidDate}
                onChange={(e) => setRbPaidDate(e.target.value)}
                className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px]"
              />
            </Field>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveRetentionBonus({
                employeeId: emp.employeeId,
                amount: rbAmount,
                payableDate: rbPayable || null,
                paid: rbPaid,
                paidDate: rbPaid ? rbPaidDate || null : null,
              });
              flash(r, "Retention bonus saved.");
            })
          }
          className="brand-btn mt-3 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
        >
          Save Retention Bonus
        </button>
      </Card>

      {/* ── Accountant adjustments ── */}
      <Card title="Accountant Adjustments" accent={RED}>
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Amount Payable"
            value={emp.v2Enabled ? inr(adjResult.amountPayable) : "—"}
            strong
          />
          <Stat
            label="Amount Paid"
            value={emp.v2Enabled ? inr(adjResult.amountPaid) : "—"}
            strong
          />
        </div>
        {emp.v2Enabled && adjResult.amountPaid === 0 && adjResult.amountPayable > 0 && (
          <p className="mt-1 text-[12px] font-semibold" style={{ color: GREEN_DEEP }}>
            Account is nil for this month.
          </p>
        )}

        {emp.adjustments.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {emp.adjustments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-hairline px-3 py-1.5 text-[12.5px]"
              >
                <span>
                  <strong style={{ color: a.kind === "deduct" ? RED : GREEN_DEEP }}>
                    {a.kind === "deduct" ? `− ${a.days}d` : `+ ${a.days}d`}
                  </strong>{" "}
                  {a.reason}
                </span>
                <button
                  type="button"
                  onClick={() => start(async () => { const r = await removeAdjustment({ id: a.id }); flash(r, "Removed."); })}
                  className="text-ink-subtle hover:text-[color:var(--color-altus-red)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-end gap-2 max-sm:grid-cols-1">
          <Field label="Kind">
            <select
              value={adjKind}
              onChange={(e) => setAdjKind(e.target.value as "deduct" | "ex_gratia")}
              className="rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px]"
            >
              <option value="deduct">Deduct (disciplinary)</option>
              <option value="ex_gratia">Ex-gratia (add)</option>
            </select>
          </Field>
          <Field label="Days">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={adjDays}
              onChange={(e) => setAdjDays(Number(e.target.value) || 0)}
              className="w-24 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] tabular-nums"
            />
          </Field>
          <Field label="Reason (mandatory)">
            <input
              value={adjReason}
              placeholder="Why? — required"
              onChange={(e) => setAdjReason(e.target.value)}
              className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px]"
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={pending || adjReason.trim().length < 3 || adjDays <= 0}
          onClick={() =>
            start(async () => {
              const r = await addAdjustment({
                employeeId: emp.employeeId,
                month: emp.month,
                kind: adjKind,
                days: adjDays,
                reason: adjReason.trim(),
              });
              if (r.ok) setAdjReason("");
              flash(r, "Adjustment added.");
            })
          }
          className="mt-3 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${RED}, #a80400)` }}
        >
          Add Adjustment
        </button>
        {adjReason.trim().length > 0 && adjReason.trim().length < 3 && (
          <p className="mt-1 text-[12px] font-semibold" style={{ color: RED }}>
            Reason must be at least 3 characters.
          </p>
        )}
      </Card>
    </div>
  );
}

function Card({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl bg-surface-card px-5 py-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -22px rgba(15,23,42,0.35)" }}
    >
      <h3
        className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em]"
        style={{ color: accent }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd
        className="tabular-nums"
        style={{ fontWeight: strong ? 900 : 700, fontSize: strong ? 18 : 14 }}
      >
        {value}
      </dd>
    </div>
  );
}
