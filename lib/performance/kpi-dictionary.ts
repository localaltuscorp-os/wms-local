/**
 * ALTUS PERFORMANCE ENGINE — the KPI data dictionary (seed).
 *
 * PURE + CLIENT-SAFE. Each person's KPI target set; intraWeight per line sums to
 * 100 (the internal KPI bucket). Weekly targets are scaled to the month at score
 * time (framework.WEEKS_PER_MONTH). Editable later via the admin panel; this is
 * the seed the migration writes into `kpi_definitions`.
 *
 * Spec: docs/superpowers/specs/2026-07-27-performance-incentive-engine-plan.md
 */

export type KpiPeriod = "week" | "month";

export interface KpiLine {
  /** Stable id — the key an actual is stored under. */
  id: string;
  label: string;
  /** Target for the period. */
  target: number;
  period: KpiPeriod;
  /** Internal weight (0..100); a person's lines sum to 100. */
  intraWeight: number;
  /** Optional unit label (e.g. "references"). */
  unit?: string;
}

export interface KpiTarget {
  /** Stable key (lowercase name). */
  key: string;
  name: string;
  lines: KpiLine[];
}

const line = (
  id: string,
  label: string,
  target: number,
  period: KpiPeriod,
  intraWeight: number,
  unit?: string,
): KpiLine => ({ id, label, target, period, intraWeight, unit });

export const KPI_DICTIONARY: KpiTarget[] = [
  {
    key: "rohan",
    name: "Rohan",
    lines: [
      line("rohan-icp", "Right ICP participants attend PSO", 200, "month", 40, "participants"),
      line("rohan-videos", "Manan Vasa educational videos posted", 8, "month", 20, "videos"),
      line("rohan-interviews", "Video interviews conducted", 10, "month", 10, "interviews"),
      line("rohan-blogs", "Blogs / articles posted", 4, "month", 10, "posts"),
      line("rohan-references", "References collected", 30, "week", 10, "references"),
      line("rohan-linkedin", "LinkedIn reviews", 15, "month", 5, "reviews"),
      line("rohan-google", "5-star Google reviews", 15, "month", 5, "reviews"),
    ],
  },
  {
    key: "mishtie",
    name: "Mishtie",
    lines: [
      line("mishtie-ps", "PS payments collected", 10, "week", 50, "payments"),
      line("mishtie-bss", "BSS pitches / WMS demos via Manan Sir", 3, "week", 20),
      line("mishtie-keynote", "Keynote speech / speaking engagement booked", 1, "week", 10),
      line("mishtie-references", "References from ambassadors", 20, "week", 10, "references"),
      line("mishtie-conclave", "Altus Conclave registrations", 20, "month", 10, "registrations"),
    ],
  },
  {
    key: "rutvisha",
    name: "Rutvisha",
    lines: [
      line("rutvisha-bss", "BSS pitches / WMS demos via Manan Sir", 2, "week", 30),
      line("rutvisha-bank", "Pravin Joshi collections in bank (₹ lakhs)", 9, "week", 20, "₹L"),
      line("rutvisha-references", "References collected", 30, "week", 20, "references"),
      line("rutvisha-keynote", "Keynote speech / speaking engagement booked", 1, "week", 10),
      line("rutvisha-ambassador", "Ambassador tie-ups", 1, "week", 10),
      line("rutvisha-hr", "HR consultants / colleges tied up", 2, "week", 10),
    ],
  },
  {
    key: "ruchita",
    name: "Ruchita",
    lines: [
      line("ruchita-references", "References collected", 40, "week", 30, "references"),
      line("ruchita-aicl", "AICL monthly target hit", 1, "month", 30),
      line("ruchita-wms", "WMS demos made to happen", 1, "week", 20),
      line("ruchita-keynote", "Keynote speech / speaking engagement booked", 1, "week", 10),
      line("ruchita-ambassador", "Ambassador tie-ups", 1, "week", 10),
    ],
  },
  {
    key: "jeevan",
    name: "Jeevan",
    lines: [
      line("jeevan-references", "References collected", 30, "week", 30, "references"),
      line("jeevan-wms", "WMS demos made to happen", 4, "week", 30),
      line("jeevan-advance", "Advance collected for WMS solutions", 4, "week", 20),
      line("jeevan-keynote", "Keynote speech / speaking engagement booked", 1, "week", 10),
      line("jeevan-ambassador", "Ambassador tie-ups for WMS", 1, "week", 10),
    ],
  },
  {
    key: "hetesh",
    name: "Hetesh",
    lines: [
      line("hetesh-module", "WMS / BSS modules cracked", 1, "week", 50),
      line("hetesh-train", "Team training on coding-fast (hrs)", 2, "week", 25, "hours"),
      line("hetesh-ai", "AI-based employee-replacement tools implemented", 1, "week", 25),
    ],
  },
  {
    key: "provika",
    name: "Provika",
    lines: [
      line("provika-videos", "Manual videos created", 10, "week", 40, "videos"),
      line("provika-usecase", "Use-case presentations approved by Manan Sir", 2, "week", 30),
      line("provika-aivideos", "AI-based presentation videos generated", 1, "week", 30),
    ],
  },
  {
    key: "pranav",
    name: "Pranav",
    lines: [
      line("pranav-gpt", "Proprietary GPT/LLM for marketing/pre-sales/sales/post-sales", 1, "month", 50),
      line("pranav-ai", "AI-based employee-replacement tools implemented", 1, "week", 50),
    ],
  },
  {
    key: "pratik-patil",
    name: "Pratik Patil",
    lines: [line("pratik-crm", "Altus Corp CRM app (pre-sales → start of Pre-PS call)", 1, "month", 100)],
  },
  {
    key: "daniyal",
    name: "Daniyal",
    lines: [
      line("daniyal-usecase", "Use-case presentations approved by Manan Sir", 2, "week", 50),
      line("daniyal-aivideos", "AI-based presentation videos generated", 1, "week", 50),
    ],
  },
];

export const KPI_BY_KEY: Record<string, KpiTarget> = Object.fromEntries(
  KPI_DICTIONARY.map((t) => [t.key, t]),
);

/**
 * Resolve an employee's KPI-dictionary key from their display name. Tries the
 * whole name lowercased, the hyphen-joined form ("Pratik Patil" → "pratik-patil")
 * and the first token ("Hetesh Vichare" → "hetesh"). Returns null when the person
 * has no dictionary entry (their KPI bucket then computes to 0). PURE + CLIENT-SAFE.
 */
export function kpiKeyForName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  if (KPI_BY_KEY[n]) return n;
  const hyphen = n.replace(/\s+/g, "-");
  if (KPI_BY_KEY[hyphen]) return hyphen;
  const first = n.split(/\s+/)[0];
  if (first && KPI_BY_KEY[first]) return first;
  return null;
}

/** The matched KPI target for a name, or null. PURE + CLIENT-SAFE. */
export function kpiTargetForName(name: string | null | undefined): KpiTarget | null {
  const key = kpiKeyForName(name);
  return key ? KPI_BY_KEY[key] ?? null : null;
}
