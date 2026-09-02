import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import type { SignatureStatus } from "@/lib/documents/signing";

/**
 * Documents · a small brand-consistent signature-status pill for the HR admin
 * lists (Letters + Agreements). `null` means no DigiLocker signing has been
 * started for that document yet. Pure presentational — safe in both server and
 * client component trees.
 */

const STYLES: Record<
  SignatureStatus,
  { label: string; bg: string; fg: string; Icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "Pending",
    bg: "color-mix(in srgb, #C2740A 15%, transparent)",
    fg: "#8A5207",
    Icon: Clock,
  },
  verified: {
    label: "Verified",
    bg: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)",
    fg: "var(--color-altus-red-deep)",
    Icon: ShieldCheck,
  },
  signed: {
    label: "Signed",
    bg: "color-mix(in srgb, #15803d 16%, transparent)",
    fg: "#15803d",
    Icon: CheckCircle2,
  },
};

export function SignatureStatusPill({
  status,
  size = 12,
}: {
  status: SignatureStatus | null;
  size?: number;
}) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
        style={{
          background: "color-mix(in srgb, var(--color-ink-soft) 12%, transparent)",
          color: "var(--color-ink-soft)",
        }}
      >
        Not started
      </span>
    );
  }
  const s = STYLES[status];
  const Icon = s.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
      style={{ background: s.bg, color: s.fg }}
    >
      <Icon size={size} strokeWidth={2.6} />
      {s.label}
    </span>
  );
}
