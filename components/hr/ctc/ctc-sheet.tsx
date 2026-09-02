"use client";

import { useMemo, useState } from "react";
import {
  CTC_COMPONENTS,
  GROUP_LABELS,
  annualOf,
  monthlyOf,
  computeTotals,
  formatINR,
  num,
  type CtcComponentDef,
  type CtcComponents,
  type CtcGroup,
} from "@/lib/hr/ctc/model";

const RED = "#E10600";
const RED_DEEP = "#A80400";

// Presentation order per the workbench spec: CTC summary on top, then
// Deductions → Employer Contributions → Earnings, then the Total ladder.
const GROUP_ORDER: CtcGroup[] = ["deduction", "employer", "earning"];
const GROUP_ACCENT: Record<CtcGroup, string> = {
  earning: "#0F766E",
  deduction: "#B45309",
  employer: "#4338CA",
};

/** The employee's share-of-CTC for a component (annual ÷ CTC annual). */
function pctOfCtc(annual: number, ctcAnnual: number): number {
  return ctcAnnual > 0 ? (annual / ctcAnnual) * 100 : 0;
}

/**
 * Solve for the NATIVE value that makes a component exactly `pct`% of CTC.
 * Earnings & employer contributions ADD to CTC, so we solve
 *   x = p·(othersCtc + x)  ⇒  x = p·othersCtc / (1 − p)
 * Deductions don't change CTC, so it's simply p·CTC. Returns the value in the
 * component's stored periodicity (monthly for /mo rows, annual for /yr rows).
 */
function pctToNativeValue(
  def: CtcComponentDef,
  pct: number,
  ctcAnnual: number,
  currentAnnual: number,
): number {
  const p = Math.max(0, Math.min(99.99, pct)) / 100;
  const contributes = def.group === "earning" || def.group === "employer";
  let newAnnual: number;
  if (contributes) {
    const othersAnnual = Math.max(0, ctcAnnual - currentAnnual);
    newAnnual = 1 - p > 0 ? (p * othersAnnual) / (1 - p) : 0;
  } else {
    newAnnual = p * ctcAnnual;
  }
  return def.periodicity === "monthly" ? Math.round(newAnnual / 12) : Math.round(newAnnual);
}

/**
 * The structured CTC sheet. A CTC hero on top, then grouped sections
 * (Deductions / Employer Contributions / Earnings) — each row carrying a Monthly
 * figure, an Annual figure, and a two-way **% of CTC** box. The native-periodicity
 * money column is an editable input, the other is derived live; the % is
 * auto-calculated from the amount AND editable (typing a % back-solves the amount
 * so the line becomes exactly that share of CTC). Everything recomputes on every
 * keystroke. Presentational — money state lives in the workbench.
 */
