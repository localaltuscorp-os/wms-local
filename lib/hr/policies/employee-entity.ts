import "server-only";

import { eq } from "drizzle-orm";
import { payingEntities, type Employee } from "@/db/schema";
import { db } from "@/lib/db";
import { policyEntityForPayingEntityName } from "./policy-entity";

/** Resolve the current employee's assigned paying entity for every policy. */
export async function policyEntityForEmployee(
  employee: Pick<Employee, "payingEntityId">,
) {
  if (!employee.payingEntityId) return policyEntityForPayingEntityName(null);

  const [row] = await db
    .select({ name: payingEntities.name })
    .from(payingEntities)
    .where(eq(payingEntities.id, employee.payingEntityId))
    .limit(1);

  return policyEntityForPayingEntityName(row?.name);
}
