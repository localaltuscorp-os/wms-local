import * as React from "react";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Bespoke module logo marks — a PASTEL app-icon per workspace: a soft pastel
 * tile in the module's hue, the mark drawn in the module's DEEP ink so it reads
 * clearly, and a prominent ink outline so the (light) tile never dissolves into
 * the (light) pastel card behind it. Two-tone glyphs use white for the cut-out
 * flash. One source, keyed by WorkspaceId.
 *
 * Each glyph is drawn on a 64×64 tile: `ink` = the deep mark colour, `light` =
 * white for the contrast cut-outs (a check on a shield, a calendar header).
 */

// [pastel-from, pastel-to, deep-ink] per module.
//
// MIRRORS `HUB_PASTEL` in app/(app)/hub/page.tsx — the tile has always followed
// its card, and the one time it didn't (a purple Billing tile on a neutral card)
// it read as a mistake. So modules 2–0 now carry the same two colours the card
// does: the tile takes the BACKGROUND and the glyph takes the PRIMARY.
//
// The tile fill matching the card is safe here because of the 2.4px `ink`
// outline stroked round the tile below — that outline, not a darker fill, is
// what keeps the mark from dissolving into the card. Deepening the tile would
// mean inventing a third colour per module, which the brief rules out.
//
// WMS IS UNTOUCHED — its red tile, gradient and ink stay exactly as they were.
const PAL: Record<WorkspaceId, { from: string; to: string; ink: string }> = {
  wms: { from: "#FFC9C6", to: "#FFA9A5", ink: "#B4160E" }, // (unchanged)
  goals: { from: "#F4E1D5", to: "#F4E1D5", ink: "#A85432" }, // 2 · terracotta
  productivity: { from: "#E5E4F7", to: "#E5E4F7", ink: "#5148A3" }, // 3 · deep indigo
  billing: { from: "#ECECEA", to: "#ECECEA", ink: "#5F5E59" }, // 4 · platinum grey
  hr: { from: "#DDF1EC", to: "#DDF1EC", ink: "#147D73" }, // 5 · teal
  sales: { from: "#EAE1F7", to: "#EAE1F7", ink: "#6838B8" }, // 6 · royal purple
  admin: { from: "#E3EAF4", to: "#E3EAF4", ink: "#315A9B" }, // 7 · slate blue (the "Accounts" card)
  training: { from: "#F5E0E9", to: "#F5E0E9", ink: "#C32968" }, // 8 · berry
  employees: { from: "#DDF1E2", to: "#DDF1E2", ink: "#16803C" }, // 9 · forest green
  events: { from: "#D9F1F5", to: "#D9F1F5", ink: "#167C91" }, // 0 · cyan/teal
  "people-allocation": { from: "#FFDCC0", to: "#FCC79C", ink: "#C2410C" }, // 11 · orange (matches the card)
  accounts: { from: "#E3EAF4", to: "#E3EAF4", ink: "#315A9B" }, // shadows `admin`
  "project-plan": { from: "#FFC9C6", to: "#FFA9A5", ink: "#B4160E" }, // 12 · red (matches the wms tile)
};

