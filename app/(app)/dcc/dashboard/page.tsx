import { ClipboardCheck } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope } from "@/lib/dcc/access";
import { listDccPeople, listItemsForOwners, listEntriesForOwners, listReviewsForOwners } from "@/lib/queries/dcc";
import { isoDate } from "@/lib/dcc/util";
import { DccDashboard } from "@/components/dcc/dcc-dashboard";

export const dynamic = "force-dynamic";

export default async function DccDashboardPage() {
  const me = await requireUser();
  const scope = await loadDccScope(me);
  if (!scope.isManager) {
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main className="mx-auto w-full max-w-[1400px] px-8 max-md:px-4 pt-10 pb-20">
          <p className="rounded-2xl bg-surface-card px-6 py-10 text-center text-[15px] font-bold text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
            The DCC dashboard is for managers and admins.
          </p>
        </main>
      </>
    );
  }

  const ids = [...scope.visibleIds];
  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 27); // 4-week window
  const fromISO = isoDate(from);

  const [people, items, entries, reviews] = await Promise.all([
    listDccPeople(ids),
    listItemsForOwners(ids),
    listEntriesForOwners(ids, fromISO),
    listReviewsForOwners(ids, fromISO),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Page header ── */}
        <header className="wg-rise mb-6">
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
            >
              <ClipboardCheck size={13} strokeWidth={2.6} /> Employees · DCC
            </span>
          </div>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px,3.6vw,46px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {scope.isSuper ? "Compliance Dashboard" : "My Team's Compliance"}
          </h1>
          <p className="mt-1.5 text-[15.5px] font-medium text-ink-muted">
            {people.length} {people.length === 1 ? "person" : "people"} · today {fmt(today)}
          </p>
        </header>

        <DccDashboard meId={me.id} people={people} items={items} entries={entries} reviews={reviews} today={today} />
      </main>
    </>
  );
}

function fmt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
