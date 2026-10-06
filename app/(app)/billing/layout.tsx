import type { ReactNode } from "react";

/** Shared visual tokens for every Billing screen and its data tables. */
export default function BillingLayout({ children }: { children: ReactNode }) {
  return <div className="billing-module">{children}</div>;
}
