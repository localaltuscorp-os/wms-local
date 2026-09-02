import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Compass, type LucideIcon } from "lucide-react";
import { HrBackButton } from "@/components/hr/hr-back-button";

/**
 * Shared chrome for the HR room's card-hubs and placeholder sub-modules — one
 * teal identity, one card shape, reused by the 7-card front door, the Post-Joining
 * sub-hub, the Overview index and the "to be planned" sections. Server-safe (no
 * hooks) so every HR page can compose it directly.
 */
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export function HrPageHeader({
  title,
  subtitle,
  backHref = "/hr",
  backLabel = "Back",
  showBack = true,
}: {
  title: string;
  subtitle: string;
  /** Where Back lands when there's no history to pop (fresh tab / direct link). */
  backHref?: string;
  backLabel?: string;
  /** Only the HR front door itself opts out (it has its own Back to Hub). */
  showBack?: boolean;
}) {
  return (
    <header className="mb-6 wg-rise">
      {/* Own line — the eyebrow pill below is inline, so an unwrapped button
          would sit beside it. */}
      {showBack && (
        <div>
          <HrBackButton fallbackHref={backHref} label={backLabel} />
        </div>
      )}
      <span
        className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
        style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        HR
      </span>
      <h1
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(30px, 3.6vw, 46px)",
          letterSpacing: "-0.025em",
          lineHeight: 1.04,
          marginTop: 6,
          maxWidth: "24ch",
        }}
      >
        {title}
      </h1>
      <p className="mt-1.5 max-w-[80ch] font-medium text-ink-muted" style={{ fontSize: 13.5 }}>
        {subtitle}
      </p>
    </header>
  );
}

export interface HrCardDef {
  slug: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  /** Sections without their real build yet — badged "Planned". */
  soon?: boolean;
}

export function HrCard({ card, delay = 0 }: { card: HrCardDef; delay?: number }) {
  const { Icon } = card;
  return (
    <Link
      href={card.slug as Route}
      className="group wg-rise relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 transition-all hover:border-hairline-strong hover:shadow-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
        >
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <ArrowUpRight
          size={18}
          className="text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>
      <h2
        className="mt-3.5 flex items-center gap-2 text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
      >
        {card.title}
        {card.soon && (
          <span
            className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
          >
            Planned
          </span>
        )}
      </h2>
      <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">{card.blurb}</p>
    </Link>
  );
}

/** A polished "to be planned" body for HR sub-modules awaiting their real build. */
export function HrPlanned({ title, note }: { title: string; note?: string }) {
  return (
    <section
      className="wg-rise flex flex-col items-center justify-center rounded-2xl border border-solid border-hairline-strong bg-surface-card px-6 py-16 text-center"
      style={{ animationDelay: "60ms" }}
    >
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}
      >
        <Compass size={26} strokeWidth={2.1} />
      </span>
      <h2
        className="mt-4 text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.01em" }}
      >
        {title} — to be planned
      </h2>
      <p className="mt-2 max-w-[52ch] text-[14px] font-medium leading-relaxed text-ink-muted">
        {note ??
          "This HR sub-module is being scoped. Its own workflow, forms and sidebar will land in a later build — the room and its place in the flow are reserved."}
      </p>
      <Link
        href={"/hr" as Route}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition-transform hover:-translate-y-0.5"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        Back to HR
      </Link>
    </section>
  );
}