function Glyph({ id, ink, light }: { id: WorkspaceId; ink: string; light: string }) {
  switch (id) {
    // WMS — a 2×2 work dashboard, tiles fading back for depth.
    case "wms":
      return (
        <g fill={ink}>
          <rect x="16" y="16" width="14" height="14" rx="3.6" />
          <rect x="34" y="16" width="14" height="14" rx="3.6" opacity="0.72" />
          <rect x="16" y="34" width="14" height="14" rx="3.6" opacity="0.72" />
          <rect x="34" y="34" width="14" height="14" rx="3.6" opacity="0.48" />
        </g>
      );
    // Goals — a clean filled bullseye.
    case "goals":
      return (
        <g>
          <circle cx="32" cy="32" r="15.5" fill={ink} />
          <circle cx="32" cy="32" r="10" fill={light} />
          <circle cx="32" cy="32" r="4.4" fill={ink} />
        </g>
      );
    // Productivity — a speedometer: dial arc, three ticks, and a needle swung
    // up-and-right into the fast end. (Without this case the switch fell through
    // to `default: null` and the card rendered an empty pastel tile.)
    case "productivity":
      return (
        <g>
          {/* Dial — an open arc so it reads as a gauge, not a ring. */}
          <path
            d="M16 42 A16 16 0 0 1 48 42"
            fill="none"
            stroke={ink}
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Graduations at the low / mid / high marks. */}
          <g stroke={ink} strokeWidth="2.4" strokeLinecap="round" opacity="0.5">
            <path d="M20.6 32.2 l2.5 1.7" />
            <path d="M32 27.6 v3" />
            <path d="M43.4 32.2 l-2.5 1.7" />
          </g>
          {/* Needle + hub, the hub cut white so it stays legible on the ink. */}
          <path d="M32 42 L41.6 31.4" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          <circle cx="32" cy="42" r="4.6" fill={ink} />
          <circle cx="32" cy="42" r="1.9" fill={light} />
        </g>
      );
    // Admin — a control-room shield with a bold white check.
    case "admin":
      return (
        <g>
          <path d="M32 14 L47.5 19.5 V32.5 C47.5 41.2 40.8 46.8 32 49.8 C23.2 46.8 16.5 41.2 16.5 32.5 V19.5 Z" fill={ink} />
          <path d="M25.5 32 l4.9 4.9 L40.5 26.4" fill="none" stroke={light} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    // Employees — two people, front solid, back softened.
    case "employees":
      return (
        <g fill={ink}>
          <g opacity="0.62">
            <circle cx="41" cy="25.5" r="6" />
            <path d="M31.5 47 c0-6.6 4.4-10.6 9.5-10.6 s9.5 4 9.5 10.6 z" />
          </g>
          <circle cx="25" cy="27" r="7.2" />
          <path d="M13.5 49 c0-7.6 5.2-11.8 11.5-11.8 s11.5 4.2 11.5 11.8 z" />
        </g>
      );
    // Sales — ascending bars under a bold rising trend arrow.
    case "sales":
      return (
        <g>
          <g fill={ink}>
            <rect x="15.5" y="37" width="8" height="12" rx="2.2" />
            <rect x="28" y="30" width="8" height="19" rx="2.2" opacity="0.82" />
            <rect x="40.5" y="22" width="8" height="27" rx="2.2" opacity="0.66" />
          </g>
          <path d="M16 31 L29 24 L37 28 L48 16.5" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M40.5 16.5 L48 16.5 L48 24" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    // HR — an ID badge on a lanyard clip: portrait + shoulders cut out in white.
    case "hr":
      return (
        <g>
          <rect x="28.4" y="12.5" width="7.2" height="9" rx="2.6" fill={ink} />
          <rect x="16.5" y="18.5" width="31" height="32.5" rx="6.5" fill={ink} />
          <circle cx="32" cy="30.5" r="4.8" fill={light} />
          <path d="M23.8 44.5 c0-5 3.6-7.8 8.2-7.8 s8.2 2.8 8.2 7.8 z" fill={light} />
        </g>
      );
    // Training — a graduation mortarboard with a tassel.
    case "training":
      return (
        <g fill={ink}>
          <path d="M32 17.5 L52 27 L32 36.5 L12 27 Z" />
          <path d="M21 31.5 V40.5 C21 44 26 46.5 32 46.5 C38 46.5 43 44 43 40.5 V31.5 L32 36.7 Z" opacity="0.82" />
          <path d="M52 27 V39.5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="52" cy="41.5" r="2.7" />
        </g>
      );
    // Events — a calendar with a white header + highlighted day.
    case "events":
      return (
        <g>
          <rect x="21" y="14.5" width="3.8" height="9" rx="1.9" fill={ink} />
          <rect x="39.2" y="14.5" width="3.8" height="9" rx="1.9" fill={ink} />
          <rect x="14" y="19" width="36" height="31" rx="6.5" fill={ink} />
          <rect x="14" y="19" width="36" height="10" rx="6.5" fill={light} />
          <g fill={light}>
            <circle cx="22.5" cy="37" r="2.3" />
            <circle cx="32" cy="37" r="2.3" />
            <circle cx="22.5" cy="44.5" r="2.3" />
            <rect x="37.5" y="34.5" width="6.5" height="6.5" rx="2" />
          </g>
        </g>
      );
    // Hand-holding — a lead figure with two team-mates behind, the shape the
    // module is about: one person carrying a group.
    case "people-allocation":
      return (
        <g fill={ink}>
          <circle cx="33" cy="24" r="8.5" />
          <path d="M18 52 a15 15 0 0 1 30 0 a3 3 0 0 1-3 3 H21 a3 3 0 0 1-3-3 Z" />
          <g opacity="0.55">
            <circle cx="15.5" cy="30" r="6" />
            <path d="M4 51 a11.5 11.5 0 0 1 12-11.4 a19 19 0 0 0-5.6 11.4 Z" />
            <circle cx="50.5" cy="30" r="6" />
            <path d="M62 51 a11.5 11.5 0 0 0-12-11.4 a19 19 0 0 1 5.6 11.4 Z" />
          </g>
          {/* A tally bar under the group — the module's count-first idea. */}
          <rect x="24" y="59" width="18" height="3.2" rx="1.6" fill={light} opacity="0.9" />
        </g>
      );
    // Billing — an invoice slip (zig-zag tear-off bottom) with a white ₹ cut out.
    case "billing":
      return (
        <g>
          <path
            d="M18 18.5 a5.5 5.5 0 0 1 5.5-5.5 h17 a5.5 5.5 0 0 1 5.5 5.5 V51.5 l-3.5-3.6 -3.5 3.6 -3.5-3.6 -3.5 3.6 -3.5-3.6 -3.5 3.6 -3.5-3.6 -3.5 3.6 Z"
            fill={ink}
          />
          {/* Rupee mark, drawn on lucide's 24×24 grid and scaled into the slip. */}
          <g
            transform="translate(17.6 16.6) scale(1.2)"
            fill="none"
            stroke={light}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3h12" />
            <path d="M6 8h12" />
            <path d="M6 13h3" />
            <path d="M9 13c6.667 0 6.667-10 0-10" />
            <path d="M6 13l8.5 8" />
          </g>
        </g>
      );
    // Project — an indented tree: one root with two children stepping down and
    // in, which is the hierarchy the module is for.
    case "project-plan":
      return (
        <g stroke={ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Root row. */}
          <path d="M15 19h20" />
          {/* Spine dropping to each child, with the elbow into the child row. */}
          <path d="M20 19v11h15" />
          <path d="M20 30v13h22" />
          {/* Child rows, drawn shorter so the indent reads at 24px. */}
          <path d="M35 30h11" />
          <path d="M42 43h7" />
        </g>
      );
    default:
      return null;
  }
}

export function ModuleLogo({ id, size = 56, className }: { id: WorkspaceId; size?: number; className?: string }) {
  const { from, to, ink } = PAL[id] ?? PAL.wms;
  const gid = `mlogo-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`${gid}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${gid}-sheen`} x1="32" y1="2" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* pastel tile + soft top sheen */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${gid}-bg)`} />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${gid}-sheen)`} />
      {/* prominent ink outline so the pastel tile never dissolves into the card */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke={ink} strokeOpacity="0.9" strokeWidth="2.4" />
      <Glyph id={id} ink={ink} light="#ffffff" />
    </svg>
  );
}
