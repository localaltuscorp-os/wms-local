"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  Pencil,
  Plus,
  Sparkles,
  Archive,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  setGoalPctDone,
  setGoalAdopted,
  generateGoalChildren,
  archiveGoal,
} from "@/app/(app)/goals/cascade/actions";
import { GoalEditDialog } from "./goal-edit-dialog";
import { MoveForwardMenu } from "./move-forward-menu";
import { TeamAvatars } from "./team-picker";
import {
  effectiveGoalPct,
  pctTone,
  fmtNum,
  childLevelOf,
  PERIOD_LABEL,
  type GoalDTO,
  type RosterMember,
} from "./util";

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 text-[12px] text-ink-soft"
      style={{
        background: "color-mix(in srgb, #E10600 6%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, #E10600 9%, transparent)",
      }}
    >
      <span className="font-black uppercase tracking-[0.04em] text-ink-muted text-[10px]">{label}</span>
      <span className="font-bold text-ink-strong tabular-nums">{value}</span>
    </span>
  );
}

export interface GoalCardProps {
  goal: GoalDTO;
  roster: RosterMember[];
  canWrite: boolean;
  moveTargets?: string[];
  canGenerate?: boolean;
  childKeyOptions?: string[];
  showAdopt?: boolean;
  drillKey?: string;
}

