"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

/**
 * A bucket accordion — a titled, collapsible container for a group of sections,
 * with a progress chip on the right. Smooth CSS height/opacity, no JS animation.
 */
export function BucketAccordion({
  n,
  title,
  blurb,
  right,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  right?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left max-sm:px-4"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
            {title}
          </span>
          <span className="mt-0.5 block text-[12.5px] font-medium leading-snug text-ink-muted">{blurb}</span>
        </span>
        {right && <span className="shrink-0 max-sm:hidden">{right}</span>}
        <ChevronDown
          size={20}
          className="shrink-0 text-ink-muted transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <div className="ev2-collapse border-t border-hairline px-5 pb-6 pt-5 max-sm:px-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** The header shell for one lettered section (its code badge + title). */
export function SectionShell({
  code,
  title,
  children,
  gated,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
  gated?: boolean;
}) {
  return (
    <section className={gated ? "ev2-collapse" : undefined}>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-black"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}
        >
          {code}
        </span>
        <h3 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}
