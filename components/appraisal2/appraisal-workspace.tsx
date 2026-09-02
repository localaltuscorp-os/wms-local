"use client";

/**
 * Appraisal v2 — ROLE-BASED SCORECARD WORKBENCH (the star of the module).
 *
 * One live rolling scorecard per employee. A department filter feeds an employee
 * picker; the selected person gets an OVERALL SCORE RING + rating + status + the
 * Final Incentive Authorization %, then their ROLE's dimension cards (Manager or
 * Non-Manager, sourced from the shared framework). Clicking a card EXPANDS its
 * section below (cumulative — sections stack, never replace).
 *
 *   • KPI dimension  — the incentive engine. Management enters the raw actual per
 *     KPI-dictionary line; the internal KPI % (= Final Incentive Authorization %)
 *     recomputes live.
 *   • Every other dimension — a 0-100 score scored Self (advisory) + Manager
 *     (advisory) + Management (FINAL). Tier inputs enable only for the viewer's tier.
 *   • Dossier         — the 4-section Performance & Incentive Dossier.
 *
 * Brand tokens only; keyboard-first; calls the score/admin server actions exactly.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Award,
  Check,
  ChevronDown,
  Coins,
  FileText,
  Loader2,
  Lock,
  Save,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import {
  ratingBand,
  type PerDimension,
  type RoleClass,
  type ScoreTier,
} from "@/lib/appraisal2/types";
import type { ScorecardData } from "@/lib/appraisal2/data";
import { computeKpi } from "@/lib/performance/scoring";
import {
  setKpiActual,
  setDimensionScore,
  finalizeScorecard,
} from "@/app/(app)/appraisal/score-actions";
import { setRoleClass } from "@/app/(app)/appraisal/admin-actions";
import { PerformanceDossier } from "@/components/appraisal2/dossier";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";
const INPUT =
  "w-full rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-60 disabled:cursor-not-allowed";

export interface WorkspacePerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
}

type ActionResult = { ok: true } | { ok: false; error: string };

// ─── shared bits ──────────────────────────────────────────────────────────────

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const run = React.useCallback(
    async (fn: () => Promise<ActionResult>, successMsg: string): Promise<boolean> => {
      setBusy(true);
      setOk(false);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      setOk(true);
      window.setTimeout(() => setOk(false), 1500);
      fireToast({ message: successMsg, type: "success" });
      router.refresh();
      return true;
    },
    [router],
  );
  return { busy, ok, run };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-subtle">{children}</span>
  );
}

function SaveButton({ busy, ok, disabled, label = "Save" }: { busy: boolean; ok: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -12px ${RED_DEEP}` }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} strokeWidth={2.6} /> : <Save size={14} strokeWidth={2.4} />}
      {busy ? "Saving…" : ok ? "Saved" : label}
    </button>
  );
}

function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-subtle">
      <Lock size={12} /> {children}
    </p>
  );
}

function isScore(v: string): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ─── overall score ring ─────────────────────────────────────────────────────────

function ScoreRing({ value, color, size = 128 }: { value: number; color: string; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="wg-ring-glow" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {clamped.toFixed(1)}
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">/ 100</span>
      </div>
    </div>
  );
}

// ─── tier score trio ────────────────────────────────────────────────────────────

interface TierState {
  score: string;
  note: string;
}

function TierColumn({
  label,
  tier,
  editTier,
  savedScore,
  savedNote,
  state,
  onChange,
  noteLabel,
  isFinal,
}: {
  label: string;
  tier: ScoreTier;
  editTier: ScoreTier | null;
  savedScore: number | null;
  savedNote: string | null;
  state: TierState;
  onChange: (next: TierState) => void;
  noteLabel: string;
  isFinal?: boolean;
}) {
  const editable = tier === editTier;
  const accent = isFinal ? RED : "var(--color-hairline)";
  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 rounded-xl p-2.5"
      style={{
        background: isFinal ? `color-mix(in srgb, ${RED} 6%, transparent)` : "var(--color-surface-soft)",
        boxShadow: `inset 0 0 0 ${isFinal ? "1.5px" : "1px"} ${accent}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <Label>{label}</Label>
        {isFinal ? (
          <span className="inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white" style={{ background: RED }}>
            <ShieldCheck size={10} strokeWidth={2.6} /> Final
          </span>
        ) : (
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-subtle">Advisory</span>
        )}
      </div>
      {editable ? (
        <>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            className={INPUT}
            value={state.score}
            placeholder="0–100"
            onChange={(e) => onChange({ ...state, score: e.target.value })}
          />
          <textarea
            rows={2}
            className={`${INPUT} resize-none !py-1.5 text-[12.5px]`}
            value={state.note}
            placeholder={noteLabel}
            onChange={(e) => onChange({ ...state, note: e.target.value })}
          />
        </>
      ) : (
        <>
          <div
            className="tabular-nums flex h-[38px] items-center rounded-xl bg-surface-card px-3 text-[16px] font-black text-ink-strong"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            {savedScore ?? "—"}
            {savedScore != null && <span className="ml-0.5 text-[11px] font-bold text-ink-subtle">%</span>}
          </div>
          {savedNote ? (
            <p className="line-clamp-2 text-[12px] font-medium text-ink-muted">{savedNote}</p>
          ) : (
            <p className="text-[12px] font-medium text-ink-subtle/70">No note</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── dimension section wrapper ──────────────────────────────────────────────────

function SectionShell({
  p,
  onClose,
  children,
}: {
  p: PerDimension;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const band = ratingBand(p.pct);
  return (
    <section className="wg-rise rounded-[22px] p-5 max-md:p-4" style={{ background: "var(--color-surface-card)", boxShadow: CARD_SHADOW }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-1.5 rounded-full" style={{ background: band.color }} />
          <div>
            <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em" }}>
              {p.label}
            </h3>
            <p className="text-[12.5px] font-semibold text-ink-subtle">
              Weight {p.weight} · Effective {p.contribution.toFixed(1)} pts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums rounded-pill px-3 py-1.5 text-[14px] font-black" style={{ background: `color-mix(in srgb, ${band.color} 14%, transparent)`, color: band.color }}>
            {p.pct.toFixed(1)}%
          </span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle hover:text-[color:var(--color-altus-red)]" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }} aria-label="Collapse section">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

// ─── KPI incentive section (Management enters per-line actuals) ─────────────────

function KpiSection({ data }: { data: ScorecardData }) {
  const { busy, ok, run } = useAction();
  const canManage = data.viewer.canManagementScore;
  const target = data.kpiTarget;

  // Local editable actuals (lineId → string).
  const [actuals, setActuals] = React.useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.kpiActuals)) seed[k] = String(v);
    return seed;
  });

  // Live preview from the local edits (falls back to the saved figures).
  const preview = React.useMemo(() => {
    const nums: Record<string, number> = {};
    for (const [k, v] of Object.entries(actuals)) {
      const n = Number(v);
      if (Number.isFinite(n)) nums[k] = n;
    }
    return computeKpi(target, nums);
  }, [actuals, target]);

  if (!target || target.lines.length === 0) {
    return (
      <EmptyBox label="No KPI targets in the dictionary for this person — their KPI (incentive) dimension computes to 0." />
    );
  }

  function saveAll() {
    void run(async () => {
      // Persist each changed line; stop on the first error.
      for (const line of target!.lines) {
        const raw = actuals[line.id];
        if (raw === undefined || raw.trim() === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) continue;
        const saved = data.kpiActuals[line.id];
        if (saved !== undefined && Number(saved) === n) continue; // unchanged
        const res = await setKpiActual({ employeeId: data.employee.id, lineId: line.id, actual: n });
        if (!res.ok) return res;
      }
      return { ok: true } as const;
    }, "KPI actuals saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-surface-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              <th className="px-3 py-2.5">KPI Line</th>
              <th className="px-3 py-2.5 text-right">Monthly Target</th>
              <th className="px-3 py-2.5 text-right">Actual</th>
              <th className="px-3 py-2.5 text-right">Achievement</th>
              <th className="px-3 py-2.5 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((l) => {
              const pct = Math.round(l.micro * 100);
              const band = ratingBand(pct);
              return (
                <tr key={l.id} className="border-t border-hairline align-middle">
                  <td className="px-3 py-2.5">
                    <span className="block text-[13px] font-semibold leading-snug text-ink-strong">{l.label}</span>
                    <span className="text-[11px] font-medium text-ink-subtle">
                      {fmt(l.target)} / {l.period} · weight {l.intraWeight}
                      {l.unit ? ` · ${l.unit}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">{fmt(l.monthlyTarget)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      disabled={!canManage}
                      value={actuals[l.id] ?? ""}
                      onChange={(e) => setActuals((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      aria-label={`Actual for ${l.label}`}
                      className="w-[92px] rounded-lg border border-hairline bg-surface-soft px-2.5 py-1.5 text-right text-[13.5px] font-bold tabular-nums text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="tabular-nums inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-black" style={{ background: `color-mix(in srgb, ${band.color} 14%, transparent)`, color: band.color }}>
                      {pct}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] font-black tabular-nums" style={{ color: RED_DEEP }}>{fmt(l.weightedPoints)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Internal KPI = Final Incentive Authorization */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 14px 34px -20px rgba(168,4,0,0.8)" }}
      >
        <div className="flex items-center gap-2.5 text-white">
          <Coins size={18} />
          <span className="text-[13px] font-bold uppercase tracking-[0.12em]">Final Incentive Authorization</span>
        </div>
        <span className="tabular-nums text-[32px] font-black leading-none text-white" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          {fmt(preview.internalKPI)}%
        </span>
      </div>

      <p className="text-[12.5px] font-medium text-ink-subtle">
        KPI targets come from the shared KPI dictionary. Management enters the month&apos;s actual per line; the
        internal KPI % IS the incentive authorised. Weekly targets are scaled to the month automatically.
      </p>

      {canManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveAll}
            disabled={busy}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -12px ${RED_DEEP}` }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} strokeWidth={2.6} /> : <Save size={14} strokeWidth={2.4} />}
            {busy ? "Saving…" : ok ? "Saved" : "Save Actuals"}
          </button>
        </div>
      ) : (
        <LockNote>Only Management enters the KPI actuals.</LockNote>
      )}
    </div>
  );
}

// ─── generic 0-100 dimension section (Self / Manager / Management) ──────────────

function ScoreDimensionSection({ data, dimensionKey }: { data: ScorecardData; dimensionKey: string }) {
  const { busy, ok, run } = useAction();
  const row = data.dimensionScores.find((d) => d.dimensionKey === dimensionKey);

  const editTier: ScoreTier | null = data.viewer.canManagementScore
    ? "management"
    : data.viewer.canManagerScore
      ? "manager"
      : data.viewer.canSelfScore
        ? "self"
        : null;

  const [self, setSelf] = React.useState<TierState>({
    score: row?.selfScore != null ? String(row.selfScore) : "",
    note: row?.selfNote ?? "",
  });
  const [manager, setManager] = React.useState<TierState>({
    score: row?.managerScore != null ? String(row.managerScore) : "",
    note: row?.managerNote ?? "",
  });
  const [management, setManagement] = React.useState<TierState>({
    score: row?.managementScore != null ? String(row.managementScore) : "",
    note: row?.managementNote ?? "",
  });

  const activeState = editTier === "self" ? self : editTier === "manager" ? manager : management;
  const canSave = editTier != null && isScore(activeState.score);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editTier == null) return;
    if (!isScore(activeState.score)) {
      fireToast({ message: "Enter a score between 0 and 100.", type: "error" });
      return;
    }
    void run(
      () =>
        setDimensionScore({
          employeeId: data.employee.id,
          dimensionKey,
          tier: editTier,
          score: Number(activeState.score),
          note: activeState.note || undefined,
        }),
      "Score saved",
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <TierColumn label="Self" tier="self" editTier={editTier} savedScore={row?.selfScore ?? null} savedNote={row?.selfNote ?? null} state={self} onChange={setSelf} noteLabel="Self reflection" />
        <TierColumn label="Manager" tier="manager" editTier={editTier} savedScore={row?.managerScore ?? null} savedNote={row?.managerNote ?? null} state={manager} onChange={setManager} noteLabel="Manager note" />
        <TierColumn label="Management" tier="management" editTier={editTier} savedScore={row?.managementScore ?? null} savedNote={row?.managementNote ?? null} state={management} onChange={setManagement} noteLabel="Final note" isFinal />
      </div>
      {editTier ? (
        <div className="flex items-center justify-between">
          <span className="rounded-pill bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            You score: {editTier}
          </span>
          <SaveButton busy={busy} ok={ok} disabled={!canSave} />
        </div>
      ) : (
        <LockNote>You have no scoring tier for this person.</LockNote>
      )}
    </form>
  );
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-surface-soft p-6 text-center text-[13.5px] font-medium text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {label}
    </div>
  );
}

// ─── dimension card ─────────────────────────────────────────────────────────────

function DimensionCard({ p, open, onToggle }: { p: PerDimension; open: boolean; onToggle: () => void }) {
  const band = ratingBand(p.pct);
  const isKpi = p.kind === "kpi";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="wg-sheen wg-rise group flex flex-col gap-2 rounded-2xl p-3.5 text-left transition"
      style={{ background: "var(--color-surface-card)", boxShadow: open ? `inset 0 0 0 1.5px ${RED}, 0 10px 28px -20px rgba(15,23,42,0.35)` : CARD_SHADOW }}
      aria-expanded={open}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="flex items-center gap-1 text-[12.5px] font-bold leading-tight text-ink-strong">
          {isKpi && <Coins size={12} style={{ color: RED }} />}
          {p.label}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-subtle transition" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </div>
      <div className="tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", color: band.color, lineHeight: 1 }}>
        {p.pct.toFixed(0)}
        <span className="text-[12px] font-bold text-ink-subtle">%</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, background: band.color, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
        <span>Wt {p.weight}</span>
        <span className="tabular-nums">{p.contribution.toFixed(1)} pts</span>
      </div>
    </button>
  );
}

// ─── role toggle (admin) ────────────────────────────────────────────────────────

function RoleToggle({ employeeId, role }: { employeeId: string; role: RoleClass }) {
  const { busy, run } = useAction();
  function pick(next: RoleClass) {
    if (next === role || busy) return;
    void run(() => setRoleClass({ employeeId, roleClass: next }), "Role class updated");
  }
  return (
    <div className="inline-flex overflow-hidden rounded-pill" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {(["manager", "non-manager"] as const).map((r) => {
        const on = role === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => pick(r)}
            disabled={busy}
            className="px-3 py-1.5 text-[11.5px] font-bold transition disabled:opacity-60"
            style={{ background: on ? `linear-gradient(135deg, ${RED}, ${RED_DEEP})` : "transparent", color: on ? "#fff" : "var(--color-ink-muted)" }}
          >
            {r === "manager" ? "Manager" : "Non-Manager"}
          </button>
        );
      })}
    </div>
  );
}

// ─── scorecard (selected employee) ──────────────────────────────────────────────

function Scorecard({ data, isAdmin }: { data: ScorecardData; isAdmin: boolean }) {
  const sc = data.scorecard;
  const firstKey = sc.perDimension[0]?.key;
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(firstKey ? [firstKey] : []));
  const [showDossier, setShowDossier] = React.useState(false);
  const finalize = useAction();
  const finalized = sc.status === "finalized";
  const canFinalize = data.viewer.canManagementScore;

  const toggle = React.useCallback((k: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const openList = sc.perDimension.filter((p) => open.has(p.key));

  return (
    <div className="flex flex-col gap-5" key={data.employee.id}>
      {/* header */}
      <div className="wg-rise relative overflow-hidden rounded-[26px] p-6 max-md:p-4" style={{ background: "var(--color-surface-card)", boxShadow: CARD_SHADOW }}>
        <div className="flex flex-wrap items-center gap-6 max-md:gap-4">
          <ScoreRing value={sc.total} color={sc.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Avatar name={data.employee.name} avatarUrl={data.employee.avatarUrl} size={44} />
              <div className="min-w-0">
                <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px,2.4vw,30px)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                  {data.employee.name}
                </h2>
                <p className="truncate text-[13.5px] font-semibold text-ink-subtle">
                  {[data.employee.designation, data.employee.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-pill px-3 py-1.5 text-[12.5px] font-black text-white" style={{ background: sc.color }}>
                {sc.ratingLabel} · {sc.total.toFixed(1)}/100
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-black text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                <Coins size={13} strokeWidth={2.6} /> Incentive {sc.incentivePct.toFixed(1)}%
              </span>
              <span className="rounded-pill px-3 py-1.5 text-[12px] font-bold text-ink-strong" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                {sc.roleClass === "manager" ? "Manager" : "Non-Manager"}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold"
                style={{
                  background: finalized ? "color-mix(in srgb, #16a34a 14%, transparent)" : "var(--color-surface-soft)",
                  color: finalized ? "#15803d" : "var(--color-ink-muted)",
                  boxShadow: finalized ? "none" : "inset 0 0 0 1px var(--color-hairline)",
                }}
              >
                {finalized ? <ShieldCheck size={13} strokeWidth={2.6} /> : <Loader2 size={13} />}
                {finalized ? "Finalized" : "In Progress"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 max-md:w-full max-md:items-start">
            {isAdmin && <RoleToggle employeeId={data.employee.id} role={sc.roleClass} />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDossier((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-ink-strong"
                style={{ background: showDossier ? `color-mix(in srgb, ${RED} 10%, transparent)` : "var(--color-surface-soft)", boxShadow: showDossier ? `inset 0 0 0 1.5px ${RED}` : "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <FileText size={14} /> Dossier
              </button>
              {isAdmin && (
                <a
                  href={`/appraisal/admin?emp=${data.employee.id}` as Route}
                  className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-ink-strong"
                  style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <Settings2 size={14} /> Configure
                </a>
              )}
              {canFinalize && !finalized && (
                <button
                  type="button"
                  disabled={finalize.busy}
                  onClick={() => void finalize.run(() => finalizeScorecard(data.employee.id), "Scorecard finalized")}
                  className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 10px 24px -12px ${RED_DEEP}` }}
                >
                  {finalize.busy ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} strokeWidth={2.4} />}
                  Finalize
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* dossier (togglable) */}
      {showDossier && (
        <PerformanceDossier name={data.employee.name} roleClass={sc.roleClass} result={data.result} narrative={data.narrative} />
      )}

      {/* dimension cards */}
      <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-4 max-lg:grid-cols-3 max-sm:grid-cols-2">
        {sc.perDimension.map((p) => (
          <DimensionCard key={p.key} p={p} open={open.has(p.key)} onToggle={() => toggle(p.key)} />
        ))}
      </div>

      {/* cumulative expanded sections */}
      {openList.length === 0 ? (
        <div className="rounded-2xl bg-surface-card p-8 text-center text-[13.5px] font-medium text-ink-muted" style={{ boxShadow: CARD_SHADOW }}>
          Click any dimension above to open its scoring section. Sections stack here — open as many as you like.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {openList.map((p) => (
            <SectionShell key={p.key} p={p} onClose={() => toggle(p.key)}>
              {p.kind === "kpi" ? (
                <KpiSection data={data} />
              ) : (
                <ScoreDimensionSection data={data} dimensionKey={p.key} />
              )}
            </SectionShell>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── picker + workspace root ────────────────────────────────────────────────────

export function AppraisalWorkspace({
  people,
  departments,
  selectedId,
  data,
  isAdmin,
  basePath = "/appraisal",
}: {
  people: WorkspacePerson[];
  departments: string[];
  selectedId: string | null;
  data: ScorecardData | null;
  isAdmin: boolean;
  /**
   * The route this workbench is mounted at — where the person picker navigates.
   *
   * Appraisal now lives inside Team Productivity at `/productivity/appraisal`,
   * while `/appraisal` stays alive for old links. Hard-coding `/appraisal` in
   * the picker would have thrown anyone who selected a colleague out of the
   * Productivity room mid-task and swapped the sidebar under them. Defaulting to
   * `/appraisal` keeps every existing call site behaving exactly as before.
   */
  basePath?: string;
}) {
  const router = useRouter();
  const [dept, setDept] = React.useState<string | null>(null);

  const filtered = dept ? people.filter((p) => p.department === dept) : people;

  const grouped = React.useMemo(() => {
    const m = new Map<string, WorkspacePerson[]>();
    for (const p of filtered) {
      const key = p.department || "Unassigned";
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function go(id: string) {
    if (id) router.push(`${basePath}?emp=${id}` as Route);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* control bar */}
      <div className="wg-rise flex flex-wrap items-center gap-3 rounded-2xl bg-surface-card p-3.5" style={{ boxShadow: CARD_SHADOW }}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <DeptPill label="All" active={dept === null} onClick={() => setDept(null)} />
          {departments.map((d) => (
            <DeptPill key={d} label={d} active={dept === d} onClick={() => setDept(d)} />
          ))}
        </div>
        <select
          value={selectedId ?? ""}
          onChange={(e) => go(e.target.value)}
          className="min-w-[220px] rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
        >
          <option value="" disabled>
            Select a person…
          </option>
          {dept === null
            ? grouped.map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
        </select>
      </div>

      {data ? (
        <Scorecard data={data} isAdmin={isAdmin} />
      ) : (
        <div className="grid place-items-center rounded-[26px] bg-surface-card p-16 text-center" style={{ boxShadow: CARD_SHADOW }}>
          <div>
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              <Award size={26} strokeWidth={2.2} />
            </div>
            <p className="text-[15px] font-bold text-ink-strong">
              {people.length === 0 ? "No scorecards in your scope yet." : "Pick a person to open their live scorecard."}
            </p>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              KPI drives the incentive · Self and Manager advise · Management is the final score.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DeptPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill px-3 py-1.5 text-[12px] font-bold transition"
      style={{
        background: active ? `linear-gradient(135deg, ${RED}, ${RED_DEEP})` : "var(--color-surface-soft)",
        color: active ? "#fff" : "var(--color-ink-muted)",
        boxShadow: active ? "none" : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      {label}
    </button>
  );
}
