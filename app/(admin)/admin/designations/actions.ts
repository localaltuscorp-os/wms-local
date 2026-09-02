"use server";

import { designations } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = ["/admin/designations"];

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
