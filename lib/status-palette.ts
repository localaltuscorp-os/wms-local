/**
 * THE STATUS PALETTE — one source for every surface that paints a status as a
 * solid coloured card: the Task Summary KPI strip, the Status Distribution
 * tiles and ribbon, and anything added beside them.
 *
 * It exists because the two existing surfaces had already drifted, and drifted
 * in the worst possible way: Task Summary painted NEED INFO bright red and NOT
 * APPROVED dark red, while Status Distribution painted them the other way
 * round. The same two statuses, inverted between two widgets on the same
 * screen. Nobody set out to do that — each widget just picked its own hex, and
 * a second copy of a palette is how a colour system dies.
 *
 * So: no surface defines a status colour any more. They read from here.
 */

/** Every status colour the dashboard paints, by semantic key.
 *
 *  THE SIX TASK-SUMMARY KEYS ARE PASTELS. They used to be fully saturated
 *  (slate-800, emerald-600, rose-900, red-600) and every consumer assumed white
 *  type would sit on them. Pastels invert that for four of the six, so the ink
 *  is no longer a constant — see STATUS_INK below, and never hardcode
 *  `text-white` against one of these fills again.
 *
 *  The remaining keys are untouched saturated values. Nothing renders them
 *  today (the KPI strip is this file's only consumer); if the Status
 *  Distribution tiles return, they need their own pass through this list rather
 *  than inheriting a half-pastel palette. */
