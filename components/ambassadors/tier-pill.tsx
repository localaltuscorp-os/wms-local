import { Gem } from "lucide-react";
import type { Tier } from "@/lib/ambassadors/score";
import { TIER_LABELS } from "@/lib/ambassadors/score";

/**
 * Brand-toned tier badge. Elite = rich gold gradient, Gold = warm, Silver =
 * cool neutral. No raw Tailwind palette — color-mix tints off brand tokens.
 */
const TIER_STYLE: Record<Tier, { bg: string; ink: string; ring: string }> = {
  elite: {
    bg: "linear-gradient(135deg, #FFE29A, #E8B23A)",
    ink: "#6B4E00",
    ring: "rgba(184,138,0,0.35)",
  },
  gold: {
    bg: "linear-gradient(135deg, #FFF1CC, #F4D98A)",
    ink: "#7A5A00",
    ring: "rgba(184,138,0,0.28)",
  },
  silver: {
    bg: "linear-gradient(135deg, #F1F1F4, #DEDEE6)",
    ink: "#4A4A57",
    ring: "rgba(80,80,100,0.22)",
  },
};

export function TierPill({ tier, size = "md" }: { tier: Tier | string | null; size?: "sm" | "md" }) {
  const t = (tier && ["elite", "gold", "silver"].includes(tier) ? tier : "silver") as Tier;
  const s = TIER_STYLE[t];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12.5px]";
  const icon = size === "sm" ? 11 : 13;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${pad}`}
      style={{ background: s.bg, color: s.ink, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      <Gem size={icon} strokeWidth={2.6} />
      {TIER_LABELS[t]}
    </span>
  );
}