export function CtcSheet({
  components,
  onChange,
  onCommit,
  disabled,
}: {
  components: CtcComponents;
  onChange: (id: string, value: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  const totals = useMemo(() => computeTotals(components), [components]);

  return (
    <div className="ctc-sheet">
      <style>{SHEET_CSS}</style>

      {/* ── CTC hero — the total, on top ─────────────────────── */}
      <div className="ctc-top">
        <span className="ctc-top-label">Cost to Company (CTC)</span>
        <span className="ctc-top-figs">
          <span className="ctc-top-annual">{formatINR(totals.ctcAnnual)}<span className="ctc-top-unit">/yr</span></span>
          <span className="ctc-top-monthly">{formatINR(totals.ctcMonthly)}<span className="ctc-top-unit">/mo</span></span>
        </span>
      </div>

      <div className="ctc-grid-head" aria-hidden>
        <span>Component</span>
        <span className="ctc-num">Monthly</span>
        <span className="ctc-num">Annual</span>
        <span className="ctc-num">% CTC</span>
      </div>

      {GROUP_ORDER.map((group) => {
        const rows = CTC_COMPONENTS.filter((c) => c.group === group);
        const sub = subtotal(group, components);
        const subPct = pctOfCtc(sub.annual, totals.ctcAnnual);
        return (
          <section key={group} className="ctc-group" style={{ ["--accent" as string]: GROUP_ACCENT[group] }}>
            <header className="ctc-group-head">
              <span className="ctc-group-dot" />
              <span className="ctc-group-name">{GROUP_LABELS[group]}</span>
            </header>

            {rows.map((def) => {
              const value = num(components[def.id]);
              const curAnnual = annualOf(def, value);
              return (
                <Row
                  key={def.id}
                  def={def}
                  value={value}
                  pct={pctOfCtc(curAnnual, totals.ctcAnnual)}
                  onChange={(v) => onChange(def.id, v)}
                  onPctChange={(p) => onChange(def.id, pctToNativeValue(def, p, totals.ctcAnnual, curAnnual))}
                  onCommit={onCommit}
                  disabled={disabled}
                />
              );
            })}

            <div className="ctc-subtotal">
              <span>Total {GROUP_LABELS[group]}</span>
              <span className="ctc-num">{formatINR(sub.monthly)}</span>
              <span className="ctc-num">{formatINR(sub.annual)}</span>
              <span className="ctc-num">{subPct ? `${subPct.toFixed(1)}%` : "—"}</span>
            </div>
          </section>
        );
      })}

      {/* ── Total ladder: Gross → Net ────────────────────────── */}
      <section className="ctc-ladder">
        <LadderRow label="Gross Salary" monthly={totals.grossMonthly} annual={totals.grossAnnual} />
        <LadderRow label="Less: Deductions" monthly={-totals.deductionsMonthly} annual={-totals.deductionsAnnual} muted />
        <LadderRow label="Net Take-Home" monthly={totals.netMonthly} annual={totals.netAnnual} strong />
      </section>
    </div>
  );
}

function subtotal(group: CtcGroup, components: CtcComponents): { monthly: number; annual: number } {
  let monthly = 0;
  for (const def of CTC_COMPONENTS) {
    if (def.group !== group) continue;
    monthly += monthlyOf(def, num(components[def.id]));
  }
  return { monthly, annual: monthly * 12 };
}

function Row({
  def,
  value,
  pct,
  onChange,
  onPctChange,
  onCommit,
  disabled,
}: {
  def: CtcComponentDef;
  value: number;
  pct: number;
  onChange: (v: number) => void;
  onPctChange: (pct: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  const monthly = monthlyOf(def, value);
  const annual = annualOf(def, value);
  const nativeMonthly = def.periodicity === "monthly";

  const input = (
    <input
      type="text"
      inputMode="numeric"
      className="ctc-input"
      value={value ? String(value) : ""}
      placeholder="—"
      disabled={disabled}
      aria-label={`${def.label} (${def.periodicity})`}
      onChange={(e) => onChange(num(e.target.value))}
      onBlur={onCommit}
      onFocus={(e) => e.currentTarget.select()}
    />
  );

  return (
    <div className="ctc-row">
      <span className="ctc-row-label">
        {def.label}
        <span className="ctc-row-native">{nativeMonthly ? "/mo" : "/yr"}</span>
      </span>
      <span className="ctc-num ctc-cell">
        {nativeMonthly ? input : <span className="ctc-derived">{monthly ? formatINR(monthly) : "—"}</span>}
      </span>
      <span className="ctc-num ctc-cell">
        {nativeMonthly ? <span className="ctc-derived">{annual ? formatINR(annual) : "—"}</span> : input}
      </span>
      <span className="ctc-num ctc-cell">
        <PctInput pct={pct} onCommitPct={onPctChange} onCommit={onCommit} disabled={disabled} label={def.label} />
      </span>
    </div>
  );
}

/**
 * The two-way % cell. While focused it holds a local string so typing "40" isn't
 * fought by the live-recompute; on Enter/blur it back-solves the amount. When
 * idle it shows the auto-calculated share of CTC.
 */
function PctInput({
  pct,
  onCommitPct,
  onCommit,
  disabled,
  label,
}: {
  pct: number;
  onCommitPct: (pct: number) => void;
  onCommit: () => void;
  disabled?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (pct ? pct.toFixed(1) : "");

  function commit() {
    if (draft !== null) {
      const p = Number(draft.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(p)) onCommitPct(p);
      setDraft(null);
      onCommit();
    }
  }

  return (
    <span className="ctc-pctwrap">
      <input
        type="text"
        inputMode="decimal"
        className="ctc-input ctc-pct"
        value={shown}
        placeholder="—"
        disabled={disabled}
        aria-label={`${label} — percent of CTC`}
        onFocus={(e) => { setDraft(pct ? pct.toFixed(1) : ""); requestAnimationFrame(() => e.currentTarget.select()); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      />
      <span className="ctc-pct-sign">%</span>
    </span>
  );
}

function LadderRow({
  label,
  monthly,
  annual,
  muted,
  strong,
}: {
  label: string;
  monthly: number;
  annual: number;
  muted?: boolean;
  strong?: boolean;
}) {
  const cls = strong ? "ctc-ladder-row ctc-ladder-strong" : muted ? "ctc-ladder-row ctc-ladder-muted" : "ctc-ladder-row";
  return (
    <div className={cls}>
      <span>{label}</span>
      <span className="ctc-num">{formatINR(monthly)}</span>
      <span className="ctc-num">{formatINR(annual)}</span>
      <span className="ctc-num" aria-hidden />
    </div>
  );
}

const COLS = "1fr 132px 132px 84px";

const SHEET_CSS = `
.ctc-sheet{
  border:1px solid var(--color-hairline, #e2e8f0);
  border-radius:18px;background:#fff;overflow:hidden;
  box-shadow:0 24px 60px -40px rgba(15,23,42,.4);
}
.ctc-top{
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:16px 22px;background:linear-gradient(120deg, ${RED}, ${RED_DEEP});color:#fff;
}
.ctc-top-label{font-family:var(--font-display, system-ui, sans-serif);font-size:12.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.92;}
.ctc-top-figs{display:flex;align-items:baseline;gap:18px;font-variant-numeric:tabular-nums;}
.ctc-top-annual{font-family:var(--font-display, system-ui, sans-serif);font-size:26px;font-weight:900;letter-spacing:-.01em;}
.ctc-top-monthly{font-size:15px;font-weight:700;opacity:.9;}
.ctc-top-unit{font-size:12px;font-weight:700;opacity:.8;margin-left:2px;}
.ctc-grid-head{
  display:grid;grid-template-columns:${COLS};gap:8px;
  padding:13px 20px;align-items:center;
  background:linear-gradient(180deg, #f3f4f7, #e9ebf0);
  border-bottom:2px solid var(--color-hairline-strong, #cbd5e1);
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
  color:var(--color-ink-soft, #475569);
}
.ctc-num{text-align:right;font-variant-numeric:tabular-nums;}
/* Column dividers — vertical lines between Component | Monthly | Annual | %CTC */
.ctc-grid-head > .ctc-num,
.ctc-row > .ctc-num,
.ctc-subtotal > .ctc-num,
.ctc-ladder-row > .ctc-num{
  border-left:1px solid var(--color-hairline, #e4e7ee);
  padding-left:10px;
}
.ctc-group{border-bottom:1px solid var(--color-hairline-strong, #d7dce4);}
.ctc-group-head{
  display:flex;align-items:center;gap:9px;padding:10px 20px;
  background:color-mix(in srgb, var(--accent) 12%, #fff);
  border-top:1px solid color-mix(in srgb, var(--accent) 30%, #fff);
  border-bottom:1px solid color-mix(in srgb, var(--accent) 24%, #fff);
}
.ctc-group-dot{width:10px;height:10px;border-radius:9999px;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);}
.ctc-group-name{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:14px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;
  color:var(--accent);
}
.ctc-row{
  display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;
  padding:8px 20px;transition:background .12s ease;
  border-bottom:1px solid var(--color-hairline, #eef0f4);
}
.ctc-row:last-of-type{border-bottom:none;}
.ctc-row:nth-of-type(even){background:#fafbfc;}
.ctc-row:hover{background:color-mix(in srgb, var(--accent) 6%, transparent);}
.ctc-row-label{
  display:flex;align-items:baseline;gap:8px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
}
.ctc-row-native{
  font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--color-ink-muted, #94a3b8);
  padding:1px 6px;border-radius:6px;background:var(--color-surface-soft, #f1f5f9);
}
.ctc-cell{display:flex;justify-content:flex-end;align-items:center;}
.ctc-derived{font-size:13.5px;font-weight:600;color:var(--color-ink-muted, #64748b);font-variant-numeric:tabular-nums;}
.ctc-input{
  width:120px;text-align:right;
  padding:7px 10px;border-radius:9px;
  font-size:14px;font-weight:700;color:var(--color-ink-strong, #0f172a);
  font-variant-numeric:tabular-nums;
  background:#fff;border:1.5px solid var(--color-hairline-strong, #cbd5e1);
  transition:border-color .12s ease, box-shadow .12s ease, background .12s ease;
}
.ctc-input::placeholder{color:#cbd5e1;font-weight:600;}
.ctc-input:hover:not(:disabled){border-color:var(--color-ink-muted, #94a3b8);}
.ctc-input:focus{outline:none;border-color:${RED};background:rgba(225,6,0,.04);box-shadow:0 0 0 3px rgba(225,6,0,.13);}
.ctc-input:disabled{background:var(--color-surface-soft, #f8fafc);color:var(--color-ink-muted, #94a3b8);}
.ctc-pctwrap{position:relative;display:inline-flex;align-items:center;}
.ctc-pct{width:64px;padding-right:20px;}
.ctc-pct-sign{position:absolute;right:9px;font-size:12px;font-weight:800;color:var(--color-ink-muted, #94a3b8);pointer-events:none;}
.ctc-subtotal{
  display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;
  padding:9px 20px;margin-top:2px;
  border-top:1px dashed var(--color-hairline-strong, #d7dce4);
  font-size:13px;font-weight:800;color:var(--accent);
  font-variant-numeric:tabular-nums;
}
/* Total ladder */
.ctc-ladder{padding:10px 8px 12px;background:linear-gradient(180deg, #fbfbfd, #f6f6f9);}
.ctc-ladder-row{
  display:grid;grid-template-columns:${COLS};gap:8px;align-items:center;
  padding:8px 12px;border-radius:10px;
  font-size:14px;font-weight:700;color:var(--color-ink-strong, #0f172a);
  font-variant-numeric:tabular-nums;
}
.ctc-ladder-muted{color:var(--color-ink-muted, #64748b);font-weight:600;font-size:13.5px;}
.ctc-ladder-strong{background:#fff;border:1px solid var(--color-hairline, #e2e8f0);font-weight:800;}
@media (max-width:680px){
  .ctc-grid-head,.ctc-row,.ctc-subtotal,.ctc-ladder-row{grid-template-columns:1fr 84px 84px 60px;}
  .ctc-input{width:78px;padding:6px 8px;font-size:13px;}
  .ctc-pct{width:52px;}
}
`;

export default CtcSheet;
