import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "red" | "green" | "amber";

export interface StatPillProps {
  label: string;
  value: ReactNode;
  /** Tone tints the value + status dot. Defaults to neutral (ink). */
  tone?: StatTone;
  className?: string;
}

/**
 * A compact frosted metric chip used across the admin section headers.
 *
 * Server-safe (no hooks) so it renders inside `<AdminSection>` on the server.
 * The value is set in the display font + tabular-nums; the tone tints the
 * value colour and a small leading dot. Brand-red is the `red` tone.
 */
const TONE: Record<StatTone, { value: string; dot: string }> = {
  neutral: { value: "var(--color-ink-strong)", dot: "var(--color-ink-subtle)" },
  red: { value: "var(--color-altus-red-deep)", dot: "var(--color-altus-red)" },
  green: { value: "var(--color-green-deep)", dot: "var(--color-green)" },
  amber: { value: "var(--color-amber-deep)", dot: "var(--color-amber)" },
};

export function StatPill({ label, value, tone = "neutral", className }: StatPillProps) {
  const t = TONE[tone];
  return (
    <div className={cn("admin-stat-pill", className)}>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: t.dot }}
        />
        {label}
      </span>
      <span
        className="tabular-nums leading-none"
        style={{
          color: t.value,
          fontFamily: "var(--font-display), var(--font-serif), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
    </div>
  );
}
