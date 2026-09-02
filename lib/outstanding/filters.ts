export interface OutstandingFilters {
  employees: string[];
  entities: string[];
  /** Month-of-year codes "01".."12" (matched against dueDate month, any year). */
  months: string[];
  years: string[];
  cycles: string[];
  modes: string[];
  statuses: string[];
  /** When true, keep only rows whose PDC has NOT been received. */
  pdcOnly: boolean;
}

/** A row that can be filtered. Denormalized contract fields are optional;
 *  dueDate (YYYY-MM-DD) and the derived state are always present. */
export interface FilterRow {
  responsibleName?: string | null;
  entityName?: string | null;
  cycle?: string;
  expectedModeName?: string | null;
  dueDate: string;
  state: string;
  pdcReceived?: boolean;
}

const split = (v: unknown): string[] =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

export function parseOutstandingFilters(
  sp: Record<string, string | string[] | undefined>,
): OutstandingFilters {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    employees: split(get("emp")),
    entities: split(get("entity")),
    months: split(get("month")),
    years: split(get("year")),
    cycles: split(get("cycle")),
    modes: split(get("mode")),
    statuses: split(get("status")),
    pdcOnly: get("pdc") === "1",
  };
}

export function applyOutstandingFilters<T extends FilterRow>(
  rows: T[],
  f: OutstandingFilters,
): T[] {
  const matches = (filter: string[], value: string | null | undefined): boolean =>
    filter.length === 0 || (value != null && filter.includes(value));

  return rows.filter(
    (r) =>
      matches(f.employees, r.responsibleName) &&
      matches(f.entities, r.entityName) &&
      // Month-of-year (01..12), independent of year.
      matches(f.months, r.dueDate.slice(5, 7)) &&
      matches(f.years, r.dueDate.slice(0, 4)) &&
      matches(f.cycles, r.cycle) &&
      matches(f.modes, r.expectedModeName) &&
      matches(f.statuses, r.state) &&
      (!f.pdcOnly || r.pdcReceived === false),
  );
}