export const STATUS_COLORS = {
  /** Neutral baseline for totals and unclassified aggregates. Lavender. */
  total: "#CFC6D9",
  /** Fresh pastel mint. Was a light vanilla cream (#F2E0D4) — a warm neutral
   *  that sat between Not Approved's peach and Pending's terracotta and read as
   *  a third shade of the same warm family rather than as the one card on the
   *  strip reporting good news. Mint gives DONE the only cool hue in the set.
   *  Still `dark` ink: it is a pastel. */
  done: "#ACDBC9",
  /** Coral / rose red. The one fill on the strip that is SATURATED rather than
   *  pastel — Pending is the largest bucket and the one being worked, so it
   *  carries the loudest colour.
   *
   *  CONTRAST WARNING, recorded here because the hex and the ink are chosen
   *  together: white type on this fill measures 2.72:1. That is below AA (4.5)
   *  and below even the 3:1 large-text floor, so the 32px number does not clear
   *  it either. `pending` is set to `light` ink in STATUS_INK on the brief's
   *  instruction; if it should read cleanly instead, either flip that entry to
   *  "dark" (slate-900 on this exact coral is 5.39:1) or darken the fill to
   *  #C2352F, which carries white at 5.46:1. */
  pending: "#F27877",
  /** One step off Pending: they sit adjacent in the distribution grid, and two
   *  identical fills there read as a rendering fault, not a shared family. */
  initiated: "#1d4ed8", // blue-700
  /** Dusty rose / warm terracotta — the tone Pending used to carry, freed when
   *  Pending took the coral. Well clear of `notStarted` now, so the collision
   *  these two keys used to have (an identical #71788B on both) is gone for a
   *  reason stronger than a nudge: they are no longer in the same family. */
  needInfo: "#D9ABA0",
  /** Steel blue. The only cool mid-tone on the strip, which is what separates
   *  sent-back work from the two warm fills either side of it. White type at
   *  4.51:1 — over AA, but only just, so do not lighten this hex without
   *  re-running the check. */
  notApproved: "#487BA6",
  onHold: "#d97706", // amber-600
  /** Muted slate blue / charcoal.
   *
   *  CONTRAST WARNING, as for `pending`: white type here is 4.41:1, just under
   *  the 4.5 AA floor. Kept at this hex on the brief's instruction after being
   *  raised once. #6B7280 (4.83:1) or #64748B (4.76:1) clear it while staying
   *  in the same slate family. */
  notStarted: "#71788B",
  /** "Not Read". A step off notStarted for the same adjacency reason. */
  notRead: "#475569", // slate-600
  archived: "#64748b", // slate-500
  approved: "#7c3aed", // violet-600
  followUp: "#0891b2", // cyan-600
  /** Retired statuses still present in old rows. */
  retired: "#64748b", // slate-500
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

/* ── SOFT CONTAINER TOKENS ─────────────────────────────────────────────────
   The KPI strip used to be six SATURATED gradient tiles carrying white type.
   That palette is still right where a status has to be picked out at a glance
   inside a dense grid — a dot on a row, a segment in a bar — which is why
   STATUS_COLORS stays exactly as it is.

   It was wrong for the six cards at the top of the dashboard. Six full-bleed
   saturated blocks in a row are the loudest thing on a page whose actual
   content is the tables below them, and the white-on-mid-tone type was scraping
   the AA floor on three of the six (the contrast notes above `pending`,
   `notApproved` and `notStarted` were all about exactly that). A pale tint with
   dark type of the same hue reads as the same family, states the number more
   clearly, and puts the contrast question out of reach: every `-900` on a `-50`
   is far past AA.

   Tailwind CLASSES, not hexes, because these are static and the class scanner
   can see them — a runtime-built `bg-${hue}-50` never gets generated.

   NO `dark:` VARIANTS. `dark:` compiles to prefers-color-scheme in this project
   and there is no dark theme behind it, so `dark:bg-purple-950/30` would drop a
   near-black fill into a white dashboard for any reader whose OS is in dark
   mode. If a real dark theme lands, this map is the one place to add them. */
/** The six keys that actually have a KPI card. Deliberately narrower than
 *  StatusColorKey: inventing container tokens for `archived` or `followUp`
 *  would be six unused entries that read as an unfinished map. */
export type StatusCardKey =
  | "total"
  | "needInfo"
  | "notApproved"
  | "done"
  | "pending"
  | "notStarted";

export const STATUS_CARD_TOKENS: Record<
  StatusCardKey,
  { shell: string; label: string; value: string; sub: string; badge: string; badgeActive: string; ring: string }
> = {
  total: {
    shell: "bg-purple-50/60 border-purple-200/80",
    label: "text-purple-800",
    value: "text-purple-950",
    sub: "text-purple-700",
    badge: "bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors",
    badgeActive: "bg-purple-200 text-purple-900 hover:bg-purple-300 transition-colors",
    ring: "ring-purple-300",
  },
  needInfo: {
    shell: "bg-amber-50/60 border-amber-200/80",
    label: "text-amber-800",
    value: "text-amber-950",
    sub: "text-amber-700",
    badge: "bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors",
    badgeActive: "bg-amber-200 text-amber-900 hover:bg-amber-300 transition-colors",
    ring: "ring-amber-300",
  },
  notApproved: {
    shell: "bg-slate-100/80 border-slate-300/80",
    label: "text-slate-700",
    value: "text-slate-900",
    sub: "text-slate-600",
    badge: "bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors",
    badgeActive: "bg-slate-300 text-slate-900 hover:bg-slate-400 transition-colors",
    ring: "ring-slate-400",
  },
  done: {
    shell: "bg-emerald-50/70 border-emerald-200/80",
    label: "text-emerald-800",
    value: "text-emerald-950",
    sub: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors",
    badgeActive: "bg-emerald-200 text-emerald-900 hover:bg-emerald-300 transition-colors",
    ring: "ring-emerald-300",
  },
  pending: {
    shell: "bg-rose-50/70 border-rose-200/80",
    label: "text-rose-800",
    value: "text-rose-950",
    sub: "text-rose-700",
    badge: "bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors",
    badgeActive: "bg-rose-200 text-rose-900 hover:bg-rose-300 transition-colors",
    ring: "ring-rose-300",
  },
  notStarted: {
    shell: "bg-indigo-50/60 border-indigo-200/80",
    label: "text-indigo-800",
    value: "text-indigo-950",
    sub: "text-indigo-700",
    badge: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors",
    badgeActive: "bg-indigo-200 text-indigo-900 hover:bg-indigo-300 transition-colors",
    ring: "ring-indigo-300",
  },
};

/** The soft-container bundle for a KPI card. */
export function statusCardTokens(key: StatusCardKey) {
  return STATUS_CARD_TOKENS[key];
}

/**
 * Which ink a fill carries — the half of the palette that used to be a global
 * constant.
 *
 * `"dark"` = slate-900 type on a light pastel; `"light"` = white type on a
 * mid/dark fill. This is a PROPERTY OF THE FILL, so it lives beside the hex:
 * change a colour above and its ink follows, instead of the two being edited in
 * different files a week apart.
 */
export type StatusInk = "dark" | "light";

export const STATUS_INK: Record<StatusColorKey, StatusInk> = {
  total: "dark",
  done: "dark",
  // Saturated coral -> white. See the contrast note beside the hex above: this
  // pairing measures 2.72:1 and is set on instruction, not on measurement.
  pending: "light",
  initiated: "light",
  // Dusty rose is a pastel -> slate-900.
  needInfo: "dark",
  // Steel blue -> white, at 4.51:1.
  notApproved: "light",
  onHold: "light",
  notStarted: "light",
  notRead: "light",
  archived: "light",
  approved: "light",
  followUp: "light",
  retired: "light",
};

/** Multiply a #rrggbb toward black. `amount` is a 0..1 fraction. */
function darken(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  const v = parseInt(full, 16);
  const scale = (channel: number) => Math.max(0, Math.round(channel * (1 - amount)));
  const r = scale((v >> 16) & 0xff);
  const g = scale((v >> 8) & 0xff);
  const b = scale(v & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * The card fill: a 135deg two-stop gradient from the base to 10% darker.
 *
 * A flat saturated block at card size is genuinely tiring to look at — there is
 * no shading anywhere for the eye to rest against, so the colour reads as
 * louder than it is. Ten percent is deliberately small: enough to give the
 * surface a direction, not enough to read as a separate colour or to drag the
 * bottom corner below the contrast the white type needs.
 */
export function statusGradient(base: string): string {
  return `linear-gradient(135deg, ${base}, ${darken(base, 0.1)})`;
}

/** Inline style for a solid status card — gradient fill plus the hairline. */
export function statusCardStyle(
  base: string,
  ink: StatusInk = "light",
): { background: string; border: string } {
  return {
    background: statusGradient(base),
    // THE HAIRLINE FOLLOWS THE INK. On a dark fill a low-opacity white edge
    // lifts the card off the near-white page, where a dark edge would read as a
    // shadow gluing it down. On a PASTEL fill that same white edge is invisible
    // and the card melts into the page, so a light fill takes a faint slate
    // edge instead — the only thing giving it an outline.
    border:
      ink === "dark"
        ? "1px solid rgba(15,23,42,0.10)"
        : "1px solid rgba(255,255,255,0.10)",
  };
}

/**
 * The action badge that rides on top of a solid card (the KPI strip's View/Hide
 * pill), plus the type colours that go with each ink.
 *
 * Translucent BLACK on the pastels rather than a solid colour: one recipe per
 * ink family that holds its contrast across every fill in that family, with no
 * per-status tuning and nothing to re-check when a colour changes.
 *
 * NO `dark:` VARIANT on the badge. These cards are painted a fixed hex that
 * does not follow the OS theme, so `dark:bg-white/10` would swap the pill to
 * near-white ON A PASTEL — invisible — the moment someone's system flipped to
 * dark. (This app has no dark theme at all; see the note on DASHBOARD_CARD in
 * components/dashboard/section-chrome.tsx.)
 */
export const STATUS_CARD_INK: Record<
  StatusInk,
  { text: string; subtext: string; badge: string; badgeActive: string; ring: string }
> = {
  dark: {
    text: "text-slate-900",
    subtext: "text-slate-900",
    badge: "bg-black/10 hover:bg-black/20 text-slate-900 backdrop-blur-xs transition-colors",
    badgeActive:
      "bg-black/20 hover:bg-black/30 text-slate-900 backdrop-blur-xs transition-colors",
    ring: "ring-slate-900/30",
  },
  light: {
    text: "text-white",
    subtext: "text-white",
    // TRANSLUCENT WHITE on the saturated fills, not black. A black scrim on
    // coral or steel blue just reads as a dirty patch — it darkens a colour
    // that is already mid-toned, so the pill looks like a printing fault rather
    // than a control. White lifts it the way glass would, and it is the same
    // direction the type on these cards already goes.
    badge: "bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs transition-colors",
    badgeActive: "bg-white/35 hover:bg-white/45 text-white backdrop-blur-xs transition-colors",
    ring: "ring-white/70",
  },
};

/** The ink bundle for a palette key — fill and type resolved together. */
export function statusCardInk(key: StatusColorKey) {
  return STATUS_CARD_INK[STATUS_INK[key]];
}
