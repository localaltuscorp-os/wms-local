import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Database, LayoutDashboard } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { OPERATIONS_AREAS, OPERATIONS_MASTERS } from "@/lib/operations/nav";

export const dynamic = "force-dynamic";

/** A live navigation dashboard: every card is drawn from the same source as the sidebar. */
export default async function OperationsDashboardPage() {
  await requireWorkspace("operations");

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" className="pt-6 pb-14 max-md:pt-4">
        <header
          className="mb-6 flex flex-wrap items-center gap-3 rounded-[20px] border border-hairline bg-surface-card px-5 py-4 max-md:px-4"
          style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.22)" }}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-altus-red/10 text-altus-red">
            <LayoutDashboard size={20} strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="page-heading">Operations Dashboard</h1>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-subtle">Your operational workspaces and masters in one place.</p>
          </div>
        </header>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">Workspaces</h2>
            <span className="text-[12px] font-bold tabular-nums text-ink-subtle">{OPERATIONS_AREAS.length} areas</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {OPERATIONS_AREAS.map(({ id, href, label, tagline, Icon }) => (
              <Link
                key={id}
                href={href as Route}
                className="group rounded-[16px] border border-hairline bg-surface-card p-4 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.55)] transition-all hover:-translate-y-0.5 hover:border-altus-red/45 hover:shadow-[0_18px_30px_-24px_rgba(225,6,0,0.35)] focus-visible:-outline-offset-2"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-altus-red/10 text-altus-red"><Icon size={18} strokeWidth={2.25} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[14px] font-bold text-ink-strong">
                      <span className="truncate">{label}</span><ArrowUpRight size={15} className="shrink-0 text-ink-subtle transition-colors group-hover:text-altus-red" aria-hidden />
                    </span>
                    <span className="mt-1.5 block text-[12px] font-medium leading-relaxed text-ink-subtle">{tagline}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">Masters</h2>
            <span className="text-[12px] font-bold tabular-nums text-ink-subtle">{OPERATIONS_MASTERS.length} references</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {OPERATIONS_MASTERS.map(({ href, label, blurb, Icon }) => (
              <Link key={href} href={href as Route} className="group rounded-[14px] border border-hairline bg-surface-card p-4 transition-colors hover:border-altus-red/45 hover:bg-altus-red/[0.025] focus-visible:-outline-offset-2">
                <span className="flex items-center gap-2 text-[13px] font-bold text-ink-strong"><Database size={14} className="text-altus-red" aria-hidden /><Icon size={15} className="text-ink-soft" aria-hidden />{label}</span>
                <span className="mt-2 block text-[12px] font-medium leading-relaxed text-ink-subtle">{blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      </PageShell>
    </>
  );
}
