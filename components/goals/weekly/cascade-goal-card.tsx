"use client";

import * as React from "react";
import { Link2, Pencil, ExternalLink, Check, X, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import {
  setWeeklyAdopted,
  updateWeeklyCascadeFields,
} from "@/app/(app)/goals/weekly/actions";
import { TeamInvolvedEditor } from "./team-involved-editor";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption, RosterMember } from "./types";

// Goals module identity (Altus brand red), token-first with a module-theme fallback.
const ACCENT = "var(--goals-accent, #E10600)";
const ACCENT_DEEP = "var(--goals-accent-deep, #A80400)";
const ACCENT_TINT = "color-mix(in srgb, var(--goals-accent, #E10600) 6%, transparent)";
const ACCENT_TINT_STRONG = "color-mix(in srgb, var(--goals-accent, #E10600) 12%, transparent)";

/** Google 0–100 grading colour: ≥70 green, 40–69 amber, <40 red. */
function gradeColor(pct: number): string {
  if (pct >= 70) return "#15803d";
  if (pct >= 40) return "#b45309";
  return "#b91c1c";
}

function toNum(s: string | null): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function fmtQty(s: string | null): string {
  const n = toNum(s);
  return n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtMoney(s: string | null): string {
  const n = toNum(s);
  return n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function CascadeGoalCard({
  goal,
  me,
  roster,
  monthGoalOptions,
  index,
}: {
  goal: CascadeWeeklyGoal;
  me: BoardMe;
  roster: RosterMember[];
  monthGoalOptions: MonthGoalOption[];
  index: number;
}) {
  const canEdit = me.isAdmin || goal.employeeId === me.id || roster.some((r) => r.id === goal.employeeId && r.isActive);
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);

  const effective = goal.acceptPct ?? goal.pctDone;
  const color = gradeColor(effective);

  function toggleAdopt() {
    startTransition(async () => {
      const res = await setWeeklyAdopted({ id: goal.id, adopted: !goal.adopted });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.3) }}
      className="group/card relative overflow-hidden rounded-section border border-hairline bg-surface-card transition-shadow hover:shadow-lg"
      style={{
        opacity: goal.adopted ? 1 : 0.62,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: `linear-gradient(to bottom, ${color}, color-mix(in srgb, ${color} 70%, #000))` }}
      />

      <div className="flex items-start gap-3 p-4 pl-5">
        {/* Sr No + adopt toggle */}
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[12px] font-bold tabular-nums"
            style={{ background: ACCENT_TINT_STRONG, color: ACCENT_DEEP }}
          >
            {goal.position}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={toggleAdopt}
              disabled={pending}
              title={goal.adopted ? "Cross out (drop this week)" : "Re-adopt"}
              aria-pressed={goal.adopted}
              className={`wg-btn inline-flex h-5 w-5 items-center justify-center rounded border ${
                goal.adopted
                  ? "border-transparent text-white"
                  : "border-hairline-strong bg-surface-card text-ink-soft"
              }`}
              style={goal.adopted ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` } : undefined}
            >
              {goal.adopted ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2">
            {goal.area && (
              <span
                className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                style={{ background: ACCENT_TINT_STRONG, color: ACCENT_DEEP }}
              >
                {goal.area}
              </span>
            )}
            <h3
              className={`text-ink-strong ${goal.adopted ? "" : "line-through"}`}
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 700, fontSize: 15.5 }}
            >
              {goal.subject || goal.targetDone || "Untitled goal"}
            </h3>
          </div>

          {/* Parent monthly-goal linkage */}
          <div className="mt-1.5">
            <ParentGoalPicker goal={goal} options={monthGoalOptions} canEdit={canEdit} />
          </div>

          {/* Stats */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Stat label={`Target${goal.uom ? ` · ${goal.uom}` : ""}`} value={fmtQty(goal.targetQty)} sub={`Actual ${fmtQty(goal.actualQty)}`} />
            <Stat label="Target amount" value={fmtMoney(goal.targetAmount)} sub={`Actual ${fmtMoney(goal.actualAmount)}`} />
            <Stat
              label="Dependency"
              value={goal.teamDependencyPct == null ? "—" : `${goal.teamDependencyPct}%`}
              sub="on team"
            />
          </div>

          {/* Team involved */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Team</span>
            <TeamInvolvedEditor goalId={goal.id} stored={goal.teamInvolved} roster={roster} canEdit={canEdit} />
          </div>

          {/* Footer */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-hairline pt-3">
            <ScoreBadge label="Self" pct={goal.pctDone} />
            <ScoreBadge label="Accepted" pct={goal.acceptPct} muted={goal.acceptPct == null} />
            {goal.committed && <StampBadge text="Committed" tone="commit" />}
            {goal.approvedByManager && <StampBadge text="Approved" tone="approve" />}
            {goal.carriedFromId && <StampBadge text="Carried in" tone="carry" />}
            <div className="ml-auto flex items-center gap-2">
              {goal.evidenceUrl && (
                <a
                  href={goal.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-muted hover:text-ink-strong"
                >
                  <ExternalLink size={12.5} /> Evidence
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="wg-btn inline-flex items-center gap-1 rounded-pill border border-hairline px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted hover:border-hairline-strong hover:text-ink-strong"
                >
                  <Pencil size={12} /> Fields
                  <ChevronDown size={12} className={editing ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
              )}
            </div>
          </div>

          {editing && canEdit && (
            <EditFieldsForm goal={goal} onDone={() => setEditing(false)} />
          )}
        </div>
      </div>
    </motion.article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-cell border border-hairline px-3 py-2"
      style={{
        background: `linear-gradient(180deg, ${ACCENT_TINT}, transparent)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">{label}</div>
      <div
        className="mt-0.5 text-[16px] font-bold tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] tabular-nums text-ink-soft">{sub}</div>}
    </div>
  );
}

