import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goalLookups } from "@/db/schema";
import { GOAL_TYPES, GOAL_TYPE_LABELS } from "@/db/enums";

/**
 * Goal composer dropdown options for Area + Measure. A fixed BASE set lives here
 * in code; admins can add MORE (persisted in `goal_lookups`, migration 0148),
 * which merge in after the base ones. `listGoalLookups` returns the merged,
 * deduped lists the board loader hands to the composer + edit drawer.
 */

import { applySubjectPolicy } from "@/lib/tasks/subject-options";

export type GoalLookupKind = "area" | "measure" | "type" | "goaltype";

/** Base Area options (order matters — shown first). Altus department / pillar
 *  taxonomy (replaces the old generic Revenue/Branding/Self set). */
export const BASE_AREAS = [
  "Sales",
  "Collection",
  "Marketing",
  "Finances",
  "App Devp",
  "BSS App",
  "PS",
  "BSS",
  "Altus Conclave",
  "Handholding",
  "Systems",
  "Operations",
  "Health",
  "Learning",
  "Self Devp",
  "Training",
  "Finance",
  "Accounts",
  "Admin",
  "Renovation",
  "Strategy",
  "Family",
] as const;

/** Base Measure options (unit of measure → stored on goals.uom). */
export const BASE_MEASURES = ["Rs.", "Seats", "Nos.", "Yes/No", "NA"] as const;

/** Base Type options (→ stored on goals.category, a free-text column). */
export const BASE_TYPES = ["Goal", "Target", "Milestone", "Operational"] as const;

/** Base Goal-Type taxonomy (→ stored on goals.goal_type as a code for these, or
 *  as the raw label for any admin-added custom type). Labels, not codes. */
export const BASE_GOALTYPES = GOAL_TYPES.map((t) => GOAL_TYPE_LABELS[t]) as readonly string[];

function baseFor(kind: GoalLookupKind): readonly string[] {
  return kind === "area"
    ? BASE_AREAS
    : kind === "measure"
      ? BASE_MEASURES
      : kind === "goaltype"
        ? BASE_GOALTYPES
        : BASE_TYPES;
}

/** Case-insensitive de-dupe that keeps the FIRST spelling seen (base wins). */
function mergeUnique(base: readonly string[], extra: string[]): string[] {
  const seen = new Set(base.map((v) => v.toLowerCase()));
  const out = [...base];
  for (const v of extra) {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
}

export interface GoalLookupOptions {
  areas: string[];
  measures: string[];
  types: string[];
  goaltypes: string[];
  /** Values that are admin-added (deletable) — base options are NOT here. */
  custom: { areas: string[]; measures: string[]; types: string[]; goaltypes: string[] };
}

/** Base options + active admin-added extras, merged, minus HIDDEN base options
 *  (a base an admin deleted is stored as an inactive row and filtered out). */
export async function listGoalLookups(): Promise<GoalLookupOptions> {
  const rows = await db
    .select({ kind: goalLookups.kind, value: goalLookups.value, active: goalLookups.active })
    .from(goalLookups)
    .orderBy(asc(goalLookups.sortOrder), asc(goalLookups.value));

  const activeOf = (kind: GoalLookupKind) => rows.filter((r) => r.kind === kind && r.active).map((r) => r.value);
  const hiddenOf = (kind: GoalLookupKind) => new Set(rows.filter((r) => r.kind === kind && !r.active).map((r) => r.value.toLowerCase()));
  const visibleBase = (base: readonly string[], hidden: Set<string>) => base.filter((b) => !hidden.has(b.toLowerCase()));

  const customAreas = activeOf("area");
  const customMeasures = activeOf("measure");
  const customTypes = activeOf("type");
  const customGoaltypes = activeOf("goaltype");

  return {
    // AREA is the goals-side counterpart of a task's Subject, so it carries the
    // same retire/pin policy: "Altus Ecosystem" is always offered on a new goal,
    // and "WMS" / "WMS App" are not — whether they got here as base options or
    // as admin-added ones. Existing goals keep whatever area they were filed
    // under; this is the CHOICE list only.
    // See lib/tasks/subject-options.ts.
    areas: applySubjectPolicy(mergeUnique(visibleBase(BASE_AREAS, hiddenOf("area")), customAreas)),
    measures: mergeUnique(visibleBase(BASE_MEASURES, hiddenOf("measure")), customMeasures),
    types: mergeUnique(visibleBase(BASE_TYPES, hiddenOf("type")), customTypes),
    goaltypes: mergeUnique(visibleBase(BASE_GOALTYPES, hiddenOf("goaltype")), customGoaltypes),
    custom: { areas: customAreas, measures: customMeasures, types: customTypes, goaltypes: customGoaltypes },
  };
}

/** True when `value` is a BASE option for `kind` (base options can't be deleted). */
export function isBaseGoalLookup(kind: GoalLookupKind, value: string): boolean {
  return baseFor(kind).some((b) => b.toLowerCase() === value.trim().toLowerCase());
}

/** True when `value` is already an option (base or custom) for `kind`. */
export async function goalLookupExists(kind: GoalLookupKind, value: string): Promise<boolean> {
  if (isBaseGoalLookup(kind, value)) return true;
  const [hit] = await db
    .select({ id: goalLookups.id })
    .from(goalLookups)
    .where(and(eq(goalLookups.kind, kind), eq(goalLookups.value, value.trim())))
    .limit(1);
  return !!hit;
}
