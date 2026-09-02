import Link from "next/link";
import type { Route } from "next";
import { Wallet, CalendarCheck2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { ACCOUNTS_SECTIONS } from "@/lib/accounts/sections";
import { AccountsIndex } from "@/components/accounts/accounts-index";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireAccountsAccess } from "@/lib/accounts/access";

export const dynamic = "force-dynamic";

// Admin / Accounts module identity — indigo (meeting 2026-06-29: a colour per
// module so you always know where you are). The full bespoke indigo chrome
// rolls across the sub-pages next; this establishes the accent on the front door.
const ACCENT = "#A80400";

export default async function AccountsIndexPage() {
  // Guard IN THE PAGE — super-admins or the Accounts department only. The (app)
  // layout gate alone isn't reliable on prod (a Next.js layout-redirect quirk),
  // so every accounts surface must assert access itself.
  await requireAccountsAccess();
  const sections = [...ACCOUNTS_SECTIONS].sort((a, b) => a.order - b.order);
  const built = sections.filter((s) => s.status === "built").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        {/* The two cross-module links used to sit under a 46px title and a
            two-line paragraph. They are the only ACTIONS here, so they belong in
            the bar's action slot; the paragraph shrinks to the live-count hint,
            which is the only part of it that told you anything. */}
        <PageCommandBar
          title="Accounts"
          hint={`${built} of ${sections.length} sections live — checklists, trackers and master registers.`}
          actions={
            <>
              <Link
                href={"/salary" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${"#E10600"}, ${ACCENT})` }}
              >
                <Wallet size={14} strokeWidth={2.4} /> Salary
              </Link>
              <Link
                href={"/attendance/dashboard" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <CalendarCheck2 size={14} strokeWidth={2.4} /> Attendance
              </Link>
            </>
          }
        />

        <AccountsIndex sections={sections} />
      </main>
    </>
  );
}
