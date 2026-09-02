/**
 * Pure, client-safe presentation helpers for the Goals Cascade UI.
 *
 * No DB, no `server-only` — imported by client components. Period-key math is
 * re-exported from `@/lib/goals/types` so labels stay in lock-step with the
 * financial-year (Apr–Mar) buckets the server writes.
 */
import type { GoalPeriod } from "@/lib/goals/types";
import {
  fyStartYearOfKey,
  quarterOfKey,
  quarterKeyOfMonthKey,
} from "@/lib/goals/types";
import { effective } from "@/lib/goals/derive";

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const QUARTER_SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: "Apr–Jun",
  2: "Jul–Sep",
  3: "Oct–Dec",
  4: "Jan–Mar",
};

/** Detect the period a canonical period-key encodes. */
export function periodOfKey(periodKey: string): GoalPeriod {
  if (/-Q[1-4]$/.test(periodKey)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(periodKey)) return "month";
  return "year";
}

/** "FY 2026–27" from a year key / any FY start year. */
export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

/** Human label for any period key. Year → "FY 2026–27", quarter → "Q1 · Apr–Jun",
 *  month → "Jul 2026", week (Monday ISO) → "Wk of 13 Jul". */
export function periodKeyLabel(periodKey: string): string {
  // Week leaf = a Monday date ('YYYY-MM-DD') — `periodOfKey` doesn't classify it
  // (weeks live on weekly_goals), so name it here so re-home toasts on the
  // Monthly hierarchy board read cleanly.
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    const d = Number(periodKey.slice(8, 10));
    const m = Number(periodKey.slice(5, 7)) - 1;
    return `Wk of ${d} ${MONTHS[m] ?? ""}`.trim();
  }
  const period = periodOfKey(periodKey);
  if (period === "year") return fyLabel(Number(periodKey));
  if (period === "quarter") {
    const q = quarterOfKey(periodKey);
    return `Q${q} · ${QUARTER_SPAN[q]}`;
  }
  const y = Number(periodKey.slice(0, 4));
  const m = Number(periodKey.slice(5, 7)) - 1;
  return `${MONTHS[m]} ${y}`;
}

/** Short label — "Q1", "Jul", "FY26", week → "Jul 13". */
export function periodKeyShort(periodKey: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    const d = Number(periodKey.slice(8, 10));
    const m = Number(periodKey.slice(5, 7)) - 1;
    return `${MONTHS[m] ?? ""} ${d}`.trim();
  }
  const period = periodOfKey(periodKey);
  if (period === "year") return `FY${String(Number(periodKey) % 100)}`;
  if (period === "quarter") return `Q${quarterOfKey(periodKey)}`;
  return MONTHS[Number(periodKey.slice(5, 7)) - 1] ?? periodKey;
}

/** The key of a period's parent bucket (month→quarter, quarter→year), or null for year. */
export function parentPeriodKeyOf(periodKey: string): string | null {
  const period = periodOfKey(periodKey);
  if (period === "month") return quarterKeyOfMonthKey(periodKey);
  if (period === "quarter") return String(fyStartYearOfKey(periodKey));
  return null;
}

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  year: "Year",
  quarter: "Quarter",
  month: "Month",
  week: "Week",
  day: "Day",
};

/** The child level below a period ('year'→'quarter', …, 'month'→'week'). */
export function childLevelOf(period: GoalPeriod): "quarter" | "month" | "week" {
  if (period === "year") return "quarter";
  if (period === "quarter") return "month";
  return "week";
}

/** numeric(14,2) columns round-trip as strings — parse for display/math. */
export function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compact number for a target/actual chip — "1.2k", "3.4L", "12". */
export function fmtNum(v: string | number | null | undefined): string {
  const n = typeof v === "number" ? v : num(v ?? null);
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.00$/, "")}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.00$/, "")}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n % 1 === 0 ? n : n.toFixed(2));
}

/** Render a numeric(14,2) string WITHOUT a trailing ".00" — "50.00"→"50",
 *  "12.50"→"12.5", "12.05"→"12.05". Empty/null → "". Keeps a genuine fraction. */
