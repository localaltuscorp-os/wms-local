import type { ReactNode } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminMobileBar } from "./admin-mobile-bar";

type Props = {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
  /** Super-admins also get the "Accounts" section pill in the admin header. */
  canSeeAccounts: boolean;
};

/**
 * Admin panel shell. The nav lives in a LEFT SIDEBAR (`AdminSidebar`, desktop) —
 * matching the vertical rail every other module uses — with the phone layout
 * handled by the sticky `AdminMobileBar` + drawer. The soft body gradients from
 * globals.css show through the main column.
 */
export async function AdminShell({
  children,
  adminName,
  adminEmail,
  avatarUrl,
  canSeeAccounts,
}: Props) {
  // Consistent with every other module: the Hub (the workspace switchboard)
  // is where the brand mark leads. On desktop the sidebar LOGO is that link;
  // on phones AdminMobileBar still renders it as its own labelled button.
  const backHref = "/hub";

  return (
    <div className="min-h-screen">
      {/* Phone-only top bar + drawer (unchanged) */}
      <AdminMobileBar adminName={adminName} adminEmail={adminEmail} backHref={backHref} canSeeAccounts={canSeeAccounts} />
      {/* Desktop: left rail + main column */}
      <div className="flex min-h-screen">
        <AdminSidebar adminName={adminName} adminEmail={adminEmail} avatarUrl={avatarUrl} backHref={backHref} />
        {/* Matches COMMAND_PAGE_CLASS's rhythm (pt-6 pb-8) so the admin room
            sits at the same vertical scale as every other module now that it
            shares their header. */}
        <main className="min-w-0 flex-1 px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
