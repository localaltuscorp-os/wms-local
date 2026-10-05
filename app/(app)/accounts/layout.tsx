import { requireAccountsAccess } from "@/lib/accounts/access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";

/**
 * Accounts module gate. Restricts the ENTIRE module to admins/managers
 * (redirects everyone else to /hub). Each page renders its own
 * DashboardHeader/Footer, so this layout just passes children through.
 */
export default async function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A disposable dummy workspace is used to test the approval-to-payment
  // handoff. The normal Accounts department gate remains mandatory everywhere
  // outside local dummy mode.
  if (!DUMMY_MODE) await requireAccountsAccess();
  return <div className="accounts-inbox-module">{children}</div>;
}
