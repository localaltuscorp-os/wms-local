"use client";

import * as React from "react";
import { DoorOpen, EyeOff, Handshake, ArrowDown, MinusCircle } from "lucide-react";
import type { EvalSection } from "@/lib/hr/candidate/evaluation-v2";
import { SegmentedControl } from "./controls";
import { RatingSection } from "./rating-section";
import type { EvalController } from "./controller";

/**
 * Customer-Facing (a "gate" section): a multi-value gate (Yes / No / Not Sure /
 * N-A) whose answer decides whether the 6 sub-ratings are revealed + counted.
 * The sub-ratings appear (and are scored) only when the answer is in the gate's
 * `revealWhen` set; any other answer collapses them and drops the section weight.
 */
export function GateSection({ ctrl, section }: { ctrl: EvalController; section: EvalSection }) {
  const gate = section.gate;
  if (!gate) return null;
  const answer = ctrl.instance.gates?.[section.id];
  const revealed = answer != null && gate.revealWhen.includes(answer);

  return (
    <div className="space-y-4">
      {/* Gate prompt */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-4">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
          <DoorOpen size={16} className="text-altus-red" /> {gate.label}
        </span>
        <SegmentedControl
          value={answer}
          onChange={(v) => ctrl.setGate(section.id, v)}
          options={gate.options}
          label={gate.label}
        />
      </div>

      {section.note && !revealed && (
        <p className="px-1 text-[12.5px] font-medium text-ink-muted">{section.note}</p>
      )}

      {/* Revealed sub-ratings, or a quiet "skipped" note */}
      {revealed ? (
        <div className="ev2-collapse">
          <RatingSection ctrl={ctrl} section={section} hideHeaderNote />
        </div>
      ) : answer != null ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-solid border-hairline-strong bg-surface-soft px-4 py-3.5 text-[13px] font-semibold text-ink-muted">
          <EyeOff size={16} className="shrink-0 text-ink-subtle" />
          Customer-facing ratings are skipped for this answer — the section&apos;s weight is dropped from the overall.
        </div>
      ) : null}
    </div>
  );
}

/**
 * L · "Responsibility to Sell?" — a plain Yes / No gate. A "Yes" REVEALS the Sales
 * Competency section (M) below in the form and folds it into the weighted score; a
 * "No" (or unanswered) SKIPS M entirely. Unlike the customer-facing gate it has no
 * sub-ratings of its own — it only decides whether M applies.
 */
export function SellGateSection({ ctrl, section }: { ctrl: EvalController; section: EvalSection }) {
  const gate = section.gate;
  if (!gate) return null;
  const answer = ctrl.instance.gates?.[section.id];
  const yes = answer === "yes";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-4">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
          <Handshake size={16} className="text-altus-red" /> {gate.label}
        </span>
        <SegmentedControl
          value={answer}
          onChange={(v) => ctrl.setGate(section.id, v)}
          options={gate.options}
          label={gate.label}
        />
      </div>

      {answer == null && section.note && (
        <p className="px-1 text-[12.5px] font-medium text-ink-muted">{section.note}</p>
      )}

      {answer != null &&
        (yes ? (
          <div
            className="flex items-center gap-2.5 rounded-2xl border px-4 py-3.5 text-[13px] font-semibold"
            style={{ borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 8%, white)", color: "#15803d" }}
          >
            <ArrowDown size={16} className="shrink-0" />
            Sales Competency (Section M) is included below and counts toward the weighted score.
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-2xl border border-solid border-hairline-strong bg-surface-soft px-4 py-3.5 text-[13px] font-semibold text-ink-muted">
            <MinusCircle size={16} className="shrink-0 text-ink-subtle" />
            Not a sales role — the Sales Competency section is skipped and dropped from the overall.
          </div>
        ))}
    </div>
  );
}
