"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const RED = "var(--color-altus-red)";

interface PillDef {
  key: string;
  label: string;
  count?: number;
}

function PillRow({
  param,
  pills,
  fallback,
}: {
  param: string;
  pills: PillDef[];
  fallback: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get(param) ?? fallback;

  function set(value: string) {
    const next = new URLSearchParams(search.toString());
    if (value === fallback) next.delete(param);
    else next.set(param, value);
    router.push(`${pathname}?${next.toString()}` as never);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => {
        const active = current === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => set(p.key)}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-semibold transition"
            style={{
              background: active ? RED : "var(--color-surface-card, #fff)",
              color: active ? "#fff" : "var(--color-ink-muted, #6b7280)",
              border: `1px solid ${active ? RED : "var(--color-hairline, #e5e7eb)"}`,
            }}
          >
            {p.label}
            {typeof p.count === "number" && (
              <span
                className="rounded-full px-1.5 text-[11px] font-bold"
                style={{ background: active ? "#ffffff33" : "var(--color-surface-subtle, #f1f1f2)" }}
              >
                {p.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function QueueFilters({
  counts,
}: {
  counts: { open: number; mine: number; unassigned: number; breaching: number };
}) {
  return (
    <div className="space-y-2.5">
      <PillRow
        param="status"
        fallback="open"
        pills={[
          { key: "open", label: "Open", count: counts.open },
          { key: "waiting_on_employee", label: "Waiting on Employee" },
          { key: "resolved", label: "Resolved" },
          { key: "all", label: "All" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <PillRow
          param="assignee"
          fallback="all"
          pills={[
            { key: "all", label: "Everyone" },
            { key: "me", label: "Mine", count: counts.mine },
            { key: "unassigned", label: "Unassigned", count: counts.unassigned },
          ]}
        />
        <PillRow
          param="source"
          fallback="all"
          pills={[
            { key: "all", label: "All Sources" },
            { key: "support", label: "Tickets" },
            { key: "query", label: "Ask HR" },
          ]}
        />
      </div>
    </div>
  );
}
