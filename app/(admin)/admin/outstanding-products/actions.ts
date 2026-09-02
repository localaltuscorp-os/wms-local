"use server";

import { outstandingProducts } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = ["/admin/outstanding-products"];

export async function createProduct(
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  return createRosterItem(outstandingProducts, PATHS, input);
}

export async function updateProduct(
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  return updateRosterItem(outstandingProducts, PATHS, id, fields);
}
