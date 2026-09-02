import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { readSession } from "@/lib/auth/session";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 * Looks up by Firebase UID.  Used inside Server Components / Server Actions.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const claims = await readSession();
  if (!claims) return null;
  const row = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, claims.uid),
  });
  return row ?? null;
});

/**
 * Like getCurrentEmployee but redirects to /login if absent or deactivated.
 * Throws via redirect (Next renders the redirect on the server).
 */
export async function requireUser(): Promise<Employee> {
  const e = await getCurrentEmployee();
  if (!e || !e.isActive) redirect("/login" as Route);
  return e;
}

/**
 * Like requireUser but additionally throws 403 if not admin.
 * Throws an Error so Next renders error.tsx.
 */
export async function requireAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!e.isAdmin) throw new Error("Forbidden");
  return e;
}
