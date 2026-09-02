"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";

/**
 * After a failed sign-in, the login form asks whether this account was
 * password-reset by an admin so it can show the specific message. Returns
 * true ONLY when `password_reset_by_admin_at` is set for that email.
 *
 * Rate-limited by email to prevent using this as an account-enumeration
 * oracle (it can only ever reveal the admin-reset state, never existence vs
 * password correctness, but we throttle regardless). On limit/any error it
 * returns false so the caller falls back to the generic message.
 */
export async function wasPasswordResetByAdmin(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const limited = rateLimit(`pwreset-probe:${normalized}`, "read");
  if (!limited.ok) return false;

  try {
    const row = await db
      .select({ marker: employees.passwordResetByAdminAt })
      .from(employees)
      .where(eq(sql`lower(${employees.email})`, normalized))
      .limit(1);
    return row[0]?.marker != null;
  } catch {
    return false;
  }
}
