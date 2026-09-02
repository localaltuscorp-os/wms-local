import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { skillLookups } from "@/db/schema";

/**
 * Skills Master — dropdown options for the Management Assessment skills capture.
 * A fixed BASE set lives here in code; HR admins can add MORE (persisted in
 * `skill_lookups`, migration 0162), which merge in after the base ones.
 * `listSkillLookups` returns the merged, deduped lists the MA screen loads.
 * Mirrors the goal-lookups pattern (lib/goals/lookups.ts).
 */

export type SkillLookupKind = "technical" | "non_technical";

/** Base Technical skills (order matters — shown first). */
export const BASE_TECHNICAL = ["Vercel", "Supabase", "Antigravity", "React", "Next.js"] as const;

/** Base Non-technical skills (soft skills). */
export const BASE_NON_TECHNICAL = ["Communication", "Ownership", "Time Management", "Teamwork"] as const;

function baseFor(kind: SkillLookupKind): readonly string[] {
  return kind === "technical" ? BASE_TECHNICAL : BASE_NON_TECHNICAL;
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

export interface SkillLookupOptions {
  technical: string[];
  nonTechnical: string[];
  /** Values that are admin-added (deletable) — base options are NOT here. */
  custom: { technical: string[]; nonTechnical: string[] };
}

/** Base options + active admin-added extras, merged. ONE indexed select. */
export async function listSkillLookups(): Promise<SkillLookupOptions> {
  const rows = await db
    .select({ kind: skillLookups.kind, value: skillLookups.value })
    .from(skillLookups)
    .where(eq(skillLookups.active, true))
    .orderBy(asc(skillLookups.sortOrder), asc(skillLookups.value));

  const customTechnical = rows.filter((r) => r.kind === "technical").map((r) => r.value);
  const customNonTechnical = rows.filter((r) => r.kind === "non_technical").map((r) => r.value);

  return {
    technical: mergeUnique(BASE_TECHNICAL, customTechnical),
    nonTechnical: mergeUnique(BASE_NON_TECHNICAL, customNonTechnical),
    custom: { technical: customTechnical, nonTechnical: customNonTechnical },
  };
}

/** True when `value` is a BASE option for `kind` (base options can't be deleted). */
export function isBaseSkillLookup(kind: SkillLookupKind, value: string): boolean {
  return baseFor(kind).some((b) => b.toLowerCase() === value.trim().toLowerCase());
}

/** True when `value` is already an option (base or custom) for `kind`. */
export async function skillLookupExists(kind: SkillLookupKind, value: string): Promise<boolean> {
  if (isBaseSkillLookup(kind, value)) return true;
  const [hit] = await db
    .select({ id: skillLookups.id })
    .from(skillLookups)
    .where(and(eq(skillLookups.kind, kind), eq(skillLookups.value, value.trim())))
    .limit(1);
  return !!hit;
}
