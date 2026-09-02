"use client";

import * as React from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Ban, AlertTriangle, Flag } from "lucide-react";
import { SECTION_BY_ID, sectionItemIds, type EvalItem } from "@/lib/hr/candidate/evaluation-v2";
import { eligibilityVerdict } from "@/lib/hr/candidate/evaluation-v2-scoring";
import { SegmentedPassFail } from "./controls";
import { RowNotes, VoiceTextbox } from "./voice";
import type { EvalController } from "./controller";

const RED = "var(--color-altus-red)";
const section = SECTION_BY_ID.prerequisites!;

const ITEM_BY_ID: Record<string, EvalItem> = Object.fromEntries(
  section.groups.flatMap((g) => g.items.map((i) => [i.id, i])),
);

/**
 * 1 · Pre-Requisite Confirmation. Strict Yes / No / N-A rows with dictatable
 * per-row notes. CRITICAL items are marked distinctly; a critical "No" without a
 * recorded exception FLAGS the candidate for review (deal-breaker banner). An
 * Exceptions box waives the flag; a one-tap "Mark as Reject" is offered.
 */
export function EligibilitySection({ ctrl }: { ctrl: EvalController }) {
  const { instance } = ctrl;
  const verdict = eligibilityVerdict(instance);
  const answered = verdict.answered;

  // CRITICAL points lead: render the deal-breaker items first (stable within
  // their two buckets), so the interviewer confirms what matters most up top.
  const orderedItems = React.useMemo(() => {
    const items = section.groups[0]?.items ?? [];
    return [...items].sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical)));
  }, []);
  // Critical items are MANDATORY — surface the ones still missing an answer.
  const unansweredCritical = orderedItems.filter((it) => it.critical && !instance.passfail[it.id]);

  const state: BannerState = verdict.dealbreaker
    ? "dealbreaker"
    : verdict.flaggedForReview
      ? "excepted-critical"
      : verdict.noItems.length > 0
        ? "soft-no"
        : answered === 0
          ? "empty"
          : "clear";

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <VerdictBanner
        state={state}
        criticalNoLabels={verdict.criticalNoItems.map((id) => ITEM_BY_ID[id]?.label ?? id)}
        noLabels={verdict.noItems.map((id) => ITEM_BY_ID[id]?.label ?? id)}
        answered={answered}
        total={verdict.total}
        onReject={() => ctrl.setRecommendation("reject")}
        isReject={instance.recommendation === "reject"}
      />

      {/* Mandatory-critical nudge — the critical points must be filled. */}
      {unansweredCritical.length > 0 && (
        <div
          className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, white)", background: "color-mix(in srgb, var(--color-altus-red) 6%, white)" }}
        >
          <Flag size={15} strokeWidth={2.8} style={{ color: RED }} className="shrink-0" />
          <p className="text-[13px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>
            {unansweredCritical.length} critical point{unansweredCritical.length === 1 ? "" : "s"} still need an answer — these are mandatory.
          </p>
        </div>
      )}

      {/* Rows — critical first */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
        {orderedItems.map((item, i) => {
          const val = instance.passfail[item.id];
          const isNo = val === "no";
          const critical = Boolean(item.critical);
          const needsAnswer = critical && !val;
          return (
            <div
              key={item.id}
              className="flex flex-col gap-2.5 border-b border-hairline px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              style={
                isNo
                  ? { background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" }
                  : needsAnswer
                    ? { boxShadow: "inset 3px 0 0 0 var(--color-altus-red)" }
                    : undefined
              }
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                  style={{ background: critical ? RED : "var(--color-ink-soft)" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold leading-snug text-ink-strong">
                    {item.label}
                    {critical && (
                      <span
                        className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.08em]"
                        style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: "var(--color-altus-red-deep)" }}
                        title="Critical — mandatory; a ‘No’ here flags the candidate for review"
                      >
                        <Flag size={9} strokeWidth={3} /> Critical{needsAnswer ? " · Required" : ""}
                      </span>
                    )}
                  </p>
                  <RowNotes value={instance.notes[item.id] ?? ""} onChange={(v) => ctrl.setNote(item.id, v)} />
                </div>
              </div>
              <div className="shrink-0 sm:pl-4">
                <SegmentedPassFail value={val} onChange={(v) => ctrl.setPassfail(item.id, v)} label={item.label} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Exceptions */}
      <div className="rounded-2xl border border-hairline bg-surface-soft p-4">
        <VoiceTextbox
          label="Exceptions (waives a critical flag above)"
          value={instance.sectionNotes[section.id] ?? ""}
          onChange={(v) => ctrl.setSectionNote(section.id, v)}
          placeholder="If a critical ‘No’ is acceptable for this candidate, record why here — this clears the review flag…"
          rows={3}
          minHeight={80}
          hint="A recorded exception overrides the strict pass/fail so the candidate isn't auto-flagged."
        />
      </div>
    </div>
  );
}

type BannerState = "clear" | "dealbreaker" | "excepted-critical" | "soft-no" | "empty";

function VerdictBanner({
  state,
  criticalNoLabels,
  noLabels,
  answered,
  total,
  onReject,
  isReject,
}: {
  state: BannerState;
  criticalNoLabels: string[];
  noLabels: string[];
  answered: number;
  total: number;
  onReject: () => void;
  isReject: boolean;
}) {
  if (state === "empty") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-soft px-4 py-3.5">
        <ShieldQuestion size={20} className="shrink-0 text-ink-subtle" />
        <p className="text-[13.5px] font-semibold text-ink-muted">
          Confirm each pre-requisite — a critical “No” without an exception flags the candidate for review.
        </p>
        <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-ink-subtle">
          {answered} / {total}
        </span>
      </div>
    );
  }

  if (state === "clear") {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
        style={{ borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 8%, white)" }}
      >
        <ShieldCheck size={20} className="shrink-0" style={{ color: "#15803d" }} />
        <p className="text-[14px] font-bold" style={{ color: "#15803d" }}>
          All clear — no critical concerns.
        </p>
        <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "#15803d" }}>
          {answered} / {total} answered
        </span>
      </div>
    );
  }

  if (state === "soft-no") {
    return (
      <div
        className="rounded-2xl border px-4 py-3.5"
        style={{ borderColor: "color-mix(in srgb, #f59e0b 40%, white)", background: "color-mix(in srgb, #f59e0b 10%, white)" }}
      >
        <div className="flex items-center gap-3">
          <ShieldAlert size={20} className="shrink-0" style={{ color: "#b45309" }} />
          <p className="text-[14px] font-bold" style={{ color: "#b45309" }}>
            {noLabels.length} non-critical concern{noLabels.length === 1 ? "" : "s"} noted — no review flag.
          </p>
          <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "#b45309" }}>
            {answered} / {total}
          </span>
        </div>
        <ChipRow labels={noLabels} bg="color-mix(in srgb, #f59e0b 18%, white)" fg="#b45309" />
      </div>
    );
  }

  if (state === "excepted-critical") {
    return (
      <div
        className="rounded-2xl border px-4 py-3.5"
        style={{ borderColor: "color-mix(in srgb, #f59e0b 40%, white)", background: "color-mix(in srgb, #f59e0b 10%, white)" }}
      >
        <div className="flex items-center gap-3">
          <ShieldAlert size={20} className="shrink-0" style={{ color: "#b45309" }} />
          <p className="text-[14px] font-bold" style={{ color: "#b45309" }}>
            {criticalNoLabels.length} critical flag{criticalNoLabels.length === 1 ? "" : "s"} waived by a recorded exception.
          </p>
        </div>
        <ChipRow labels={criticalNoLabels} bg="color-mix(in srgb, #f59e0b 18%, white)" fg="#b45309" />
      </div>
    );
  }

  // dealbreaker — a critical "No" with no exception → flagged for review
  return (
    <div
      className="rounded-2xl border px-4 py-3.5"
      style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, white)", background: "color-mix(in srgb, var(--color-altus-red) 9%, white)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle size={20} className="shrink-0" style={{ color: RED }} />
        <p className="text-[14px] font-black" style={{ color: "var(--color-altus-red-deep)" }}>
          ⚠ Flagged for review — {criticalNoLabels.length} critical pre-requisite{criticalNoLabels.length === 1 ? "" : "s"} failed.
        </p>
        <button
          type="button"
          onClick={onReject}
          disabled={isReject}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors disabled:opacity-60"
          style={{ background: isReject ? "var(--color-altus-red-deep)" : RED }}
        >
          <Ban size={13} strokeWidth={2.6} /> {isReject ? "Marked as Reject" : "Mark as Reject"}
        </button>
      </div>
      <ChipRow labels={criticalNoLabels} bg="color-mix(in srgb, var(--color-altus-red) 14%, white)" fg="var(--color-altus-red-deep)" />
      <p className="mt-2 pl-8 text-[12.5px] font-medium" style={{ color: "var(--color-altus-red-deep)" }}>
        Record an Exception below to waive this, or mark the candidate as a reject.
      </p>
    </div>
  );
}

function ChipRow({ labels, bg, fg }: { labels: string[]; bg: string; fg: string }) {
  if (labels.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
      {labels.map((l) => (
        <span key={l} className="inline-flex rounded-pill px-2.5 py-0.5 text-[12px] font-bold" style={{ background: bg, color: fg }}>
          {l}
        </span>
      ))}
    </div>
  );
}
