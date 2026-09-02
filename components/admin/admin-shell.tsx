import type { ReactNode } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminMobileBar } from "./admin-mobile-bar";

type Props = {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
};

/**
 * Editorial two-column shell for the admin panel.  Dark sidebar (`.header-dark`
 * scope) on the left, soft canvas on the right.  The body-level radial
 * gradients defined in `globals.css :root body` show through the main column.
 *
 * On mobile (max-md) the sidebar hides and `AdminMobileBar` renders a sticky
 * top bar with a hamburger that opens the same nav in a slide-in drawer.
 */
export function AdminShell({
  children,
  adminName,
  adminEmail,
  avatarUrl,
}: Props) {
  return (
    <div className="min-h-screen flex max-md:block">
      <AdminSidebar
        adminName={adminName}
        adminEmail={adminEmail}
        avatarUrl={avatarUrl}
      />
      <div className="flex-1 min-w-0 max-md:flex max-md:flex-col">
        <AdminMobileBar adminName={adminName} adminEmail={adminEmail} />
        <main className="flex-1 min-w-0 px-10 py-10 max-md:px-4 max-md:py-6">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
