import Link from "next/link";
import type { Route } from "next";
import { MODULE_THEME } from "@/lib/module-theme";
import { OPERATIONS_AREAS, type OperationsArea } from "@/lib/operations/nav";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";

/**
 * OPERATIONS front door — the room's four areas as a card deck.
 *
 * ── WHY A DECK AND NOT A DASHBOARD ───────────────────────────────────────
 * The four areas share a room but not a subject: staffing, a company calendar,
 * a checklist and a set of written guidelines have no combined number worth
 * putting at the top. A deck says what is in the room and gets out of the way,
 * which is the same call the HR front door makes for the same reason.
 *
 * ── THE CARDS FOLLOW THE HUB'S OWN LANGUAGE ──────────────────────────────
 * Pastel tile, oversized quiet glyph, title, one line of tagline — deliberately
 * the shape of a hub card, because this page IS a hub, one level down. It does
 * NOT import the hub's WorkspaceCard: that component is bound to ModuleTheme
 * and carries hub-only furniture (the Alt-letter badge, the locked state, the
 * staggered entrance keyed to MODULE_ORDER). None of that applies to an area
 * inside a room, and bending it to fit would put hub-only concepts on a page
 * that has no shortcuts and no locks.
 *
 * ── ONE COLOUR, FOUR TINTS ───────────────────────────────────────────────
 * Every card is a tint of the room's own red rather than four unrelated hues.
 * The colour system's job is to say WHICH ROOM you are in; four rainbow cards
 * here would say "four rooms" and undo it. Depth within the room is carried by
 * the tint's strength instead — see AREA_TINT.
 *
 * The red comes from MODULE_THEME.operations, which is the WMS accent — the
 * account holder's call, and the reason this room reads as a WMS sibling.
 */

const THEME = MODULE_THEME.operations;

/** Tints of the room's red, light → strong, in the order the cards read.
 *  Anchored on the hub card's own pastel (#FEE2E2 → #FECACA) so the front door
 *  reads as the inside of the card you clicked. */
const AREA_TINT = ["#FEE2E2", "#FDD8D8", "#FCCECE", "#FBC4C4"] as const;

function AreaCard({ area, tint }: { area: OperationsArea; tint: string }) {
  const { Icon } = area;
  return (
    <Link
      href={area.href as Route}
      className="group relative flex min-h-[168px] flex-col justify-end overflow-hidden rounded-section p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none"
      style={{
        background: tint,
        /* A hairline in the room's own ink rather than the generic one: at these
           tint strengths a neutral border reads as a smudge. */
        border: `1px solid color-mix(in srgb, ${THEME.accentDeep} 14%, transparent)`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      {/* The oversized glyph, bottom-right at low opacity — texture, not an
          icon. Same trick the hub cards use, and `aria-hidden` for the same
          reason: the link's own text already names the area. */}
      <Icon
        aria-hidden
        size={104}
        strokeWidth={1.6}
        className="pointer-events-none absolute -bottom-5 -right-4 opacity-[0.10] transition-opacity duration-200 group-hover:opacity-[0.16]"
        style={{ color: THEME.accentDeep }}
      />

      <span
        className="inline-flex size-10 items-center justify-center rounded-xl"
        style={{
          background: "rgba(255,255,255,0.62)",
          color: THEME.accentDeep,
        }}
      >
        <Icon size={20} strokeWidth={2.2} aria-hidden />
      </span>

      <h2
        className="relative mt-3 text-[17px] font-extrabold leading-tight"
        style={{ color: THEME.accentDeep }}
      >
        {area.label}
      </h2>
      <p
        className="relative mt-1 max-w-[34ch] text-[13px] font-medium leading-snug"
        style={{ color: `color-mix(in srgb, ${THEME.accentDeep} 78%, #1f2937)` }}
      >
        {area.tagline}
      </p>
    </Link>
  );
}

export function OperationsHome() {
  return (
    <PageShell>
      <header className="mb-6">
        <div
          className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: THEME.accentDeep }}
        >
          <THEME.Icon size={13} strokeWidth={2.6} aria-hidden /> Operations
        </div>
        <h1
          className="mt-0.5 text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(22px, 2.2vw, 30px)",
          }}
        >
          The operations room
        </h1>
        <p className="mt-1 text-[14px] font-medium text-ink-subtle">
          Four areas. Pick one — the sidebar switches to it, and Operations Home
          brings you back here.
        </p>
      </header>

      <CardGrid min={260} maxCols={4}>
        {OPERATIONS_AREAS.map((a, i) => (
          <AreaCard key={a.href} area={a} tint={AREA_TINT[i] ?? AREA_TINT[0]} />
        ))}
      </CardGrid>
    </PageShell>
  );
}
