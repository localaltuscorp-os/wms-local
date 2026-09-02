import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { EVENTS_SECTIONS } from "@/lib/monthly-events/sections";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireEventsAccess } from "@/lib/monthly-events/access";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.events;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function EventsHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const { isAdmin } = await requireEventsAccess();

  const sections = [...EVENTS_SECTIONS]
    .filter((s) => isAdmin || !s.adminOnly)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        {/* MINIMAL HEADER (Sir) — the shared PageCommandBar, which is the
            Yearly Goals band extracted for reuse (see its own doc comment). The
            poster hero that stood here — a red uppercase pill, a 46px two-line
            display headline and a paragraph — was three bands of chrome before
            any content. The band keeps the name and one line of orientation. */}
        <PageCommandBar
          title="Monthly Events Master"
          hint="The company calendar — batches, meetings and obligations, one month at a glance."
        />

        <section
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {sections.map((s, i) => {
            const Icon = s.Icon;
            return (
              <Link
                key={s.slug}
                href={`/events/${s.slug}` as Route}
                className="group wg-rise relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 transition-all hover:border-hairline-strong hover:shadow-lg"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </div>
                <h2
                  className="mt-3.5 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.title}
                </h2>
                <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">
                  {s.blurb}
                </p>
              </Link>
            );
          })}
        </section>
      </main>
    </>
  );
}
