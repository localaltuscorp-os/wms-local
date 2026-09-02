/**
 * CTC / COMPENSATION MODEL — the structured Cost-to-Company engine.
 *
 * A CTC breakup is a set of NAMED money components grouped into three families:
 *   · earning   — what the employee earns (Basic, HRA, allowances, LTA, bonus…)
 *   · deduction — what is withheld from the employee (PF, ESI, PT, TDS…)
 *   · employer  — what the company pays ON TOP (employer PF/ESI, gratuity…)
 *
 * Each component is entered in its NATIVE periodicity (monthly for salary lines,
 * annual for LTA / bonus / gratuity) and the other column is derived (×12 / ÷12).
 * From the components we compute the whole ladder: Gross → Net take-home → total
 * Cost to Company. A CTC is versioned per employee (a "Growth Journey"): each save
 * is a version carrying its own components, effective date and reason.
 *
 * PURE + CLIENT-SAFE — no DB, no server-only imports. The workbench (client), the
 * save action (server) and any letter that quotes the numbers all import this, so
 * it must never reach for a server dependency. Load-neutral.
 */

import type { EntityId } from "@/lib/hr/entities";

/* ------------------------------------------------------------------ */
/* Component catalogue                                                  */
/* ------------------------------------------------------------------ */

export type CtcGroup = "earning" | "deduction" | "employer";
export type Periodicity = "monthly" | "annual";

export interface CtcComponentDef {
  /** Stable id — the key its amount is stored under in `components`. */
  id: string;
  /** Human label shown on the row + in letters. */
  label: string;
  /** Which family it belongs to (drives grouping + the totals ladder). */
  group: CtcGroup;
  /** The period the amount is ENTERED in; the other column is derived. */
  periodicity: Periodicity;
  /** Optional one-line hint for the row. */
  hint?: string;
}

/**
 * The canonical CTC line items, in presentation order within each group. A CTC
 * rarely uses every line — zero-value rows are HIDDEN by default in the workbench
 * (a "show all" toggle reveals them). Add a line here and it appears everywhere.
 */
export const CTC_COMPONENTS: CtcComponentDef[] = [
  // ── Earnings ──────────────────────────────────────────────
  { id: "basic", label: "Basic Salary", group: "earning", periodicity: "monthly" },
  { id: "hra", label: "House Rent Allowance (HRA)", group: "earning", periodicity: "monthly" },
  { id: "conveyance", label: "Conveyance Allowance", group: "earning", periodicity: "monthly" },
  { id: "medical", label: "Medical Allowance", group: "earning", periodicity: "monthly" },
  { id: "education", label: "Children Education Allowance", group: "earning", periodicity: "monthly" },
  { id: "special", label: "Special Allowance", group: "earning", periodicity: "monthly" },
  { id: "lta", label: "Leave Travel Allowance (LTA)", group: "earning", periodicity: "annual" },
  { id: "bonus", label: "Statutory / Performance Bonus", group: "earning", periodicity: "annual" },
  { id: "otherEarnings", label: "Other Allowances", group: "earning", periodicity: "monthly" },

  // ── Deductions (from the employee) ────────────────────────
  { id: "pfEmployee", label: "Provident Fund (Employee)", group: "deduction", periodicity: "monthly" },
  { id: "esiEmployee", label: "ESI (Employee)", group: "deduction", periodicity: "monthly" },
  { id: "professionalTax", label: "Professional Tax", group: "deduction", periodicity: "monthly" },
  { id: "tds", label: "Income Tax (TDS)", group: "deduction", periodicity: "monthly" },
  { id: "otherDeductions", label: "Other Deductions", group: "deduction", periodicity: "monthly" },

  // ── Employer contributions (on top of gross) ──────────────
  { id: "pfEmployer", label: "Provident Fund (Employer)", group: "employer", periodicity: "monthly" },
  { id: "esiEmployer", label: "ESI (Employer)", group: "employer", periodicity: "monthly" },
  { id: "gratuity", label: "Gratuity", group: "employer", periodicity: "annual" },
  { id: "insurance", label: "Group Medical Insurance", group: "employer", periodicity: "annual" },
  { id: "otherContrib", label: "Other Employer Contributions", group: "employer", periodicity: "monthly" },
];

export const CTC_COMPONENT_BY_ID: Record<string, CtcComponentDef> = Object.fromEntries(
  CTC_COMPONENTS.map((c) => [c.id, c]),
);

export const GROUP_LABELS: Record<CtcGroup, string> = {
  earning: "Earnings",
  deduction: "Deductions",
  employer: "Employer Contributions",
};

/** Components of one group, in order. */
export function componentsOf(group: CtcGroup): CtcComponentDef[] {
  return CTC_COMPONENTS.filter((c) => c.group === group);
}

/* ------------------------------------------------------------------ */
/* Values + derivation                                                  */
/* ------------------------------------------------------------------ */

/** id → amount (in the component's native periodicity). Missing = 0. */
export type CtcComponents = Record<string, number>;

