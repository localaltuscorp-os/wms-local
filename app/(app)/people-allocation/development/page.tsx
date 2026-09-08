import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { AllocationHero } from "../hero";

/**
 * HANDHOLDING › DEVELOPMENT — its own rail entry and route.
 *
 * Deliberately empty for now: the section exists so the navigation is in place,
 * and its content lands once the requirements for it are defined. Nothing is
 * invented here in the meantime.
 */
export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  await requireUser();

  return (
    <PageShell width="wide">
      <AllocationHero title="Development" blurb="Kept separate from allocation and ambassadors." />
      <section
        className="rounded-[22px] bg-surface-card p-14 text-center"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        aria-label="Development"
      >
        <p className="text-[15px] font-bold text-ink-strong">Development</p>
        <p className="mt-1 text-[13.5px] text-ink-subtle">
          This section is ready for its content - tell me what belongs here and I will build it.
        </p>
      </section>
    </PageShell>
  );
}
