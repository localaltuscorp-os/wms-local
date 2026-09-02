"use server";

import { outstandingEntitiesTbl } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = ["/admin/outstanding-entities"];

export async function createEntity(
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  return createRosterItem(outstandingEntitiesTbl, PATHS, input);
}

export async function updateEntity(
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  return updateRosterItem(outstandingEntitiesTbl, PATHS, id, fields);
}