export function trimDecimal(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

/** Effective % = manager-accepted once reviewed, else the owner's self-rating.
 *  Delegates to the ONE canonical derive layer (lib/goals/derive `effective`)
 *  so the board, canvas and server never disagree — no local copy. */
export const effectiveGoalPct: (g: { acceptPct: number | null; pctDone: number }) => number =
  effective;

export interface PctTone {
  /** solid accent colour */
  color: string;
  /** faint tinted background */
  bg: string;
  band: "green" | "amber" | "red";
}

/** Google-style scorecard colour: ≥70 green, 40–69 amber, <40 red. */
export function pctTone(pct: number): PctTone {
  if (pct >= 70) return { color: "#15803d", bg: "rgba(21,128,61,0.12)", band: "green" };
  if (pct >= 40) return { color: "#b45309", bg: "rgba(180,83,9,0.12)", band: "amber" };
  return { color: "#b91c1c", bg: "rgba(185,28,28,0.12)", band: "red" };
}

export const GOALS_ACCENT = "#E10600"; // Altus brand red — in-module chrome is red
export const GOALS_ACCENT_DEEP = "#A80400";

/* ------------------------------------------------------------------ */
/* Target Date (deadline) — colour + label for month/week goals only.  */
/* Year/Quarter carry no target date (their progress rolls up).        */
/* ------------------------------------------------------------------ */

export interface TargetDateStatus {
  tone: "ok" | "warn" | "over";
  /** semantic hex — green (ok) / amber (warn) / red (over). */
  color: string;
  /** short human label: "in 12 days" · "in 3 days" · "today" · "2 days ago". */
  label: string;
  /** whole days from today (local): >0 future, 0 today, <0 past. null when no date. */
  daysLeft: number | null;
}

/** Midnight-local day index for a Date (drops the time so day-diffs are exact). */
function dayIndex(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/**
 * Deadline health for a goal's target date (ISO 'YYYY-MM-DD'):
 *   >7 days remaining → green (ok) · ≤7 days incl. today → amber (warn) · past → red (over).
 * Days are counted from *today* in local time. null / blank → no chip (returns tone "ok"
 * with daysLeft null; callers should skip rendering when daysLeft == null).
 */
export function targetDateStatus(iso: string | null | undefined): TargetDateStatus {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { tone: "ok", color: "#15803d", label: "", daysLeft: null };
  }
  const target = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const days = dayIndex(target) - dayIndex(new Date());

  const label =
    days > 1
      ? `in ${days} days`
      : days === 1
        ? "tomorrow"
        : days === 0
          ? "today"
          : days === -1
            ? "yesterday"
            : `${Math.abs(days)} days ago`;

  if (days < 0) return { tone: "over", color: "#b91c1c", label, daysLeft: days };
  if (days <= 7) return { tone: "warn", color: "#b45309", label, daysLeft: days };
  return { tone: "ok", color: "#15803d", label, daysLeft: days };
}

/** A goal carries a target date only at MONTH or WEEK level (never year/quarter). */
export function goalTakesTargetDate(period: GoalPeriod): boolean {
  return period === "month" || period === "week";
}

/** Format an ISO date as "09-Aug-2026" for the chip. Blank/invalid → "". */
export function fmtTargetDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const y = iso.slice(0, 4);
  const mo = Number(iso.slice(5, 7));
  const da = iso.slice(8, 10);
  return `${da}-${MONTHS[mo - 1] ?? ""}-${y}`;
}

/* ------------------------------------------------------------------ */
/* Auto-naming codes (Sir): Y1 → AQ1/JuQ1/OQ1/JQ1 → JulM1 → W1..W52    */
/* ------------------------------------------------------------------ */

/** FY quarter (1=Apr,2=Jul,3=Oct,4=Jan) → anchor-month prefix (J=Jan,A=Apr,Ju=Jul,O=Oct). */
const Q_PREFIX: Record<1 | 2 | 3 | 4, string> = { 1: "A", 2: "Ju", 3: "O", 4: "J" };

/** The short auto-code for a cascade goal: Y{n} / {Q}Q{n} / {Mon}M{n}. `position`
 *  is the 1-based Sr. No. within the period bucket. */
export function goalCode(g: {
  period: GoalPeriod;
  periodKey: string;
  position: number;
  id?: string;
}): string {
  // bug #24 — an in-flight optimistic temp row carries the sentinel position
  // 9_999 (and an "optimistic-" id) until the server assigns its Sr. No.;
  // render "…" instead of leaking "JanM9999" into visible copy. (Prefix kept
  // in lockstep with TEMP_PREFIX in components/goals/canvas/optimistic.ts.)
  if (g.position >= 9_999 || g.id?.startsWith("optimistic-")) return "…";
  if (g.period === "year") return `Y${g.position}`;
  if (g.period === "quarter") return `${Q_PREFIX[quarterOfKey(g.periodKey)]}Q${g.position}`;
  const mon = MONTHS[Number(g.periodKey.slice(5, 7)) - 1] ?? "";
  return `${mon}M${g.position}`;
}

