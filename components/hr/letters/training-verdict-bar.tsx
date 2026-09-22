"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Check, Clock, X } from "lucide-react";

/**
 * TRAINING VERDICT — the Accept / Extend / Regret decision at the end of the
 * free pre-employment training, on the After Free Training letter.
 *
 * The verdict is not a separate letter (see templates/after-free-training): a
 * button just fills that letter's Outcome line, and points at the letter that
 * follows — the Appointment Letter on Accept, the Regret Letter on Regret.
 * Extend has no follow-up letter; the extended period goes in Remarks.
 *
 * Pressing the active verdict again clears it. no-print: this is editor chrome.
 */

const VERDICTS = [
  {
    value: "Accepted",
    label: "Accept",
    tone: "#15803d",
    Icon: Check,
    next: { href: "/hr/letters/appointment", label: "Compose Appointment Letter" },
    hint: "Employment is confirmed through the Appointment Letter.",
  },
  {
    value: "Extended",
    label: "Extend",
    tone: "#b45309",
    Icon: Clock,
    next: null,
    hint: "State the extended training period and its end date in Remarks.",
  },
  {
    value: "Regret",
    label: "Regret",
    tone: "var(--color-altus-red-deep)",
    Icon: X,
    next: { href: "/hr/letters/rejection", label: "Compose Regret Letter" },
    hint: "No payment is due for the training period.",
  },
] as const;

export function TrainingVerdictBar({
  outcome,
  onChoose,
}: {
  outcome: string;
  onChoose: (value: string) => void;
}) {
  const active = VERDICTS.find((v) => v.value === outcome.trim()) ?? null;

  return (
    <section
      className="no-print mx-auto mb-4 w-full max-w-[794px] rounded-2xl border border-hairline bg-surface-card px-4 py-3.5"
      aria-labelledby="training-verdict-title"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h2
          id="training-verdict-title"
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft"
        >
          Training Verdict
        </h2>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Training verdict">
          {VERDICTS.map((v) => {
            const on = active?.value === v.value;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChoose(on ? "" : v.value)}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-[13px] font-bold transition-colors"
                style={
                  on
                    ? { borderColor: v.tone, background: `color-mix(in srgb, ${v.tone} 10%, white)`, color: v.tone }
                    : { borderColor: "var(--color-hairline-strong)", background: "white", color: "var(--color-ink-strong)" }
                }
              >
                <v.Icon size={14} strokeWidth={2.6} />
                {v.label}
              </button>
            );
          })}
        </div>

        {active?.next && (
          <Link
            href={active.next.href as Route}
            className="ml-auto inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 max-sm:ml-0"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)" }}
          >
            {active.next.label} <ArrowUpRight size={14} />
          </Link>
        )}
      </div>

      <p className="mt-2 text-[12.5px] text-ink-subtle">
        {active ? active.hint : "Pick the outcome of the training - it fills the letter's Outcome line."}
      </p>
    </section>
  );
}
