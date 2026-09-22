import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, paPeople } from "@/db/schema";
import { planAutoLinks } from "./calendar";

/**
 * Link Handholding names to employees where the name matches exactly (see
 * planAutoLinks). Idempotent, and never overwrites a link already made — by
 * hand or by an earlier run. Run by the Handholding page before it reads, the
 * same way the page sweeps expired entries.
 */
export async function autoLinkHhPeople(): Promise<number> {
  const [people, active] = await Promise.all([
    db
      .select({ id: paPeople.id, name: paPeople.name, employeeId: paPeople.employeeId })
      .from(paPeople)
      .where(and(eq(paPeople.isActive, true), isNull(paPeople.employeeId))),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true)),
  ]);
  const links = planAutoLinks(people, active);
  for (const l of links) {
    await db
      .update(paPeople)
      .set({ employeeId: l.employeeId, updatedAt: new Date() })
      .where(and(eq(paPeople.id, l.personId), isNull(paPeople.employeeId)));
  }
  return links.length;
}