/* ------------------------------------------------------------------ */
/* Colour by ORIGIN (Sir): auto=dark blue · manual=black · spillover=red */
/* ------------------------------------------------------------------ */

export interface OriginStyle {
  color: string;
  label: "Auto" | "Manual" | "Spillover";
  kind: "cascade" | "manual" | "spillover";
}

const ORIGIN_BLUE = "#1e3a8a"; // dark blue — auto-derived from a parent
const ORIGIN_BLACK = "#111827"; // black — manual standalone
const ORIGIN_RED = "#b91c1c"; // red — spilled over, incomplete

/** A goal is a SPILLOVER when it was carried from a prior period and isn't done. */
export function isSpillover(g: { clonedFromId: string | null; pctDone: number; acceptPct: number | null }): boolean {
  return g.clonedFromId != null && effectiveGoalPct(g) < 100;
}

export function originStyle(g: {
  source: string;
  clonedFromId: string | null;
  pctDone: number;
  acceptPct: number | null;
}): OriginStyle {
  if (isSpillover(g)) return { color: ORIGIN_RED, label: "Spillover", kind: "spillover" };
  if (g.source === "cascade") return { color: ORIGIN_BLUE, label: "Auto", kind: "cascade" };
  return { color: ORIGIN_BLACK, label: "Manual", kind: "manual" };
}

/* ------------------------------------------------------------------ */
/* Assignment type — Self vs Assigned (a first-class, derived field)    */
/* ------------------------------------------------------------------ */

export interface AssignmentInfo {
  /** "self" when the owner created the row, "assigned" when someone else did. */
  type: "self" | "assigned";
  /** Creator's display name (assigned only) — null when unknown / off-roster. */
  by: string | null;
  /** Formatted creation date (assigned only) — "12 Jul 2026", or null. */
  on: string | null;
  /** Human assignment-source label: Direct · Cascaded · Bulk import. */
  source: string;
}

/** Map `goals.source` → a human "Assignment Source" label. `manual` = Direct
 *  (typed in by hand), `cascade` = Cascaded (auto-derived from a parent). A bulk
 *  spreadsheet import is not yet a distinct source, so it also reads "Direct"
 *  (the Excel-template task adds a distinguishable import source + columns). */
export function assignmentSourceLabel(source: string): string {
  switch (source) {
    case "cascade":
      return "Cascaded";
    case "import":
    case "bulk":
    case "bulk_import":
      return "Bulk import";
    case "manual":
    default:
      return "Direct";
  }
}

/**
 * Derive the first-class Assignment Type for a goal. Self ⇔ the creator IS the
 * owner (no creator recorded, or creator == owner). Otherwise it was assigned to
 * the owner by someone else — expose who (`by`), when (`on`) and how (`source`).
 * Pure + client-safe; names/dates come pre-resolved on the DTO.
 */
export function assignmentInfo(g: {
  employeeId: string;
  createdById?: string | null;
  createdAt: string | null;
  createdByName: string | null;
  source: string;
}): AssignmentInfo {
  const assigned = g.createdById != null && g.createdById !== g.employeeId;
  if (!assigned) return { type: "self", by: null, on: null, source: "Direct" };
  return {
    type: "assigned",
    by: g.createdByName,
    on: g.createdAt ? fmtTargetDate(g.createdAt.slice(0, 10)) : null,
    source: assignmentSourceLabel(g.source),
  };
}

/** One-line tooltip/summary for an assigned goal ("Assigned by X · date · src").
 *  Self → "Self-created". */
