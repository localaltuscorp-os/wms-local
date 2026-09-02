"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Home, ChevronDown } from "lucide-react";
import { HR_STAGES, hrItemHref } from "@/lib/hr/lifecycle";

/**
 * The shared HR rail — a self-contained left sidebar for the FULL-BLEED HR
 * surfaces (Evaluation, Hiring Analytics, …) that the global module rail
 * intentionally suppresses (see chrome-shell.tsx). It's generated from the ONE
 * lifecycle source (lib/hr/lifecycle.ts) so it always mirrors the HR home cards
 * and each stage's own sidebar.
 *
 * The Altus mark up top links to the hub; every lifecycle stage is an accordion
 * group (the one holding the current route auto-opens) so all HR tools are one
 * or two clicks away without a 30-row wall.
 */
export function HrShellSidebar() {
  const pathname = usePathname() ?? "";

  // A route is "in" a stage when any of its items' hrefs match (segment-aware).
  const activeStageSlug = React.useMemo(() => {
    for (const s of HR_STAGES) {
      for (const it of s.items) {
        const href = hrItemHref(s.slug, it);
        if (pathname === href || pathname.startsWith(href + "/")) return s.slug;
      }
      // Stage sub-hub itself.
      if (pathname === `/hr/${s.slug}` || pathname.startsWith(`/hr/${s.slug}/`)) return s.slug;
    }
    // Candidate Records lives under /hr/candidates but belongs to pre-interview.
    if (pathname.startsWith("/hr/candidates")) return "pre-interview";
    return null;
  }, [pathname]);

  const [open, setOpen] = React.useState<string | null>(activeStageSlug);
  // Keep the active stage open as the route changes (soft navigation).
  React.useEffect(() => {
    if (activeStageSlug) setOpen(activeStageSlug);
  }, [activeStageSlug]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    // Height is the viewport MINUS the app top bar, or the rail overflows the
    // page by exactly the bar's height and its footer sits below the fold.
    <aside
      className="hr-rail sticky sticky-below-topbar z-30 flex w-[248px] shrink-0 flex-col border-r border-hairline bg-white max-lg:hidden"
      style={{ height: "calc(100dvh - var(--app-topbar-h))" }}
    >
      {/* Brand — links to the hub */}
      <Link
        href={"/hub" as Route}
        className="group flex items-center gap-2.5 border-b border-hairline px-4 py-3.5 transition-colors hover:bg-surface-soft"
        title="Back to Hub"
      >
        <Image src="/logo-mark.png" alt="Altus" width={34} height={34} className="h-[34px] w-[34px] rounded-lg object-contain" />
        <span className="min-w-0">
          <span className="block text-[15px] font-black leading-none text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
            Altus
          </span>
          <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-altus-red-deep">
            Human Resources
          </span>
        </span>
      </Link>

      <nav aria-label="HR" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        {/* HR Home */}
        <Link
          href={"/hr" as Route}
          className={`mb-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-bold transition-colors ${
            pathname === "/hr" ? "bg-altus-red text-white" : "text-ink-strong hover:bg-surface-soft"
          }`}
        >
          <Home size={16} strokeWidth={2.4} /> HR Home
        </Link>

        {HR_STAGES.map((s) => {
          const isOpen = open === s.slug;
          const StageIcon = s.Icon;
          return (
            <div key={s.slug} className="mt-0.5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.slug)}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-bold uppercase tracking-[0.06em] transition-colors ${
                  activeStageSlug === s.slug ? "text-altus-red-deep" : "text-ink-soft hover:text-ink-strong"
                }`}
              >
                <StageIcon size={15} strokeWidth={2.3} className="shrink-0" />
                <span className="flex-1 truncate">{s.title}</span>
                <ChevronDown size={14} strokeWidth={2.6} className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              {isOpen && (
                <div className="mb-1 mt-0.5 flex flex-col gap-0.5 pl-1.5">
                  {s.items.map((it) => {
                    const href = hrItemHref(s.slug, it);
                    const active = isActive(href);
                    const ItemIcon = it.Icon;
                    return (
                      <Link
                        key={it.slug}
                        href={href as Route}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-semibold leading-tight transition-colors ${
                          active ? "bg-altus-red text-white shadow-sm" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
                        }`}
                        title={it.label}
                      >
                        <ItemIcon size={15} strokeWidth={2.1} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
