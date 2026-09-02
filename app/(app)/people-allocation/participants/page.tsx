import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { formatHoursMinutes } from "@/lib/format";
import { listAllParticipants, listHhCalls } from "@/lib/queries/people-allocation";
import { canDeleteParticipant, canEditParticipant } from "@/lib/hh/access";
import { withRetry } from "@/lib/db/with-timeout";
import { ParticipantsTable } from "@/components/people-allocation/participants-table";
import { HidePageScrollbar } from "@/components/people-allocation/hide-page-scrollbar";
import { AllocationHero } from "../hero";

/**
 * HAND-HOLDING › ALL PARTICIPANTS — every participant in the module in one
 * list, PS and BSS included, rather than split across each person's sections.
 *
 * Counts EXCLUDE nothing except where the card says so: "Active" is the
 * not-on-hold subset, and Total Hours follows the same rule the dashboard uses
 * — a participant on hold takes no weekly hours.
 */
export const dynamic = "force-dynamic";

const ORANGE = "#ea580c";

export default async function AllParticipantsPage() {
  const me = await requireUser();

  // Same timeout/retry budget as the room's other pages: a bounced pooled
  // connection must fail fast rather than hang the page on its skeleton.
  // Not `as const`: withRetry takes a mutable number[], and a readonly tuple
  // is not assignable to it.
  const budget: { timeoutMs: number[]; attempts: number } = { timeoutMs: [6000, 12000], attempts: 2 };
  const [participants, calls] = await Promise.all([
    withRetry(() => listAllParticipants(), { ...budget, label: "hh.participants" }),
    withRetry(() => listHhCalls(), { ...budget, label: "hh.calls" }),
  ]);

  const live = participants.filter((p) => !p.onHold);
  const liveIds = new Set(live.map((p) => p.id));
  const minutes = calls.filter((c) => liveIds.has(c.entryId)).reduce((sum, c) => sum + (c.durationMin ?? 0), 0);

  const cards = [
    { label: "Total Participants", value: participants.length },
    { label: "Total Interns", value: participants.filter((p) => p.ownerKind === "intern").length },
    { label: "Total Employees", value: participants.filter((p) => p.ownerKind !== "intern").length },
    { label: "Active Participants", value: live.length, accent: true },
    // HH:MM across the dashboard, matching the Hand-holding band.
    { label: "Total Hours", value: formatHoursMinutes(minutes) },
    // Distinct products actually assigned — an unset one is not a product.
    { label: "Total Product", value: new Set(participants.map((p) => p.section).filter(Boolean)).size },
  ];

  return (
    <PageShell width="wide">
      {/* No scrollbar on this page — it scrolls by touchpad, wheel and keys. */}
      <HidePageScrollbar />
      <AllocationHero title="All Participants" blurb="Every participant across the module, PS and BSS included." />

      <section
        className="mb-5 grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2"
        aria-label="Participant totals"
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-surface-card px-4 py-3.5"
            style={
              c.accent
                ? {
                    background: `color-mix(in srgb, ${ORANGE} 8%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 28%, transparent)`,
                  }
                : { boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
            }
          >
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{c.label}</div>
            <div
              className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight"
              style={{ color: c.accent ? "#c2410c" : "var(--color-ink-strong)" }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </section>

      <ParticipantsTable
        participants={participants}
        canEdit={canEditParticipant(me)}
        canDelete={canDeleteParticipant(me)}
      />
    </PageShell>
  );
}
