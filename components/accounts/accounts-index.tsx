import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Lock, CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import type { AccountsSection } from "@/lib/accounts/sections";

/**
 * Data-driven Index list for the Accounts module. Renders every section from
 * the registry (already ordered by the page) as a full-width card-row linking
 * to /accounts/<slug>, with a Built/Coming chip and a lock marker on sensitive
 * sections. Adding or reordering a section needs no change here.
 */
export function AccountsIndex({ sections }: { sections: AccountsSection[] }) {
  return (
    <ol className="flex flex-col gap-3 list-none m-0 p-0">
      {sections.map((s, i) => {
        const built = s.status === "built";
        const linked = s.status === "link";
        return (
          <li key={s.slug} className="wg-rise" style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}>
            <Link
              href={(linked && s.href ? s.href : `/accounts/${s.slug}`) as Route}
              className="group flex items-center gap-5 rounded-section border border-hairline bg-surface-card px-6 py-5 max-md:px-4 max-md:py-4 transition-all hover:border-ink-soft"
              style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
              aria-label={`Open ${s.title}`}
            >
              <span
                className="shrink-0 grid place-items-center rounded-xl text-[13px] font-bold tabular-nums"
                style={{
                  width: 44,
                  height: 44,
                  background: "var(--color-surface-soft)",
                  color: "var(--color-ink-soft)",
                  fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                }}
                aria-hidden
              >
                {String(s.order).padStart(2, "0")}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2
                    className="text-ink-strong truncate"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontWeight: 800,
                      fontSize: "clamp(17px, 1.6vw, 21px)",
                      letterSpacing: "-0.015em",
                      lineHeight: 1.1,
                      margin: 0,
                    }}
                  >
                    {s.title}
                  </h2>
                  {s.sensitive && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{
                        color: "var(--color-altus-red-deep)",
                        background: "rgba(225,6,0,0.08)",
                        border: "1px solid rgba(225,6,0,0.22)",
                      }}
                    >
                      <Lock size={11} strokeWidth={2.6} aria-hidden /> Restricted
                    </span>
                  )}
                </div>
                <p className="mt-1 text-ink-muted font-medium" style={{ fontSize: 14, lineHeight: 1.45 }}>
                  {s.blurb}
                </p>
              </div>

              <span
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em]"
                style={
                  built || linked
                    ? { color: "var(--color-green-deep)", background: "rgba(16,122,87,0.10)", border: "1px solid rgba(16,122,87,0.25)" }
                    : { color: "var(--color-ink-soft)", background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }
                }
              >
                {linked ? (
                  <ExternalLink size={13} strokeWidth={2.6} aria-hidden />
                ) : built ? (
                  <CheckCircle2 size={13} strokeWidth={2.6} aria-hidden />
                ) : (
                  <Clock3 size={13} strokeWidth={2.6} aria-hidden />
                )}
                {linked ? "Live" : built ? "Built" : "Coming"}
              </span>

              <ArrowUpRight
                size={20}
                strokeWidth={2.4}
                className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
