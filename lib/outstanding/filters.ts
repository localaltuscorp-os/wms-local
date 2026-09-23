export interface OutstandingFilters {
  employees: string[];
  entities: string[];
  /**
   * Client names. THE JOIN TO BILLING: a customer's record links here with its
   * own name, so "what does this customer still owe us" is one click from the
   * customer rather than a scroll through every receivable.
   *
   * Matched on the name because that is what `outstanding_entries.client` holds
   * — free text, with no foreign key to `billing_customers`. Comparing trimmed
   * and case-insensitively is what makes "Acme Pvt Ltd" and "acme pvt ltd  "
   * the same client; anything stronger needs the column this table does not
   * have yet.
   */
  clients: string[];
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
  clientName?: string | null;
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
    clients: split(get("client")),
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

  /* Client names come from a free-text column and arrive in a URL, so they are
     compared the way people actually type them rather than byte for byte. */
  const norm = (v: string) => v.trim().toLowerCase();
  const clientSet = new Set(f.clients.map(norm));
  const matchesClient = (value: string | null | undefined): boolean =>
    clientSet.size === 0 || (value != null && clientSet.has(norm(value)));

  return rows.filter(
    (r) =>
      matches(f.employees, r.responsibleName) &&
      matches(f.entities, r.entityName) &&
      matchesClient(r.clientName) &&
      // Month-of-year (01..12), independent of year.
      matches(f.months, r.dueDate.slice(5, 7)) &&
      matches(f.years, r.dueDate.slice(0, 4)) &&
      matches(f.cycles, r.cycle) &&
      matches(f.modes, r.expectedModeName) &&
      matches(f.statuses, r.state) &&
      (!f.pdcOnly || r.pdcReceived === false),
  );
}
