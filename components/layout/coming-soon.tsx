import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

/**
 * Placeholder body for a workspace area that's wired into the nav but not yet
 * built. Drop it inside a page between <DashboardHeader/> and
 * <DashboardFooter/> with the area's title, blurb, and icon.
 */
export function ComingSoon({
  title,
  description,
  Icon,
}: {
  title: string;
  description: string;
  Icon: LucideIcon;
}) {
  return (
    <main className="mx-auto max-w-[760px] px-8 max-md:px-4 pt-16 pb-24 max-md:pt-10">
      <div
        className="rounded-section bg-surface-card p-12 max-md:p-8 text-center"
        style={{
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        }}
      >
        <span
          className="inline-flex size-16 items-center justify-center rounded-2xl"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          <Icon size={30} strokeWidth={2.1} />
        </span>

        <div className="mt-5">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-bold"
            style={{
              background: "var(--color-surface-track)",
              color: "var(--color-ink-soft)",
            }}
          >
            <Sparkles size={13} strokeWidth={2.4} />
            Coming soon
          </span>
        </div>

        <h1 className="mt-4 text-display-lg text-ink-strong">{title}</h1>
        <p className="mt-3 text-body-lg text-ink-soft max-w-[46ch] mx-auto leading-relaxed">
          {description}
        </p>
      </div>
    </main>
  );
}
