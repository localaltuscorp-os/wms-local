"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

interface DocumentYearPickerProps {
  years: number[];
  activeYear: number;
  currentYear: number;
}

/** Keeps the document-list filters while changing its calendar year. */
export function DocumentYearPicker({ years, activeYear, currentYear }: DocumentYearPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectYear(value: string) {
    const selectedYear = Number(value);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    if (selectedYear === currentYear) next.delete("year");
    else next.set("year", String(selectedYear));

    const query = next.toString();
    router.push(`/billing/documents${query ? `?${query}` : ""}` as Route);
  }

  return (
    <Select
      ariaLabel="Document year"
      options={years.map((year) => ({ value: String(year), label: String(year) }))}
      value={String(activeYear)}
      onValueChange={selectYear}
      searchable={false}
      unstyled
      className="gdd-trigger flex h-8 w-20 items-center gap-1 rounded-chip px-2.5 text-[12px] font-bold text-ink-strong"
    />
  );
}
