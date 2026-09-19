"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Segmented } from "@/components/incentive/ui/chrome";
import type { AnalyticsView } from "@/lib/incentive/analytics/model";

const OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

/**
 * The Accounts twin of the dashboard's Team / User switch — the same
 * `Segmented` control, so one idea never gets two geometries.
 *
 * It writes `?view=` and lets the SERVER decide what that means. Nothing here
 * narrows or widens a result set: the page re-resolves the scope from the signed
 * in identity on every render and filters in SQL, so a hand-typed `?view=team`
 * buys exactly what an absent parameter would have.
 */
export function AccountsScopeSwitch({ view }: { view: AnalyticsView }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <Segmented
      ariaLabel="Whose incentive payments"
      options={OPTIONS}
      value={view}
      disabled={pending}
      onChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("view", next);
        startTransition(() => router.push(`/accounts/incentive-payments?${params.toString()}`));
      }}
    />
  );
}
