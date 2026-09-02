"use server";

import { outstandingResponsibles } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = ["/admin/outstanding-responsibles"];

export async function createResponsible(
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  return createRosterItem(outstandingResponsibles, PATHS, input);
}

export async function updateResponsible(
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  return updateRosterItem(outstandingResponsibles, PATHS, id, fields);
}
