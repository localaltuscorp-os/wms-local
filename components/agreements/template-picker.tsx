"use client";

import { FileSignature, FileText, ShieldCheck, Wallet, BadgeCheck, GraduationCap } from "lucide-react";
import { AGREEMENT_TYPES, AGREEMENT_TYPE_LABELS, type AgreementType } from "@/db/enums";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

const ICONS: Record<AgreementType, typeof FileText> = {
  appointment: FileSignature,
  employment: FileText,
  nda: ShieldCheck,
  ctc: Wallet,
  probation_confirmation: BadgeCheck,
  training_completion: GraduationCap,
};

const BLURBS: Record<AgreementType, string> = {
  appointment: "Offer of appointment · CTC, probation, reporting.",
  employment: "Full employment terms · duties, IP, notice.",
  nda: "Confidentiality & non-disclosure undertaking.",
  ctc: "Compensation confirmation · component breakup.",
  probation_confirmation: "Confirm appointment after probation.",
  training_completion: "Confirm end of free training · payroll starts.",
};

/** The four HR templates as selectable brand pill-cards. */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: AgreementType;
  onChange: (t: AgreementType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {AGREEMENT_TYPES.map((t) => {
        const active = t === value;
        const Icon = ICONS[t];
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={active}
            className="wg-btn group flex flex-col gap-1 rounded-2xl px-3.5 py-3 text-left"
            style={
              active
                ? {
                    background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                    color: "#fff",
                    boxShadow: "0 12px 28px -18px rgba(225,6,0,0.7)",
                  }
                : {
                    background: "var(--color-surface-card)",
                    color: "var(--color-ink-strong)",
                    boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                  }
            }
          >
            <span className="flex items-center gap-2">
              <Icon size={15} strokeWidth={2.4} style={{ opacity: active ? 1 : 0.7 }} />
              <span className="text-[13px] font-bold leading-tight">
                {AGREEMENT_TYPE_LABELS[t]}
              </span>
            </span>
            <span
              className="text-[11px] font-medium leading-snug"
              style={{ color: active ? "rgba(255,255,255,0.86)" : "var(--color-ink-subtle)" }}
            >
              {BLURBS[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
