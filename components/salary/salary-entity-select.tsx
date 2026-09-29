"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MultiFilter } from "@/components/ui/multi-filter";

export const ALL_ENTITIES = "__all";

/**
 * Entity (company) filter — the third dropdown in the salary header, sitting
 * with the year, month and the export buttons.
 *
 * It used to be a `useState` selector inside the workspace, below the header and
 * above a KPI strip that has since gone. Lifting it into the header put it where
 * the other two period controls already are, and moving it to the URL is what
 * makes that possible: the header is a server component, so a client-held filter
 * could not have scoped what the server renders.
 *
 * Pushing `?entity=` also means the scope survives a reload, is shareable, and
 * composes with `?month=` — "September payroll for Khushboo" is now one link.
 * Nothing is held in local state that the URL does not already carry, matching
 * SalaryPeriodSelect exactly.
 */
export function SalaryEntitySelect({
  entities,
  selected,
  month,
}: {
  /** Distinct entity names present in the month's sheet, already sorted. */
  entities: string[];
  /** The entities currently in scope; an empty selection means all entities. */
  selected: string[];
  /** Kept on the URL so changing entity never silently jumps the month. */
  month?: string;
}) {
  const router = useRouter();

  // One entity means nothing to choose between — the control would be a
  // permanently-disabled dropdown restating the only value on screen.
  if (entities.length < 2) return null;

  function go(next: string[]) {
    const clean = next.filter((entity) => entities.includes(entity));
    if (clean.length === selected.length && clean.every((entity) => selected.includes(entity))) return;
    const qs = new URLSearchParams();
    if (month) qs.set("month", month);
    for (const entity of clean) qs.append("entity", entity);
    // Cast because the query is assembled conditionally, so the literal type is
    // `/salary${string}` rather than one of typed-routes' known shapes.
    router.push((qs.toString() ? `/salary?${qs}` : "/salary") as Route);
  }

  return (
    <MultiFilter
      values={selected}
      onChange={go}
      aria-label="Filter payroll by entity"
      className={FIELD}
      allLabel="All entities"
      options={entities}
    />
  );
}

/** The header's compact trigger language — same string the period selects use,
 *  so the three controls read as one set rather than three borrowed widgets. */
const FIELD = [
  "h-9 w-[210px] cursor-pointer rounded-lg border border-hairline-strong bg-surface-card px-3",
  "text-[13px] font-bold text-ink-strong transition-colors",
  "hover:border-[color-mix(in_srgb,var(--color-altus-red)_35%,var(--color-hairline-strong))]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40",
].join(" ");
