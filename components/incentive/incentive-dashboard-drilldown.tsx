"use client";

import * as React from "react";
import { IncentivePersonDrilldown } from "./incentive-person-drilldown";

/**
 * Client island that makes the (server-rendered) Dashboard person rows
 * clickable. The dashboard renders plain text names with a
 * `data-incentive-person="<name>"` attribute; this wrapper delegates clicks on
 * those elements to open the read-only drill-down dialog.
 */
export function IncentiveDashboardDrilldown({
  year,
  children,
}: {
  year: number;
  children: React.ReactNode;
}) {
  const [name, setName] = React.useState<string | null>(null);

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-incentive-person]");
    if (!el) return;
    const person = el.getAttribute("data-incentive-person");
    if (person) setName(person);
  }

  return (
    <div onClick={onClick}>
      {children}
      <IncentivePersonDrilldown empName={name} year={year} onClose={() => setName(null)} />
    </div>
  );
}
