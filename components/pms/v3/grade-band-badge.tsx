import type { GradeResult } from "@/lib/pms/v3/grade-band";

/**
 * PMS v3 — incentive grade-band pill (A/B/C/D/Fail) with the % of monthly CTC.
 * Server-safe (no client hooks). Colours come from the config band (Altus token
 * family: green for A/B, warn amber for C/D, danger for Fail). "—" when CTC is
 * unknown (salary data not yet imported for the month).
 */
export function GradeBandBadge({ grade, size = "md" }: { grade: GradeResult; size?: "sm" | "md" }) {
  const band = grade.band;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";
  if (!band || grade.pctOfCtc == null) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-pill font-bold ${pad}`}
        style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
        title="Monthly CTC not available for this month yet"
      >
        — no CTC
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill font-bold text-white ${pad}`}
      style={{ background: `linear-gradient(135deg, ${band.color}, color-mix(in srgb, ${band.color} 70%, #000))` }}
      title={`${grade.paid.toLocaleString("en-IN")} paid ÷ ${grade.ctc.toLocaleString("en-IN")} CTC`}
    >
      <span className="tabular-nums">{band.grade}</span>
      <span className="font-semibold opacity-90 tabular-nums">{grade.pctOfCtc.toFixed(1)}%</span>
    </span>
  );
}
