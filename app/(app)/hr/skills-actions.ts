"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { skillLookups } from "@/db/schema";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  listSkillLookups,
  isBaseSkillLookup,
  type SkillLookupOptions,
} from "@/lib/hr/skills";

/**
 * Skills Master server actions — HR-gated (requireWorkspaceAdmin("hr")) add/remove
 * of the Management-Assessment skill dropdown options. Base options live in code
 * (lib/hr/skills.ts); these persist admin-added extras in `skill_lookups`
 * (migration 0162). Mirrors addGoalLookup/removeGoalLookup.
 */

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const KindSchema = z.enum(["technical", "non_technical"]);

const AddSchema = z.object({
  kind: KindSchema,
  value: z.string().trim().min(1, "Enter a value").max(60),
});

/** Add (or reactivate) a custom skill option. Idempotent. */
export async function addSkillLookup(
  input: z.infer<typeof AddSchema>,
): Promise<ActionResult<{ options: SkillLookupOptions }>> {
  const me = await requireWorkspaceAdmin("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  }
  const { kind, value } = parsed.data;

  // Already a base option → nothing to persist (idempotent success).
  if (isBaseSkillLookup(kind, value)) {
    return { ok: true, options: await listSkillLookups() };
  }

  // Reactivate a soft-deleted row if one exists (case-insensitive), else insert.
  const [existing] = await db
    .select({ id: skillLookups.id, active: skillLookups.active })
    .from(skillLookups)
    .where(and(eq(skillLookups.kind, kind), eq(skillLookups.value, value)))
    .limit(1);

  try {
    if (existing) {
      if (!existing.active) {
        await db.update(skillLookups).set({ active: true }).where(eq(skillLookups.id, existing.id));
      }
    } else {
      await db.insert(skillLookups).values({ kind, value, createdById: me.id });
    }
  } catch {
    // Unique-index race (someone added the same value) — fine, fall through.
  }
  return { ok: true, options: await listSkillLookups() };
}

const RemoveSchema = z.object({
  kind: KindSchema,
  value: z.string().trim().min(1).max(60),
});

/** Soft-delete an admin-added skill option. BASE options can't be removed. */
export async function removeSkillLookup(
  input: z.infer<typeof RemoveSchema>,
): Promise<ActionResult<{ options: SkillLookupOptions }>> {
  const me = await requireWorkspaceAdmin("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  }
  const { kind, value } = parsed.data;

  if (isBaseSkillLookup(kind, value)) {
    return { ok: false, error: "Built-in skills can't be removed." };
  }
  await db
    .update(skillLookups)
    .set({ active: false })
    .where(and(eq(skillLookups.kind, kind), eq(skillLookups.value, value)));
  return { ok: true, options: await listSkillLookups() };
}
