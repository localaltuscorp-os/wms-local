"use server";

import { asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

export interface ReportRecipient {
  id: string;
  name: string;
  /** Null when the person has no address on file — the row still renders, but
   *  greyed, so the reader learns WHY they cannot mail them. */
  email: string | null;
  /** E.164, from `whatsapp_phone`. Null when they have not registered one. */
  phone: string | null;
  department: string | null;
}

/**
 * The people a dashboard report can be sent to.
 *
 * Fetched ON OPEN of the share picker, not with the dashboard payload: the
 * roster is only needed by a reader who has decided to send something, and it
 * would otherwise ride along on every page view for everyone.
 *
 * NO ADDRESSES ARE TRUSTED FROM HERE ON. The email route re-reads the recipient
 * row server-side from the id alone; this list exists to let someone CHOOSE a
 * person, not to tell the server where to send.
 */
export async function listReportRecipients(): Promise<
  { people: ReportRecipient[] } | { error: string }
> {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const rows = await db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        officialEmail: employees.officialEmail,
        phone: employees.whatsappPhone,
        department: employees.department,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));

    return {
      people: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Same precedence the email route applies, so the picker cannot show an
        // address the send would not actually use.
        email: r.officialEmail?.trim() || r.email || null,
        phone: r.phone?.trim() || null,
        department: r.department,
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not load the roster",
    };
  }
}
