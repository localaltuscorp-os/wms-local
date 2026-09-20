"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Search, Users, X } from "lucide-react";
import {
  ARCHIVE_SCOPE_LABEL,
  archiveQuery,
  type ArchiveScope,
} from "@/lib/archive/sections";
import type { ArchivePerson } from "@/lib/queries/archive";

/**
 * WHOSE records to show, within the chosen half — with a search box, because a
 * company that has been running for years has a roster this row cannot hold
 * (Sir, 2026-09: "give search bar to search employees and so on").
 *
 * Everything is still a LINK: typing narrows which chips are on screen, and
 * clicking one navigates. The filter is deliberately not in the URL — it is a
 * way of finding the chip you want, not a view worth sharing — so a shared
 * `/archive/tasks?emp=…` link still opens on exactly one person's records.
 *
 * The search matches name, email and department, so "finance" or a surname
 * both work.
 */
const CHIP_ACTIVE: React.CSSProperties = {
  borderColor: "var(--color-altus-red)",
  background: "color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card))",
  color: "var(--color-altus-red-deep, #A80400)",
  fontWeight: 700,
};

/** Only worth a search box once the row would otherwise wrap and wrap. */
const SEARCH_FROM = 8;

export function ArchivePeopleFilter({
  people,
  scope,
  employeeId,
  basePath,
}: {
  people: ArchivePerson[];
  scope: ArchiveScope;
  employeeId?: string;
  basePath: string;
}) {
  const [q, setQ] = React.useState("");
  if (people.length === 0) return null;

  const needle = q.trim().toLowerCase();
  const shown =
    needle === ""
      ? people
      : people.filter((p) =>
          [p.name, p.email, p.department ?? ""].some((f) => f.toLowerCase().includes(needle)),
        );

  const href = (id?: string): Route =>
    `${basePath}${archiveQuery({ scope, employeeId: id })}` as Route;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-soft">
        <Users size={13} strokeWidth={2.4} />
        {ARCHIVE_SCOPE_LABEL[scope]}
      </span>

      {people.length >= SEARCH_FROM && (
        <label className="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-2.5 py-1.5">
          <Search size={13} strokeWidth={2.2} className="text-ink-soft" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees…"
            aria-label="Search employees"
            className="w-[22ch] bg-transparent text-[12.5px] text-ink-strong outline-none placeholder:text-ink-subtle"
          />
          {q !== "" && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear the employee search"
              className="text-ink-soft hover:text-ink-strong"
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          )}
        </label>
      )}

      <Link
        href={href()}
        className="filter-chip text-[12.5px]"
        style={!employeeId ? CHIP_ACTIVE : undefined}
        aria-current={!employeeId ? "page" : undefined}
      >
        Everyone
      </Link>

      {shown.map((p) => {
        const active = p.id === employeeId;
        return (
          <Link
            key={p.id}
            href={href(p.id)}
            className="filter-chip text-[12.5px]"
            style={active ? CHIP_ACTIVE : undefined}
            aria-current={active ? "page" : undefined}
            title={[p.email, p.department, p.lastWorkingDay && `Last day ${p.lastWorkingDay}`]
              .filter(Boolean)
              .join(" · ")}
          >
            {p.name}
          </Link>
        );
      })}

      {shown.length === 0 && (
        <span className="text-[12.5px] font-medium text-ink-soft">
          No employee here matches “{q.trim()}”.
        </span>
      )}
    </div>
  );
}
