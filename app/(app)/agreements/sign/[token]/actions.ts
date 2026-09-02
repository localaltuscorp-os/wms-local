"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agreements } from "@/db/schema";
import { agreementsEnabled } from "@/lib/agreements/flag";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";

export type ActionResult = { ok: true } | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const SignSchema = z.object({
  token: z.string().trim().min(1),
  typedName: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 2, "Please type your full legal name."),
  agreed: z.literal(true, { message: "You must agree to the document to sign." }),
});

/**
 * Employee e-signs their own agreement from the token link. Stamps the typed
 * name + timestamp + best-effort IP and flips status → 'signed' (one-way,
 * idempotent-guarded). Ownership is enforced leniently: a logged-in OTHER
 * employee is blocked, but the owner, an admin, or an anonymous visitor holding
 * the unguessable token may sign.
 */
export async function signAgreement(input: {
  token: string;
  typedName: string;
  agreed: boolean;
}): Promise<ActionResult> {
  if (!agreementsEnabled()) return fail("Agreements are currently unavailable.");

  const parsed = SignSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { token, typedName } = parsed.data;

  try {
    const [row] = await db
      .select()
      .from(agreements)
      .where(eq(agreements.signToken, token))
      .limit(1);
    if (!row) return fail("This signing link is no longer valid.");
    if (row.status === "signed") return fail("Already signed.");

    // Lenient ownership check — only block a DIFFERENT logged-in employee.
    const me = await getCurrentEmployee();
    if (me && isCandidateAccount(me)) return fail("This isn't available for candidate accounts.");
    if (me && !me.isAdmin && me.id !== row.employeeId) {
      return fail("This agreement isn't yours.");
    }

    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    await db
      .update(agreements)
      .set({
        signedName: typedName,
        signedAt: new Date(),
        signedIp: ip,
        status: "signed",
        updatedAt: new Date(),
      })
      .where(eq(agreements.id, row.id));

    revalidatePath(`/agreements/sign/${token}`);
    revalidatePath("/agreements");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
