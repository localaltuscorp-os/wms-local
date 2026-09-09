import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { lettersByCategory } from "@/lib/hr/letters/registry";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The Letters index — every authored letter/agreement, grouped by family. Each
 * card opens that letter on its own page (`/hr/letters/<key>`). Adding a letter
 * to the registry makes it appear here automatically. Full-screen surface (no
 * left rail) — its back button is the nav.
 */
export default async function LettersIndexPage() {
  await requireHrStaff();
  const groups = lettersByCategory();

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <style>{`.ltr-grid{display:grid;gap:16px;grid-template-columns:1fr}@media(min-width:640px){.ltr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1024px){.ltr-grid{grid-template-columns:repeat(var(--cols),minmax(0,1fr))}}`}</style>
      <HrTitleBar
        title="Letters & Agreements"

      />

      <PageShell width="full" py={false} className="pt-10 pb-24">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-solid border-hairline-strong bg-white px-6 py-14 text-center text-[15px] font-medium text-ink-muted">
            No letters authored yet.
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {groups.map((group) => (
              <section key={group.category}>
                <h2
                  className="mb-4 flex items-center gap-3 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: "clamp(20px,1.7vw,26px)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-6 w-1.5 rounded-full"
                    style={{ background: `linear-gradient(180deg, ${RED}, ${RED_DEEP})` }}
                  />
                  {group.label}
                </h2>
                <div className="ltr-grid" style={{ ["--cols"]: group.letters.length } as CSSProperties}>
                  {group.letters.map((letter, i) => (
                    <Link
                      key={letter.key}
                      href={`/hr/letters/${letter.key}` as Route}
                      className="group wg-rise relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-white p-5 transition-all hover:border-hairline-strong hover:shadow-lg"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ background: `linear-gradient(90deg, ${RED}, ${RED_DEEP})` }}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <h3
                          className="text-ink-strong"
                          style={{
                            fontFamily: "var(--font-display), system-ui, sans-serif",
                            fontWeight: 800,
                            fontSize: 17,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {letter.title}
                        </h3>
                        <ArrowUpRight
                          size={17}
                          strokeWidth={2.4}
                          className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </div>
                      {letter.blurb && (
                        <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-ink-muted">
                          {letter.blurb}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageShell>
    </div>
  );
}
