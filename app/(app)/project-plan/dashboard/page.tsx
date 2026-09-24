import Link from "next/link";
import { LayoutDashboard, FolderTree } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";

/** Project Dashboard is intentionally a clean landing page. The former
 * dashboard tree lives at Project Views, so the two navigation sections no
 * longer overlap. */
export default function ProjectDashboardPage() {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto flex w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <section className="w-full rounded-section border border-hairline bg-surface-card px-6 py-10 text-center">
          <LayoutDashboard className="mx-auto mb-3 size-8 text-altus-red" aria-hidden />
          <h1 className="text-[24px] font-black text-ink-strong">Project Dashboard</h1>
          <p className="mx-auto mt-2 max-w-lg text-[14px] text-ink-muted">
            The full project hierarchy is available in Project Views.
          </p>
          <Link
            href="/project-plan/views"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-altus-red px-4 py-2 text-[13px] font-bold text-white"
          >
            <FolderTree size={15} /> Open Project Views
          </Link>
        </section>
      </main>
    </>
  );
}
