"use client";

import * as React from "react";
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
 * A URL we should not even attempt.
 *
 * The payload carries whatever is in the column, and that has historically
 * included empty strings, whitespace, and the literal words "null"/"undefined"
 * from older imports. Each of those is truthy enough to reach `<img src>`,
 * where the browser resolves it against the current page and requests the PAGE
 * back as an image — which fails, but only after a real network round-trip and
 * a broken-image frame. Screening them here is cheaper and quieter than
 * catching the error afterwards.
 *
 * Anything else is passed through: absolute http(s), protocol-relative, root
 * paths, and data: URIs are all legitimate hosting shapes here, and this
 * component is the wrong place to have an opinion about which CDN is correct.
 */
function usableUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v === "null" || v === "undefined") return null;
  if (v.startsWith("blob:") || v.startsWith("data:")) return v;
  if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("//")) return v;
  if (v.startsWith("/")) return v;
  // A bare relative path ("uploads/x.png") resolves against the current route,
  // so the same file 404s on /tasks and loads on /. Too fragile to trust.
  return null;
}

/**
 * Soft gradient circular avatar. Renders the image when there is a usable one,
 * and the person's initials on a deterministic gradient otherwise.
 *
 * THE INITIALS ARE ALWAYS RENDERED, with the image layered ON TOP of them —
 * they are not an either/or. That is what makes a dead URL degrade cleanly:
 * previously the fallback only ran when `avatarUrl` was ABSENT, so a URL that
 * was present but 404/403'd produced the browser's broken-image glyph and alt
 * text, which also blew out the row height wherever the avatar sat in a table.
 * Now the img simply removes itself on error and reveals the badge underneath.
 *
 * The wrapper carries the fixed box (size + rounded-full + overflow-hidden), so
 * nothing the image does — failing, loading slowly, arriving at the wrong
 * aspect ratio — can change the layout around it.
 */
export function Avatar({
  name,
  avatarUrl,
  size = 28,
  title,
  className,
}: AvatarProps) {
  const safeName = (name ?? "?").trim() || "?";
  const initials =
    safeName
      .split(/\s+/)
      .map((p) => p[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const url = usableUrl(avatarUrl);

  // The URL the failure belongs to, rather than a bare boolean: a row that
  // re-renders with a DIFFERENT avatar must get a fresh attempt, and comparing
  // against the current url gives that for free — no effect, no stale flag.
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;

  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    background: gradientFor(safeName),
    boxShadow:
      "inset 0 0 0 1px rgba(255,255,255,0.18), 0 1px 2px rgba(15,23,42,0.10)",
  };

  return (
    <span
      role="img"
      aria-label={safeName}
      title={title ?? safeName}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${className ?? ""}`}
      style={style}
    >
      {initials}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          // Empty alt, not the name: the badge underneath already carries
          // `aria-label`, and a filled alt would have a screen reader announce
          // the person twice — and would paint alt TEXT over the initials for
          // the split second before onError fires.
          alt=""
          aria-hidden
          onError={() => setFailedUrl(url)}
          // Some avatar hosts reject hotlinked requests by Referer. Sending
          // none is the difference between a 403 and an image on those.
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
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
