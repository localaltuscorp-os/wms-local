import type { CSSProperties } from "react";

interface AvatarProps {
  name: string | null | undefined;
  /** Optional explicit URL; falls back to gradient + initials. */
  avatarUrl?: string | null;
  /** Pixel size of the avatar (default 28). */
  size?: number;
  /** Optional title attribute (tooltip on hover). */
  title?: string;
  className?: string;
}

/**
 * Soft gradient circular avatar.  When `avatarUrl` is present the image is
 * rendered, otherwise the first two initials of `name` are shown on a
 * deterministic gradient driven by the name itself, so the same person
 * always lands on the same hue.
 */
export function Avatar({
  name,
  avatarUrl,
  size = 28,
  title,
  className,
}: AvatarProps) {
  const safeName = (name ?? "?").trim() || "?";
  const initials = safeName
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  const gradient = gradientFor(safeName);
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    background: gradient,
    boxShadow:
      "inset 0 0 0 1px rgba(255,255,255,0.18), 0 1px 2px rgba(15,23,42,0.10)",
  };
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={safeName}
        title={title ?? safeName}
        className={`rounded-full object-cover block shrink-0 ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={safeName}
      title={title ?? safeName}
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 ${className ?? ""}`}
      style={style}
    >
      {initials}
    </span>
  );
}

/** Deterministic gradient pair selected from name char codes. */
function gradientFor(name: string): string {
  // 8 hand-picked gradients tuned to the Light Vibrant palette.
  const palette = [
    "linear-gradient(135deg, #E10600, #A80400)",     // altus red
    "linear-gradient(135deg, #f43f5e, #be123c)",     // rose
    "linear-gradient(135deg, #a855f7, #7c3aed)",     // purple
    "linear-gradient(135deg, #3b82f6, #1d4ed8)",     // blue
    "linear-gradient(135deg, #22c55e, #15803d)",     // green
    "linear-gradient(135deg, #f59e0b, #b45309)",     // amber
    "linear-gradient(135deg, #475569, #1f2937)",     // slate
    "linear-gradient(135deg, #06b6d4, #0e7490)",     // teal
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  const idx = h % palette.length;
  return palette[idx] ?? palette[0]!;
}