function ScoreBadge({ label, pct, muted }: { label: string; pct: number | null; muted?: boolean }) {
  const val = pct ?? 0;
  const color = muted ? "#a1a1aa" : gradeColor(val);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2.5 py-1"
      style={{ background: muted ? undefined : `color-mix(in srgb, ${color} 7%, transparent)` }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      <span
        className="text-[13px] font-bold tabular-nums"
        style={{ color, fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        {pct == null ? "—" : `${pct}%`}
      </span>
    </span>
  );
}

function StampBadge({ text, tone }: { text: string; tone: "commit" | "approve" | "carry" }) {
  const map = {
    commit: { bg: ACCENT_TINT_STRONG, fg: ACCENT_DEEP },
    approve: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)" },
    carry: { bg: "var(--color-slate-bg)", fg: "var(--color-slate-deep)" },
  } as const;
  const c = map[tone];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {text}
    </span>
  );
}

/** Popover to link/unlink the parent monthly cascade goal. */
function ParentGoalPicker({
  goal,
  options,
  canEdit,
}: {
  goal: CascadeWeeklyGoal;
  options: MonthGoalOption[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  function link(monthGoalId: string | null) {
    startTransition(async () => {
      const res = await updateWeeklyCascadeFields({ id: goal.id, monthGoalId });
      if (res.ok) setOpen(false);
      else fireToast({ message: res.error, type: "error" });
    });
  }

  const linked = Boolean(goal.monthGoalTitle);
  const chip = linked ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold"
      style={{
        background: ACCENT_TINT_STRONG,
        borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 30%, transparent)",
        color: ACCENT_DEEP,
      }}
    >
      <Link2 size={12.5} style={{ color: ACCENT }} />
      <span className="truncate max-w-[24ch]">{goal.monthGoalTitle}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-2.5 py-1 text-[11.5px] font-medium text-ink-muted">
      <Link2 size={12.5} className="text-ink-soft" />
      <span className="text-ink-soft">Not linked to a monthly goal</span>
    </span>
  );

  if (!canEdit) return chip;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={pending} className="text-left transition-opacity hover:opacity-80">
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="start">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Link to monthly goal
        </p>
        <div className="max-h-56 overflow-y-auto">
          <button
            type="button"
            disabled={pending}
            onClick={() => link(null)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-muted hover:bg-surface-soft"
          >
            None (standalone weekly)
            {goal.monthGoalId == null && <Check size={14} style={{ color: ACCENT }} />}
          </button>
          {options.length === 0 && (
            <p className="px-2 py-3 text-[12px] text-ink-soft">
              No monthly goals for this month yet.
            </p>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={pending}
              onClick={() => link(o.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-strong hover:bg-surface-soft"
            >
              <span className="truncate">
                {o.area ? <span className="text-ink-soft">{o.area} · </span> : null}
                {o.title}
              </span>
              {goal.monthGoalId === o.id && <Check size={14} style={{ color: ACCENT }} />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Compact inline form to edit the cascade fields (partial update on save). */
function EditFieldsForm({ goal, onDone }: { goal: CascadeWeeklyGoal; onDone: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const [area, setArea] = React.useState(goal.area ?? "");
  const [uom, setUom] = React.useState(goal.uom ?? "");
  const [targetQty, setTargetQty] = React.useState(goal.targetQty ?? "");
  const [actualQty, setActualQty] = React.useState(goal.actualQty ?? "");
  const [targetAmount, setTargetAmount] = React.useState(goal.targetAmount ?? "");
  const [actualAmount, setActualAmount] = React.useState(goal.actualAmount ?? "");
  const [dependency, setDependency] = React.useState(
    goal.teamDependencyPct == null ? "" : String(goal.teamDependencyPct),
  );
  const [evidence, setEvidence] = React.useState(goal.evidenceUrl ?? "");

  function numField(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function save() {
    startTransition(async () => {
      const res = await updateWeeklyCascadeFields({
        id: goal.id,
        area: area.trim() || null,
        uom: uom.trim() || null,
        targetQty: numField(targetQty),
        actualQty: numField(actualQty),
        targetAmount: numField(targetAmount),
        actualAmount: numField(actualAmount),
        teamDependencyPct: dependency.trim() === "" ? null : Math.max(0, Math.min(100, Number(dependency) || 0)),
        evidenceUrl: evidence.trim() || "",
      });
      if (res.ok) {
        fireToast({ message: "Saved.", type: "success" });
        onDone();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div className="wg-fade-in mt-3 rounded-section border border-hairline bg-surface-soft p-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Area"><input value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} /></Field>
        <Field label="Unit (UOM)"><input value={uom} onChange={(e) => setUom(e.target.value)} className={inputCls} /></Field>
        <Field label="Target qty"><input value={targetQty} onChange={(e) => setTargetQty(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Actual qty"><input value={actualQty} onChange={(e) => setActualQty(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Target amount (₹)"><input value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Actual amount (₹)"><input value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Dependency %"><input value={dependency} onChange={(e) => setDependency(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
        <Field label="Evidence URL"><input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" className={inputCls} /></Field>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="bg-surface-card rounded-pill px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="wg-btn wg-sheen rounded-pill px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow: "0 6px 16px -8px color-mix(in srgb, var(--goals-accent, #E10600) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.22)",
          }}
        >
          {pending ? "Saving…" : "Save fields"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[13px] text-ink-strong outline-none focus:border-hairline-strong";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
