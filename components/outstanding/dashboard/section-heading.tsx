import * as React from "react";

type Tone = "slate" | "red" | "green" | "amber";

/**
 * Shared section heading for the Outstanding dashboard panels: a slim tone
 * accent bar + serif title, with an optional description and a right-aligned
 * slot (counts / totals). Keeps every panel's header on one rhythm so the
 * surface reads as a deliberate set rather than a stack of plain cards.
 */
export function SectionHeading({
  title,
  description,
  tone = "slate",
  right,
}: {
  title: string;
  description?: string;
  tone?: Tone;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="mt-1.5 h-7 w-[3px] shrink-0 rounded-full"
          style={{
            background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))`,
          }}
        />
        <div className="min-w-0">
          <h2 className="text-display-lg text-ink-strong">{title}</h2>
          {description && (
            <p className="text-body-lg text-ink-subtle mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0 self-center">{right}</div>}
    </header>
  );
}
