import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { listAmbassadors, listAmbassadorCalls } from "@/lib/queries/people-allocation";
import { AmbassadorsScreen } from "@/components/people-allocation/ambassadors-screen";

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
      {/* The "Hand-holding · Ambassadors" hero band was removed (2026-09-21), for the
          same reason it went from the Hand-holding page on 2026-09-18: the top
          bar already names the room, and the band pushed the content below the
          fold for no new information. */}
      <AmbassadorsScreen rows={rows} calls={calls} />
    </PageShell>
  );
}
