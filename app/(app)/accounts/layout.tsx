import { requireAccountsAccess } from "@/lib/accounts/access";

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
  await requireAccountsAccess();
  return <>{children}</>;
}
