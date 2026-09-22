import Link from "next/link";
import { CalendarDays, Palette } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { eventsAccess } from "@/lib/monthly-events/access";
import { monthlyEventsEnabled } from "@/lib/monthly-events/flag";
import { loadEventMasters } from "@/lib/queries/event-masters";
import { PageShell } from "@/components/layout/page-shell";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { MastersWorkbench } from "@/components/events/masters/masters-workbench";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → Event Masters.
 *
 * The same categories and batch types as /events/masters, read by the same
 * loader. Events admins edit them here with the same workbench; everyone else
 * in the room sees them read-only instead of being bounced away.
 */
export default async function EventMastersPage() {
  await requireWorkspace("operations");
  const enabled = monthlyEventsEnabled();
  const [access, data] = await Promise.all([
    eventsAccess().catch(() => null),
    enabled ? loadEventMasters() : Promise.resolve(null),
  ]);
  const canEdit = access?.isAdmin ?? false;
  const categoryName = new Map((data?.categories ?? []).map((c) => [c.id, c.name]));
  const activeCategories = (data?.categories ?? []).filter((c) => c.isActive);
  const activeBatchTypes = (data?.batchTypes ?? []).filter((b) => b.isActive);

  return (
    <PageShell>
      <MastersHeader
        Icon={Palette}
        topic="Events"
        title="Event Masters"
        description="Event categories — the colour legend behind every event — and the batch types that block the calendar from schedules."
        actions={
          enabled ? (
            <Link
              href="/events/calendar"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4" /> Events calendar
            </Link>
          ) : undefined
        }
      />

      {!data ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">
          The Monthly Events Master is switched off, so there are no event masters to show.
        </p>
      ) : canEdit ? (
        <MastersWorkbench categories={data.categories} batchTypes={data.batchTypes} />
      ) : (
        <>
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
            View only — an admin adds and changes event masters.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-[13.5px] font-bold text-slate-900">
                Categories <span className="text-[12px] font-semibold text-slate-400">{activeCategories.length}</span>
              </h2>
              <ul className="divide-y divide-slate-100">
                {activeCategories.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 font-medium text-slate-800">{c.name}</span>
                    <span className="text-[12px] tabular-nums text-slate-500">{c.usage} in use</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-[13.5px] font-bold text-slate-900">
                Batch types <span className="text-[12px] font-semibold text-slate-400">{activeBatchTypes.length}</span>
              </h2>
              <ul className="divide-y divide-slate-100">
                {activeBatchTypes.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="flex-1 font-medium text-slate-800">{b.name}</span>
                    <span className="text-[12px] text-slate-500">
                      {b.defaultCategoryId ? (categoryName.get(b.defaultCategoryId) ?? "—") : "No default category"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </PageShell>
  );
}
