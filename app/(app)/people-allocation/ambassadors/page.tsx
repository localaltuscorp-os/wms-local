import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { listAmbassadors, listAmbassadorCalls } from "@/lib/queries/people-allocation";
import { AmbassadorsScreen } from "@/components/people-allocation/ambassadors-screen";
import { AllocationHero } from "../hero";

/**
 * PEOPLE ALLOCATION › AMBASSADORS — its own rail entry and its own route.
 * Deliberately holds no link to clients or the four allocation categories.
 */
export const dynamic = "force-dynamic";

export default async function AmbassadorsPage() {
  await requireUser();
  const [rows, calls] = await Promise.all([listAmbassadors(), listAmbassadorCalls()]);

  return (
    <PageShell width="wide">
      <AllocationHero title="Ambassadors" blurb="Kept separate from the client allocation categories." />
      <AmbassadorsScreen rows={rows} calls={calls} />
    </PageShell>
  );
}
