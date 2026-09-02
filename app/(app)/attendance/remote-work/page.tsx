import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { loadRemoteWorkPage } from "./actions";
import { RemoteWorkWorkspace } from "@/components/attendance/remote-work-workspace";

export const dynamic = "force-dynamic";

/**
 * Remote work — request a day away from the office, and (for Rutvisha and
 * Manan) decide everyone else's.
 *
 * The page is a thin shell: `loadRemoteWorkPage` decides what this viewer is
 * allowed to see, including whether the pending queue is fetched AT ALL. That
 * matters more than hiding it — returning every pending request and letting the
 * component filter would ship the whole queue to every browser.
 */
export default async function RemoteWorkPage() {
  const data = await loadRemoteWorkPage();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title="Remote Work"
          hint={
            data.canApprove
              ? "Request WFH, Client Site or On Field — and approve the team's."
              : "Request WFH, Client Site or On Field. Rutvisha, Manan or Om approves it before the day counts."
          }
        />
        <RemoteWorkWorkspace data={data} />
      </main>
    </>
  );
}
