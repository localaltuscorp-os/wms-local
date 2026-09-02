"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, BarChart3, Loader2 } from "lucide-react";
import { submitPollResponse } from "@/app/(app)/hr/communications/actions";
import { fireToast } from "@/lib/toast";
import type { BroadcastPoll } from "@/db/schema";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * Inline poll / quiz on a broadcast. Recipients vote once (buttons); everyone
 * who has voted — plus HR — sees the live tally as bars. Quiz mode reveals the
 * correct option and whether the viewer got it right.
 */
export function PollCard({
  broadcastId,
  poll,
  initialCounts,
  initialTotal,
  myResponse,
  canVote,
  hrView,
}: {
  broadcastId: string;
  poll: BroadcastPoll;
  initialCounts: number[];
  initialTotal: number;
  myResponse: number | null;
  canVote: boolean;
  hrView: boolean;
}) {
  const [counts, setCounts] = useState<number[]>(initialCounts);
  const [total, setTotal] = useState(initialTotal);
  const [voted, setVoted] = useState<number | null>(myResponse);
  const [correct, setCorrect] = useState<boolean | null>(
    poll.mode === "quiz" && myResponse !== null && typeof poll.correctIndex === "number"
      ? myResponse === poll.correctIndex
      : null,
  );
  const [pending, startTransition] = useTransition();

  const revealed = voted !== null || hrView;

  function vote(i: number) {
    if (!canVote || voted !== null) return;
    startTransition(async () => {
      const res = await submitPollResponse(broadcastId, i);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setVoted(i);
      setCounts((prev) => prev.map((c, idx) => (idx === i ? c + 1 : c)));
      setTotal((t) => t + 1);
      setCorrect(res.correct);
    });
  }

  return (
    <div className="mt-7 rounded-2xl border border-hairline bg-surface-muted/30 p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 9%, white)", color: ACCENT_DEEP }}>
          <BarChart3 size={15} strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
          {poll.mode === "quiz" ? "Quiz" : "Poll"}
        </span>
      </div>
      <h3 className="mt-2 text-[16px] font-bold text-ink-strong">{poll.question}</h3>

      <div className="mt-3 grid gap-2">
        {poll.options.map((opt, i) => {
          const n = counts[i] ?? 0;
          const share = total > 0 ? Math.round((n / total) * 100) : 0;
          const isMine = voted === i;
          const isCorrect = poll.mode === "quiz" && poll.correctIndex === i;

          if (!revealed) {
            return (
              <button
                key={i}
                type="button"
                disabled={!canVote || pending}
                onClick={() => vote(i)}
                className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-left text-[14px] font-semibold text-ink-strong transition hover:border-[color:var(--color-altus-red)] hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_5%,white)] disabled:opacity-60"
              >
                {opt}
                {pending && <Loader2 size={14} className="animate-spin text-ink-subtle" />}
              </button>
            );
          }

          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-xl border px-4 py-2.5 text-[14px]"
              style={{
                borderColor: isCorrect ? "#16a34a" : isMine ? ACCENT : "var(--color-hairline, #e2e8f0)",
                background: "white",
              }}
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${share}%`,
                  background: isCorrect
                    ? "color-mix(in srgb, #16a34a 14%, white)"
                    : isMine
                      ? "color-mix(in srgb, #E10600 12%, white)"
                      : "color-mix(in srgb, #64748b 10%, white)",
                  transition: "width .5s ease",
                }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-ink-strong">
                  {isCorrect && <CheckCircle2 size={15} className="text-emerald-600" />}
                  {isMine && !isCorrect && poll.mode === "quiz" && <XCircle size={15} style={{ color: ACCENT }} />}
                  {opt}
                  {isMine && <span className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">· your pick</span>}
                </span>
                <span className="tabular-nums font-bold text-ink-strong">{share}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
        <span className="tabular-nums">{total} {total === 1 ? "response" : "responses"}</span>
        {correct !== null && (
          <span className={`inline-flex items-center gap-1 font-bold ${correct ? "text-emerald-700" : ""}`} style={correct ? undefined : { color: ACCENT_DEEP }}>
            · {correct ? "Correct!" : "Not quite."}
          </span>
        )}
        {!revealed && !canVote && <span>· You can't vote on this.</span>}
      </div>
    </div>
  );
}
