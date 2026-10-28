"use client";

import type { ReactNode } from "react";
import * as React from "react";
import { useState } from "react";

type WorkspaceTab = "employees" | "hierarchy";

export function EmployeeMasterWorkspaceTabs({
  employeeMaster,
  reportingHierarchy,
}: {
  employeeMaster: ReactNode;
  reportingHierarchy: ReactNode;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("employees");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "hierarchy" || window.location.hash === "#hierarchy") {
      setTab("hierarchy");
    }
  }, []);

  const onSelectTab = (next: WorkspaceTab) => {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "hierarchy") {
        url.searchParams.set("tab", "hierarchy");
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState(null, "", url.toString());
    }
  };

  return (
    <>
      <div role="tablist" aria-label="Employee Master workspace" className="mb-4 inline-flex rounded-lg border border-hairline bg-surface-soft p-0.5">
        {([
          ["employees", "Employee Master"],
          ["hierarchy", "Reporting Hierarchy"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onSelectTab(value)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${tab === value ? "bg-surface-card text-ink-strong shadow-sm" : "text-ink-muted hover:text-ink-strong"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "employees" ? employeeMaster : reportingHierarchy}
    </>
  );
}
