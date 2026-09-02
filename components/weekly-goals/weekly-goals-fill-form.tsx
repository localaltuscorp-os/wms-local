"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import type { UnfilledWeekGoal } from "@/lib/weekly-goals/gate";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import {
  setWeeklyGoalPct,
  editWeeklyGoal,
} from "@/app/(app)/weekly-goals/actions";

const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "var(--color-altus-red)",
  imp_not_urgent: "var(--color-amber)",
  not_imp_urgent: "var(--color-blue)",
  not_imp_not_urgent: "var(--color-slate)",
};

const PCT_PRESETS = [0, 25, 50, 75, 100] as const;

/** One row's editable state, seeded from the server-loaded goal. */
interface Draft {
  pctDone: number;
  explanation: string;
}

interface Props {
  goals: UnfilledWeekGoal[];
  weekLabel: string;
  greetingName: string;
}

export function WeeklyGoalsFillForm({ goals, weekLabel, greetingName }: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>(() => {
    const seed: Record<string, Draft> = {};
    for (const g of goals) {
      seed[g.id] = { pctDone: g.pctDone, explanation: g.explanation ?? "" };
    }
    return seed;
  });

  function patch(id: string, next: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...next } }));
  }

  function submit() {
    start(async () => {
      // Stamp each goal's progress (this sets pct_updated_at → the gate clears)
      // plus any explanation. Sequential so one failure surfaces a clear error.
      for (const g of goals) {
        const draft = drafts[g.id]!;
        const pctRes = await setWeeklyGoalPct({ id: g.id, pctDone: draft.pctDone });
        if (!pctRes.ok) {
          fireToast({ message: pctRes.error, type: "error" });
          return;
        }
        const explanation = draft.explanation.trim();
        if (explanation !== (g.explanation ?? "")) {
          const editRes = await editWeeklyGoal({
            id: g.id,
            explanation: explanation || null,
          });
          if (!editRes.ok) {
            fireToast({ message: editRes.error, type: "error" });
            return;
          }
        }
      }
      fireToast({ message: "Weekly goals filled — welcome back.", type: "success" });
      router.replace("/dashboard" as Route);
      router.refresh();
    });
  }

  const avgPct = goals.length
    ? Math.round(goals.reduce((s, g) => s + (drafts[g.id]?.pctDone ?? 0), 0) / goals.length)
    : 0;

  return (
    <div className="min-h-screen ledger-paper px-6 py-12 max-md:px-4 max-md:py-8">
      <div className="mx-auto w-full max-w-[760px]">
        {/* Header --------------------------------------------------------- */}
        <header className="wg-rise mb-8 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-altus-red mb-3">
            Weekly check-in · {weekLabel}
          </div>
          <div className="mx-auto mb-4 flex justify-center">
            <div className={avgPct >= 100 ? "wg-ring-glow" : ""}>
              <ScoreRing value={avgPct} size={92} label={`${avgPct}% average progress`} />
            </div>
          </div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: "clamp(32px, 3.6vw, 46px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.02,
            }}
          >
            Fill Your Weekly Goals
          </h1>
          <p
            className="mx-auto mt-3 max-w-[52ch] text-ink-muted font-medium"
            style={{ fontSize: 16.5, lineHeight: 1.5 }}
          >
            {greetingName}, update the progress on each goal assigned to you for{" "}
            <span className="font-bold text-ink-strong">{weekLabel}</span> to
            continue into the app. This takes a minute.
          </p>
        </header>

        {/* Goal cards ----------------------------------------------------- */}
        <ol className="flex flex-col gap-4">
          {goals.map((g, i) => {
            const draft = drafts[g.id]!;
            const title =
              g.targetDone ||
              [g.client, g.subject].filter(Boolean).join(" · ") ||
              "Untitled goal";
            return (
              <li
                key={g.id}
                className="wg-rise rounded-2xl border border-hairline bg-white p-5 max-md:p-4"
                style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)", animationDelay: `${Math.min(i * 60, 360)}ms` }}
              >
                {/* Card head: index, priority, client·subject, target date */}
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums text-white"
                      style={{ background: PRIORITY_TONE[g.priority] }}
                      title={PRIORITY_LABELS[g.priority]}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="truncate font-bold text-ink-strong"
                        style={{ fontSize: 16, lineHeight: 1.3 }}
                      >
                        {title}
                      </p>
                      <p
                        className="mt-0.5 truncate text-ink-muted font-medium"
                        style={{ fontSize: 13.5 }}
                      >
                        {[g.client, g.subject].filter(Boolean).join(" · ") ||
                          PRIORITY_LABELS[g.priority]}
                        {g.targetDate ? ` · due ${formatWeekShort(g.targetDate)}` : ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* % Done -------------------------------------------------- */}
                <label
                  className="mb-1.5 block font-semibold text-ink-strong"
                  style={{ fontSize: 14 }}
                >
                  % Done
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid grid-cols-5 gap-1">
                    {PCT_PRESETS.map((p) => {
                      const active = draft.pctDone === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={pending}
                          onClick={() => patch(g.id, { pctDone: p })}
                          className="wg-btn cursor-pointer rounded-md border py-1.5 text-center text-[13px] font-bold tabular-nums disabled:opacity-50"
                          style={
                            active
                              ? {
                                  background: "var(--color-altus-red)",
                                  borderColor: "var(--color-altus-red)",
                                  color: "#fff",
                                }
                              : {
                                  background: "#fff",
                                  borderColor: "var(--color-hairline,#E5E7EB)",
                                  color: "var(--color-ink-muted,#475569)",
                                }
                          }
                        >
                          {p}%
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      value={draft.pctDone}
                      disabled={pending}
                      onChange={(e) => {
                        const n = Math.max(
                          0,
                          Math.min(100, Math.round(Number(e.target.value) || 0)),
                        );
                        patch(g.id, { pctDone: n });
                      }}
                      className="w-[72px] rounded-lg border border-hairline px-2.5 py-1.5 text-[15px] font-semibold tabular-nums text-ink-strong outline-none focus:border-[var(--color-altus-red)] disabled:opacity-50"
                      aria-label={`Percent done for goal ${i + 1}`}
                    />
                    <span className="text-ink-muted font-semibold" style={{ fontSize: 14 }}>
                      %
                    </span>
                  </div>
                </div>

                {/* Progress bar (visual) ---------------------------------- */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${draft.pctDone}%`,
                      background:
                        draft.pctDone >= 100
                          ? "var(--color-green)"
                          : "var(--color-altus-red)",
                    }}
                  />
                </div>

                {/* Explanation ------------------------------------------- */}
                <label
                  className="mb-1.5 mt-4 block font-semibold text-ink-strong"
                  style={{ fontSize: 14 }}
                >
                  Explanation{" "}
                  <span className="font-medium text-ink-muted">(optional)</span>
                </label>
                <textarea
                  value={draft.explanation}
                  disabled={pending}
                  rows={2}
                  maxLength={4000}
                  placeholder="What happened with this goal?"
                  onChange={(e) => patch(g.id, { explanation: e.target.value })}
                  className="w-full resize-y rounded-lg border border-hairline px-3 py-2 text-[15px] text-ink-strong outline-none focus:border-[var(--color-altus-red)] disabled:opacity-50"
                />
              </li>
            );
          })}
        </ol>

        {/* Submit --------------------------------------------------------- */}
        <div className="sticky bottom-4 z-10 mt-6">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="wg-btn wg-sheen cursor-pointer flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-[16px] font-bold text-white hover:brightness-110 disabled:opacity-70"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 12px 30px -10px rgba(225, 6, 0, 0.6)",
            }}
          >
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin" strokeWidth={2.6} />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 size={18} strokeWidth={2.6} />
                Submit &amp; enter
                <ArrowRight size={18} strokeWidth={2.6} />
              </>
            )}
          </button>
          <p
            className="mt-2 text-center text-ink-muted font-medium"
            style={{ fontSize: 13 }}
          >
            {goals.length} goal{goals.length === 1 ? "" : "s"} to fill — required
            before you can continue.
          </p>
        </div>
      </div>
    </div>
  );
}