export function assignmentSummary(info: AssignmentInfo): string {
  if (info.type === "self") return "Self-created";
  const bits = [info.by ? `Assigned by ${info.by}` : "Assigned"];
  if (info.on) bits.push(info.on);
  bits.push(info.source);
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Category tags (Kanban) — target · milestone · operational · goal    */
/* ------------------------------------------------------------------ */

export const GOAL_CATEGORIES = ["target", "milestone", "operational", "goal"] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export interface CategoryStyle {
  label: string;
  /** tag text colour */
  color: string;
  /** tag background */
  bg: string;
  /** left card border accent */
  accent: string;
}

/** Card tag styling. Spillover (carried + incomplete) overrides the category → red. */
export function categoryStyle(category: string | null | undefined, spillover: boolean): CategoryStyle {
  if (spillover) return { label: "Spillover", color: "#b91c1c", bg: "rgba(185,28,28,0.10)", accent: "#b91c1c" };
  // Case-insensitive so both the legacy lowercase enum ("target") and the new
  // capitalised Type options ("Target") resolve; unknown admin-added Types get
  // the neutral default but keep their own label.
  switch ((category ?? "").toLowerCase()) {
    case "target":
      return { label: "Quarter Target", color: "#1d4ed8", bg: "rgba(29,78,216,0.10)", accent: "#1d4ed8" };
    case "milestone":
      return { label: "Milestone", color: "#4338ca", bg: "rgba(67,56,202,0.10)", accent: "#4338ca" };
    case "operational":
      return { label: "Operational", color: "#475569", bg: "rgba(71,85,105,0.10)", accent: "#94a3b8" };
    case "goal":
    case "":
      return { label: "Goal", color: "#334155", bg: "rgba(51,65,85,0.08)", accent: "#334155" };
    default:
      // Custom admin-added Type — neutral chip, its own label.
      return { label: category as string, color: "#334155", bg: "rgba(51,65,85,0.08)", accent: "#334155" };
  }
}

/* ------------------------------------------------------------------ */
/* Serialisable DTOs (server → client boundary)                        */
/* ------------------------------------------------------------------ */

/** A snapshot of a picked Monthly Events Master item (obligation / batch). The
 *  `label` is captured at pick time so the board renders the chip without ever
 *  joining the events-master tables. */
export interface MonthlyMasterRef {
  kind: string;
  id: string;
  label: string;
}

export interface GoalDTO {
  id: string;
  employeeId: string;
  /** Who created the row. Optional (older rows / temp optimistic rows omit it).
   *  Drives the Self (created by the owner) vs Assigned (created by a manager)
   *  badge on the level board — see `assignmentInfo`. */
  createdById?: string | null;
  /** When the row was created (ISO) — the "Assigned On" date. null on temp rows. */
  createdAt: string | null;
  /** Display name of the creator, resolved from the loaded roster (load-neutral) —
   *  the "Assigned By" name. null when self-created or the creator is off-roster. */
  createdByName: string | null;
  period: GoalPeriod;
  periodKey: string;
  parentGoalId: string | null;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  notes: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string; weight?: number }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
  /** Category tag (target · milestone · operational · goal). Kanban colour. */
  category: string;
  /** Goal Type taxonomy (kpi · branding · strategic · operational · essential,
   *  mig 0168). Supersedes the legacy free-text `category`; drives appraisal
   *  scoring + the board's inline Type selector. OPTIONAL (temp rows omit it). */
  goalType?: string | null;
  /** Carry-forward link — set ⇒ this row spilled over from a prior period. */
  clonedFromId: string | null;
  /** Incentive attached to the goal (Yes/No + amount + type). RETIRED — kept
   *  on the DTO for back-compat but no longer surfaced in the goals UI. */
  incentiveEnabled: boolean;
  incentiveAmount: string | null;
  incentiveKind: string | null;
  /** The picked Monthly Events Master item, or null. */
  monthlyMasterRef: MonthlyMasterRef | null;
  /** "Share with team" Yes/No (mig 0149). */
  shareWithTeam: boolean;
  /** "Delegate to team" (mig 0171) — accountability hand-off, each delegate with
   *  a % (default 100). OPTIONAL: temp/optimistic + week rows omit it. */
  delegatedTo?: Array<{ employeeId: string; name?: string; pct: number }> | null;
  /** Deadline (ISO 'YYYY-MM-DD') — set ONLY on month/week goals (mig 0169). */
  targetDate: string | null;
  /** Task status (goals.status). OPTIONAL — in-flight optimistic temp rows omit
   *  it; the loaders select the full row so real DTOs always carry it. */
  status?: string | null;
  /** Designated reviewer (goals.reviewed_by_id), or null. OPTIONAL for the same
   *  temp-row reason; resolve the name from the roster on the client. */
  reviewedById?: string | null;
  /** "Part of Project?" Yes/No (mig 0184). OPTIONAL — optimistic temp rows omit
   *  it; the loaders select the full row so real DTOs always carry it. */
  isProject?: boolean;
  /** The tagged project (project_nodes.id) — only set when isProject. */
  projectNodeId?: string | null;
  /** The tagged vendor (vendors.id) — only set when isProject, and optional even
   *  then ("…and the vendor IF RELEVANT"). */
  vendorId?: string | null;
}