export function GoalCard({
  goal,
  roster,
  canWrite,
  moveTargets = [],
  canGenerate = false,
  childKeyOptions = [],
  showAdopt = false,
  drillKey,
}: GoalCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [childOpen, setChildOpen] = React.useState(false);
  const [pctDraft, setPctDraft] = React.useState(String(goal.pctDone));
  const [pending, start] = React.useTransition();

  React.useEffect(() => setPctDraft(String(goal.pctDone)), [goal.pctDone]);

  const eff = effectiveGoalPct(goal);
  const tone = pctTone(eff);
  const dropped = !goal.adopted;

  function commitPct() {
    const n = Math.max(0, Math.min(100, Number(pctDraft) || 0));
    if (n === goal.pctDone) return;
    start(async () => {
      const res = await setGoalPctDone({ id: goal.id, pctDone: n });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        setPctDraft(String(goal.pctDone));
        return;
      }
      router.refresh();
    });
  }

  function toggleAdopt() {
    start(async () => {
      const res = await setGoalAdopted({ id: goal.id, adopted: dropped });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: dropped ? "Re-adopted" : "Crossed out", type: "success" });
      router.refresh();
    });
  }

  function generate() {
    start(async () => {
      const res = await generateGoalChildren({ id: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const level = res.childLevel ? PERIOD_LABEL[res.childLevel as "quarter" | "month"] ?? res.childLevel : "child";
      fireToast({
        message: res.created > 0 ? `Generated ${res.created} ${level.toLowerCase()} goals` : "Already generated",
        type: "success",
      });
      router.refresh();
    });
  }

  function archive() {
    if (!confirm("Archive this goal? It stays in history but leaves the board.")) return;
    start(async () => {
      const res = await archiveGoal({ id: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Archived", type: "success" });
      router.refresh();
    });
  }

  const childLevel = childLevelOf(goal.period);

  return (
    <div
      className={`group relative rounded-2xl border p-4 transition-all ${
        dropped
          ? "border-hairline bg-black/[0.02] opacity-60"
          : "border-hairline bg-surface-card hover:border-hairline-strong hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Sr + adopt */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <span className="text-[12px] font-black text-ink-muted tabular-nums">{goal.position}</span>
          {showAdopt && canWrite && (
            <button
              type="button"
              onClick={toggleAdopt}
              disabled={pending}
              title={dropped ? "Re-adopt" : "Cross out (drop from this period)"}
              className={`flex size-5 items-center justify-center rounded-md border transition-colors ${
                dropped
                  ? "border-hairline-strong text-transparent hover:text-ink-soft"
                  : "border-0 text-white"
              }`}
              style={!dropped ? { background: "linear-gradient(135deg, #E10600, #A80400)" } : undefined}
            >
              <Check size={13} strokeWidth={3} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {goal.area && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold text-ink-soft"
                style={{ background: "color-mix(in srgb, #E10600 8%, transparent)" }}
              >
                {goal.area}
              </span>
            )}
            {goal.source === "cascade" && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.05em]"
                style={{ background: "rgba(225,6,0,0.12)", color: "#A80400" }}
              >
                Cascaded
              </span>
            )}
          </div>
          <h3 className={`mt-1 text-[15.5px] font-bold leading-snug text-ink-strong ${dropped ? "line-through" : ""}`}>
            {goal.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {goal.uom && <Chip label="UOM" value={goal.uom} />}
            <Chip label="Tgt" value={fmtNum(goal.targetQty)} />
            <Chip label="Act" value={fmtNum(goal.actualQty)} />
            {(goal.targetAmount || goal.actualAmount) && (
              <Chip label="₹Tgt" value={fmtNum(goal.targetAmount)} />
            )}
            {(goal.targetAmount || goal.actualAmount) && (
              <Chip label="₹Act" value={fmtNum(goal.actualAmount)} />
            )}
            {goal.teamDependencyPct != null && <Chip label="Dep" value={`${goal.teamDependencyPct}%`} />}
            <TeamAvatars team={goal.teamInvolved} roster={roster} />
          </div>

          {goal.notes && (
            <p className="mt-2 text-[12.5px] italic text-ink-soft line-clamp-2">{goal.notes}</p>
          )}
        </div>

        {/* Score */}
        <div className="flex flex-col items-end gap-1.5">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: tone.bg,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.color} 24%, transparent)`,
            }}
          >
            <span
              className="text-[15px] font-black tabular-nums"
              style={{ color: tone.color, fontFamily: "var(--font-display), system-ui, sans-serif" }}
            >
              {eff}%
            </span>
          </div>
          {goal.acceptPct != null && (
            <span className="text-[10.5px] font-bold text-ink-muted">
              self {goal.pctDone}% · mgr {goal.acceptPct}%
            </span>
          )}
          {canWrite && (
            <div className="flex items-center gap-1">
              <input
                value={pctDraft}
                onChange={(e) => setPctDraft(e.target.value)}
                onBlur={commitPct}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                inputMode="numeric"
                aria-label="Self progress %"
                className="w-12 rounded-lg border border-hairline bg-surface-card px-2 py-1 text-right text-[13px] font-bold text-ink-strong outline-none focus:border-hairline-strong"
              />
              <span className="text-[12px] font-bold text-ink-muted">%</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {canWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="wg-btn inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
          >
            <Pencil size={12} strokeWidth={2.4} /> Edit
          </button>
          {canGenerate && (
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="wg-btn inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong disabled:opacity-60"
              title={`Auto-divide into ${childLevel} goals`}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} strokeWidth={2.4} />}
              Generate {childLevel}s
            </button>
          )}
          {childKeyOptions.length > 0 && goal.period !== "month" && (
            <button
              type="button"
              onClick={() => setChildOpen(true)}
              className="wg-btn inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
            >
              <Plus size={12} strokeWidth={2.6} /> Add {childLevel}
            </button>
          )}
          {moveTargets.length > 0 && <MoveForwardMenu goalId={goal.id} targets={moveTargets} />}
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className="wg-btn inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-altus-red disabled:opacity-60"
          >
            <Archive size={12} strokeWidth={2.4} /> Archive
          </button>
          {drillKey && (
            <Link
              href={`/goals/cascade/${drillKey}` as Route}
              className="wg-btn wg-sheen ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-black text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              Open {childLevel} <ChevronRight size={13} strokeWidth={2.6} />
            </Link>
          )}
        </div>
      )}

      <GoalEditDialog
        mode={{ kind: "edit", goal }}
        roster={roster}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {childKeyOptions.length > 0 && (
        <GoalEditDialog
          mode={{
            kind: "child",
            parentId: goal.id,
            childPeriod: childLevel === "week" ? "month" : childLevel,
            periodKeyOptions: childKeyOptions,
          }}
          roster={roster}
          open={childOpen}
          onOpenChange={setChildOpen}
        />
      )}
    </div>
  );
}
