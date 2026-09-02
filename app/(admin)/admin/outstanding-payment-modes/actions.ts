"use server";

import { outstandingPaymentModes } from "@/db/schema";
import {
  createRosterItem,
  updateRosterItem,
  type ActionResult,
  type CreateRosterInput,
  type UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";

const PATHS = ["/admin/outstanding-payment-modes"];

export async function createPaymentMode(
  input: CreateRosterInput,
): Promise<ActionResult<{ id: string }>> {
  return createRosterItem(outstandingPaymentModes, PATHS, input);
}

export async function updatePaymentMode(
  id: string,
  fields: UpdateRosterInput,
): Promise<ActionResult> {
  return updateRosterItem(outstandingPaymentModes, PATHS, id, fields);
}
