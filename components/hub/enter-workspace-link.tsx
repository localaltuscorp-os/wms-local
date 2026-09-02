"use client";

import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties, ReactNode } from "react";

/**
 * Hub workspace-entry link (client leaf).
 *
 * Sets the active-workspace cookie ("aw") client-side, then navigates DIRECTLY to
 * the module's landing page via a normal <Link> — so Next.js prefetches the target
 * (on hover in dev, in-viewport in prod) and it opens instantly. This skips the
 * old `/ws/<id>` server redirect round-trip (an auth DB lookup + a 307 that Next
 * can't prefetch), which was the source of the slow "click HR → wait → /hr" hop.
 *
 * The cookie mirrors exactly what the `/ws/<id>` handler set: 30-day, path=/, lax.
 * The `/ws/<id>` route stays in place for direct links / bookmarks.
 */
export function EnterWorkspaceLink({
  id,
  href,
  ariaLabel,
  className,
  style,
  children,
}: {
  id: string;
  href: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={ariaLabel}
      className={className}
      style={style}
      onClick={() => {
        document.cookie = `aw=${id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      }}
    >
      {children}
    </Link>
  );
}
