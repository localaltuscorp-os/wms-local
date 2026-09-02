"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

export type AdminKpiTone = "blue" | "green" | "amber" | "red" | "rose" | "purple";

interface Props {
  label: string;
  value: number;
  hint?: string;
  tone: AdminKpiTone;
  /**
   * Pre-rendered icon element (e.g. `<Users size={16} strokeWidth={2.2} />`).
   * Accepts ReactNode instead of a Lucide component class because Next 16's
   * RSC serializer rejects forwardRef components crossing the
   * server-to-client boundary.
   */
  icon: ReactNode;
  href?: Route;
  index?: number;
}

/**
 * Compact admin KPI tile — matches the public dashboard's KPI strip aesthetic
 * but slimmer (4-up grid).  Optional `href` makes the tile a link with a
 * subtle color-matched glow on hover.
 */
export function AdminKpiTile({
  label,
  value,
  hint,
  tone,
  icon,
  href,
  index = 0,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  const c = (suffix: "" | "-deep" | "-bg") => `var(--color-${tone}${suffix})`;

  function onEnter() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "translateY(-2px)";
    el.style.boxShadow = `0 24px 48px -16px color-mix(in srgb, ${c("")} 26%, transparent)`;
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "translateY(0)";
    el.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.04)";
  }

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-bold tracking-[0.10em] uppercase" style={{ color: c("-deep") }}>
          {label}
        </div>
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{
            background: c("-bg"),
            color: c("-deep"),
            border: `1px solid color-mix(in srgb, ${c("")} 22%, transparent)`,
          }}
        >
          {icon}
        </span>
      </div>
      <div
        className="mt-2 font-serif tabular-nums leading-none"
        style={{
          display: "inline-block",
          paddingRight: "0.08em",
          fontSize: 44,
          fontWeight: 500,
          letterSpacing: "-0.025em",
          background: `linear-gradient(135deg, ${c("")}, ${c("-deep")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[13.5px] text-ink-subtle">{hint}</div>
      )}
    </>
  );

  const baseClass =
    "block rounded-kpi bg-surface-card p-5 transition-all w-full focus-visible:outline-2 focus-visible:outline-offset-2";
  const baseStyle: React.CSSProperties = {
    border: `1px solid color-mix(in srgb, ${c("")} 18%, transparent)`,
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
    outlineColor: c(""),
    opacity: 0,
    animation: "fadeUp 500ms ease-out forwards",
    animationDelay: `${index * 50}ms`,
  };

  if (href) {
    return (
      <Link
        href={href}
        ref={ref as unknown as React.Ref<HTMLAnchorElement>}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        className={baseClass}
        style={baseStyle}
      >
        {inner}
      </Link>
    );
  }

  return (
    <article ref={ref} className={baseClass} style={baseStyle}>
      {inner}
    </article>
  );
}