/** Sanitise a loose value to a non-negative finite number. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The monthly equivalent of a component's stored amount. */
export function monthlyOf(def: CtcComponentDef, value: number): number {
  return def.periodicity === "monthly" ? value : value / 12;
}

/** The annual equivalent of a component's stored amount. */
export function annualOf(def: CtcComponentDef, value: number): number {
  return def.periodicity === "monthly" ? value * 12 : value;
}

export interface CtcTotals {
  earningsMonthly: number;
  earningsAnnual: number;
  deductionsMonthly: number;
  deductionsAnnual: number;
  employerMonthly: number;
  employerAnnual: number;
  /** Gross = total earnings. */
  grossMonthly: number;
  grossAnnual: number;
  /** Net take-home = gross − employee deductions. */
  netMonthly: number;
  netAnnual: number;
  /** Cost to Company = gross + employer contributions. */
  ctcMonthly: number;
  ctcAnnual: number;
}

/** Compute the full totals ladder from a components map. */
export function computeTotals(components: CtcComponents): CtcTotals {
  let earningsMonthly = 0;
  let deductionsMonthly = 0;
  let employerMonthly = 0;

  for (const def of CTC_COMPONENTS) {
    const m = monthlyOf(def, num(components[def.id]));
    if (def.group === "earning") earningsMonthly += m;
    else if (def.group === "deduction") deductionsMonthly += m;
    else employerMonthly += m;
  }

  const grossMonthly = earningsMonthly;
  const netMonthly = grossMonthly - deductionsMonthly;
  const ctcMonthly = grossMonthly + employerMonthly;

  return {
    earningsMonthly,
    earningsAnnual: earningsMonthly * 12,
    deductionsMonthly,
    deductionsAnnual: deductionsMonthly * 12,
    employerMonthly,
    employerAnnual: employerMonthly * 12,
    grossMonthly,
    grossAnnual: grossMonthly * 12,
    netMonthly,
    netAnnual: netMonthly * 12,
    ctcMonthly,
    ctcAnnual: ctcMonthly * 12,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** "₹1,23,456" — Indian grouping, rupee sign, no paise. */
export function formatINR(n: number): string {
  return `₹${INR.format(Math.round(n || 0))}`;
}

/** Plain grouped number (no sign) — for letter fields. */
export function formatAmount(n: number): string {
  return INR.format(Math.round(n || 0));
}

/** "₹12.5 L" / "₹1.2 Cr" — compact headline figure. */
export function formatINRCompact(n: number): string {
  const v = Math.round(n || 0);
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2).replace(/\.00$/, "")} L`;
  return formatINR(v);
}

/* ------------------------------------------------------------------ */
/* Versions + Growth Journey                                            */
/* ------------------------------------------------------------------ */

export const CTC_REASONS = ["initial", "promotion", "appraisal"] as const;
export type CtcReason = (typeof CTC_REASONS)[number];

export const REASON_LABELS: Record<CtcReason, string> = {
  initial: "Initial CTC",
  promotion: "Promotion",
  appraisal: "Appraisal Revision",
};

export function isCtcReason(v: unknown): v is CtcReason {
  return typeof v === "string" && (CTC_REASONS as readonly string[]).includes(v);
}

/** One Growth-Journey milestone — a dated note on the compensation timeline. */
export interface GrowthEntry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  detail: string;
}

/**
 * The stored `ctc_breakups.fields` shape. We keep the numeric components AND the
 * paying entity in this one jsonb column so no schema change is needed — the
 * `version`, `reason` and `effective_date` live in their own columns.
 */
export interface CtcFields {
  components: CtcComponents;
  entity: EntityId;
}

/** A fully-resolved CTC version, as the workbench consumes it. */
export interface CtcVersion {
  id: string;
  version: number;
  reason: CtcReason;
  effectiveDate: string | null;
  components: CtcComponents;
  entity: EntityId;
  growthJourney: GrowthEntry[];
  updatedAt: string;
}

/** Coerce a raw jsonb `fields` blob into a safe {components, entity}. */
export function parseFields(raw: unknown): CtcFields {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawComponents = (obj.components ?? {}) as Record<string, unknown>;
  const components: CtcComponents = {};
  for (const def of CTC_COMPONENTS) {
    const v = num(rawComponents[def.id]);
    if (v) components[def.id] = v;
  }
  const entity = (typeof obj.entity === "string" ? obj.entity : "altus-corp") as EntityId;
  return { components, entity };
}

/** Coerce a raw jsonb `growth_journey` blob into a safe GrowthEntry[]. */
export function parseGrowthJourney(raw: unknown): GrowthEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e): GrowthEntry | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      return {
        id: String(o.id ?? crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)),
        date: typeof o.date === "string" ? o.date : "",
        title: typeof o.title === "string" ? o.title : "",
        detail: typeof o.detail === "string" ? o.detail : "",
      };
    })
    .filter((e): e is GrowthEntry => e !== null);
}

/** Blank starter component map (all zero → nothing stored). */
export function emptyComponents(): CtcComponents {
  return {};
}
