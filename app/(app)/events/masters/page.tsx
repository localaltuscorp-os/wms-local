import { Palette } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { loadEventMasters } from "@/lib/queries/event-masters";
import { MastersWorkbench } from "@/components/events/masters/masters-workbench";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function MastersPage() {
  // Admin-only surface — re-assert in the page (layout gates unreliable on prod).
  await requireEventsAdmin();

  // Shared with Operations → Masters → Event Masters (lib/queries/event-masters.ts).
  const { categories, batchTypes } = await loadEventMasters();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <header className="mt-3 mb-7 flex items-start gap-3 wg-rise">
          <span
            className="mt-1 inline-flex size-11 items-center justify-center rounded-xl"
            style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
          >
            <Palette size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: ACCENT_DEEP }}
            >
              Monthly Events Master
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px, 3.2vw, 42px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                marginTop: 6,
              }}
            >
              Category &amp; Batch Masters
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "70ch" }}>
              The colour legend behind every event. Add, rename, recolour and drag
              to reorder categories, and manage the batch/section types that
              auto-block the calendar from schedules.
            </p>
          </div>
        </header>

        <MastersWorkbench categories={categories} batchTypes={batchTypes} />
      </main>
    </>
  );
}