export interface GoalNodeDTO extends GoalDTO {
  children: GoalNodeDTO[];
}

export interface RosterMember {
  id: string;
  name: string;
}

/** A period bucket roll-up for the review charts (avg effective % + count). */
export interface GoalPeriodBucket {
  period: GoalPeriod;
  periodKey: string;
  avg: number;
  count: number;
}

/** Raw goal row (drizzle select, numeric as string) → lean client DTO. */
export function toGoalDTO(r: {
  id: string;
  employeeId: string;
  createdById?: string | null;
  createdAt?: string | Date | null;
  createdByName?: string | null;
  period: string;
  periodKey: string;
  parentGoalId: string | null;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  notes: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string; weight?: number }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
  category: string;
  goalType?: string | null;
  clonedFromId: string | null;
  incentiveEnabled?: boolean;
  incentiveAmount?: string | null;
  incentiveKind?: string | null;
  monthlyMasterRef?: { kind: string; id: string; label: string } | null;
  shareWithTeam?: boolean;
  delegatedTo?: Array<{ employeeId: string; name?: string; pct: number }> | null;
  targetDate?: string | Date | null;
  status?: string | null;
  reviewedById?: string | null;
  // "Part of Project?" (mig 0184) — optional so callers that select a narrower
  // row (the weekly board, optimistic temp rows) still satisfy this signature.
  isProject?: boolean | null;
  projectNodeId?: string | null;
  vendorId?: string | null;
}): GoalDTO {
  return {
    id: r.id,
    employeeId: r.employeeId,
    createdById: r.createdById ?? null,
    // timestamp columns round-trip as a Date (drizzle) or an ISO string; keep the
    // full ISO so `assignmentInfo` can format the "Assigned On" date.
    createdAt:
      r.createdAt == null
        ? null
        : typeof r.createdAt === "string"
          ? r.createdAt
          : r.createdAt.toISOString(),
    // Resolved by the loader from the already-loaded roster (load-neutral); the
    // server actions can't cheaply resolve it, so their reconciled rows carry
    // null until the next RSC payload re-hydrates the name.
    createdByName: r.createdByName ?? null,
    period: r.period as GoalPeriod,
    periodKey: r.periodKey,
    parentGoalId: r.parentGoalId,
    position: r.position,
    area: r.area,
    title: r.title,
    uom: r.uom,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    targetAmount: r.targetAmount,
    actualAmount: r.actualAmount,
    notes: r.notes,
    teamInvolved: r.teamInvolved,
    teamDependencyPct: r.teamDependencyPct,
    shareWithTeam: r.shareWithTeam ?? false,
    delegatedTo: r.delegatedTo ?? null,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: r.reviewNotes,
    evidenceUrl: r.evidenceUrl,
    weight: r.weight,
    adopted: r.adopted,
    source: r.source,
    category: r.category,
    goalType: r.goalType ?? null,
    clonedFromId: r.clonedFromId,
    incentiveEnabled: r.incentiveEnabled ?? false,
    incentiveAmount: r.incentiveAmount ?? null,
    incentiveKind: r.incentiveKind ?? null,
    monthlyMasterRef: r.monthlyMasterRef ?? null,
    // date columns round-trip as 'YYYY-MM-DD' strings; a Date (rare) → ISO date.
    targetDate:
      r.targetDate == null
        ? null
        : typeof r.targetDate === "string"
          ? r.targetDate.slice(0, 10)
          : r.targetDate.toISOString().slice(0, 10),
    status: r.status ?? null,
    reviewedById: r.reviewedById ?? null,
    isProject: r.isProject ?? false,
    projectNodeId: r.projectNodeId ?? null,
    vendorId: r.vendorId ?? null,
  };
}

/** Recursive tree mapper for the year board. */
export function toNodeDTO(n: Parameters<typeof toGoalDTO>[0] & { children: unknown[] }): GoalNodeDTO {
  return {
    ...toGoalDTO(n),
    children: (n.children as (typeof n)[]).map(toNodeDTO),
  };
}
