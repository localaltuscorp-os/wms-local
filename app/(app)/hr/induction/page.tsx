import { requireHrStaff } from "@/lib/hr/access";
import { listInductionEmployees, type InductionPerson } from "@/app/(app)/hr/induction/actions";
import { InductionScreen } from "@/components/hr/induction/induction-screen";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Post-joining INDUCTION — a full-screen focused surface. Pick a new joiner and
 * their submitted onboarding form is rendered as a read-only, section-grouped
 * summary to confirm on day one (no re-asking). Reached from the Post-Joining
 * stage's "Induction" item.
 */
export default async function HrInductionPage() {
  await requireHrStaff();

  let people: InductionPerson[] = [];
  try {
    people = await Promise.race([
      listInductionEmployees(),
      new Promise<InductionPerson[]>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    people = [];
  }

  return (
    <div className="min-h-full" style={{ background: "#faf9fb" }}>
      <HrTitleBar

      />

      <InductionScreen people={people} />
    </div>
  );
}
