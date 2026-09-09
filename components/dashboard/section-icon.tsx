import type { LucideIcon } from "lucide-react";

/**
 * THE SECTION ICON BADGE — one recipe, so the six section headings actually
 * look like a set.
 *
 * They did not. Every section had rolled its own, and by the time there were
 * five of them no two agreed:
 *
 *   Overdue by Person ... size-9,  rounded-full, red 12%,  icon 18 / stroke 2.4
 *   Sent-back Work ..... size-10, rounded-xl,  red 12%,   icon 20 / stroke 2.2
 *   Status by Doer ..... size-10, rounded-xl,  slate 5%,  icon 20 / stroke 2.2
 *   Top Performers ..... size-10, rounded-xl,  amber-50,  icon 20 / stroke 2.2
 *   Aging Heatmap ...... no badge at all — a bare red flame, size-8
 *   Delegation ......... nothing
 *
 * So "add an icon matching the others" had no single answer to match. This is
 * that answer: fixed geometry for every section, and the only thing a caller
 * chooses is the glyph and the hue.
 *
 * HUE IS NOW ONE HUE. It used to be per-section and to mean something — red
 * for work that has gone wrong, amber for recognition, slate for a neutral
 * rollup. On the page that read as five unrelated widgets rather than one
 * dashboard, because colour is the first thing the eye groups by and nothing
 * else on these headings varied. Every caller passes `red`, the brand red the
 * Sent-Back Work badge has always used.
 *
 * The prop stays — the other tones are still defined and still correct if a
 * section ever needs to break out of the set — but "matches the others" now
 * has a single answer, and `red` is it.
 */
export type SectionIconTone = "red" | "amber" | "slate" | "blue" | "violet";

const TONE: Record<SectionIconTone, { bg: string; fg: string; ring: string }> = {
  // The brand red, via the token — not a hardcoded hex. The Aging Heatmap's
  // flame was a literal #dc2626, one of the near-miss reds this palette keeps
  // collecting.
  red: {
    bg: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
    fg: "var(--color-altus-red)",
    ring: "color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
  },
  amber: { bg: "#FFFBEB", fg: "#D97706", ring: "rgba(217,119,6,0.22)" },
  slate: { bg: "rgba(15,23,42,0.05)", fg: "#0F172A", ring: "rgba(15,23,42,0.12)" },
  blue: { bg: "#EFF6FF", fg: "#2563EB", ring: "rgba(37,99,235,0.22)" },
  violet: { bg: "#F5F3FF", fg: "#7C3AED", ring: "rgba(124,58,237,0.22)" },
};

export function SectionIcon({
  icon: Icon,
  tone,
  label,
}: {
  icon: LucideIcon;
  tone: SectionIconTone;
  /** Only for the rare case where the glyph is the sole thing naming the
   *  section. Normally the heading beside it does that, so the badge is
   *  decorative and hidden from assistive tech. */
  label?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border"
      style={{ background: t.bg, color: t.fg, borderColor: t.ring }}
    >
      <Icon size={18} strokeWidth={2.4} />
    </span>
  );
}
