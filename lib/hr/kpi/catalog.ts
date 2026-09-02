/**
 * KPI CATALOG — the pickable KPI options the KPI Management form offers, derived
 * from the appraisal KPI dictionary (lib/performance/kpi-dictionary.ts) as the
 * single source of truth. PURE + CLIENT-SAFE (the dictionary is pure), so the
 * management UI imports it directly.
 *
 * The dictionary is per-person; each line becomes one catalog entry carrying
 * sensible prefill defaults (frequency from the line period, weightage from the
 * intra-KPI weight, target from the line target). HR can pick any entry OR fall
 * back to a fully manual KPI (kpiKey = null).
 */
import {
  KPI_DICTIONARY,
  kpiKeyForName,
  KPI_BY_KEY,
} from "@/lib/performance/kpi-dictionary";
import type { KpiFrequency } from "@/db/enums";

export interface KpiCatalogEntry {
  /** Stable dictionary line id → stored as kpi_assignments.kpi_key. */
  key: string;
  /** The KPI text (the line label). */
  name: string;
  /** The owning person's name — used as the default category grouping. */
  owner: string;
  /** Prefill: frequency mapped from the dictionary line period. */
  frequency: KpiFrequency;
  /** Prefill: the intra-KPI weight (0..100). */
  weightage: number;
  /** Prefill: the line target, as text (unit appended when present). */
  target: string;
  /** Optional unit label. */
  unit?: string;
}

function periodToFrequency(period: "week" | "month"): KpiFrequency {
  return period === "week" ? "weekly" : "monthly";
}

function lineToEntry(owner: string, line: (typeof KPI_DICTIONARY)[number]["lines"][number]): KpiCatalogEntry {
  return {
    key: line.id,
    name: line.label,
    owner,
    frequency: periodToFrequency(line.period),
    weightage: line.intraWeight,
    target: line.unit ? `${line.target} ${line.unit}` : `${line.target}`,
    unit: line.unit,
  };
}

/** Every KPI line across every person, flattened — the full catalog. */
export const KPI_CATALOG: KpiCatalogEntry[] = KPI_DICTIONARY.flatMap((t) =>
  t.lines.map((l) => lineToEntry(t.name, l)),
);

/** Fast lookup by dictionary line key. */
export const KPI_CATALOG_BY_KEY: Record<string, KpiCatalogEntry> = Object.fromEntries(
  KPI_CATALOG.map((e) => [e.key, e]),
);

/**
 * The KPI lines suggested for a given employee — their own dictionary entry's
 * lines when their name resolves to one, else an empty list. The form shows
 * these first ("Suggested for {name}"), then the full catalog.
 */
export function suggestedKpisForName(name: string | null | undefined): KpiCatalogEntry[] {
  const key = kpiKeyForName(name);
  if (!key) return [];
  const target = KPI_BY_KEY[key];
  if (!target) return [];
  return target.lines.map((l) => lineToEntry(target.name, l));
}
