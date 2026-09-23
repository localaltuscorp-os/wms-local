"use server";

import { designations } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = [
  "/admin/designations",
  // A designation's employee_type decides intern-ness: the Employee Master
  // shows it and the incentive eligibility rule reads it, so a write here must
  // refresh both surfaces. (The `employees` cache tag is bust in
  // lib/outstanding/roster-actions.ts, keyed on the designations table.)
  "/admin/employee-master",
  "/incentive",
];

export async function createDesignation(
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  return createRosterItem(designations, PATHS, input);
}

export async function updateDesignation(
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  return updateRosterItem(designations, PATHS, id, fields);
}
