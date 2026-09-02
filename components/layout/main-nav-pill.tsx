"use client";
import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { formatCount } from "@/lib/format";

interface Props {
  href: Route;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  count?: number;
  /** Unread/notification badge — small red dot on top-right of the pill. */
  badge?: number;
  /** Stretch to fill available width on desktop (header spreads pills edge-to-edge). */
  grow?: boolean;
  variant?: "drawer";
}

export function MainNavPill({ href, label, Icon, active, count, badge, grow, variant }: Props) {
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeLabel = showBadge ? (badge > 99 ? "99+" : formatCount(badge)) : "";

  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={
        (active ? "nav-pill nav-pill-active" : "nav-pill") +
        (grow ? " md:flex-1 md:justify-center" : "") +
        (showBadge ? " relative" : "") +
        (variant === "drawer" ? " w-full justify-start" : "")
      }
      aria-label={
        showBadge
          ? `${label} — ${badge} new ${badge === 1 ? "event" : "events"}`
          : label
      }
    >
      <Icon size={16} strokeWidth={2.2} />
      {/* Labels collapse to icon-only below xl so the centred nav never
          overflows into the logo / right cluster on a maximized laptop. */}
      <span className={variant === "drawer" ? "" : "max-xl:hidden"}>{label}</span>
      {typeof count === "number" && (
        <span className={variant === "drawer" ? "nav-pill-count" : "nav-pill-count max-md:hidden"}>{formatCount(count)}</span>
      )}
      {showBadge && (
        <span
          aria-hidden
          className="nav-pill-badge"
          // The styles live inline so we don't have to touch globals.css —
          // the @utility list there is curated; small pieces stay local.
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg, #ff5560, var(--color-altus-red))",
            color: "#ffffff",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: 0,
            boxShadow:
              "0 0 0 2px rgba(15, 23, 42, 0.82), 0 4px 10px rgba(225, 6, 0, 0.45)",
            animation: "navPillBadgePulse 2.4s ease-in-out infinite",
          }}
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  );
}
