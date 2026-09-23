"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CancelContractSchema,
  ContractIdSchema,
  ContractSchema,
  RaiseContractBillSchema,
  StopContractItemSchema,
} from "@/lib/validators/billing-contracts";
import {
  attachContractFile,
  cancelContract,
  deleteContract,
  raiseContractBill,
  removeContractFile,
  resumeContractItem,
  saveContract,
  setContractBillingStopped,
  stopContractItem,
} from "@/lib/billing/contract-core";
import type { BillingActor } from "@/lib/billing/documents";

/**
 * BILLING CONTRACTS — the write surface. The house shape, as in
 * ../documents/actions.ts: authorise → rate-limit → zod → the core in
 * lib/billing/contract-core.ts → revalidate → `{ok}`. Nothing trusts a total,
 * a status or a "billed" flag that arrived from the browser.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const LIST_PATH = "/billing/contracts";

async function actor(): Promise<BillingActor> {
  const me = await requireWorkspace("billing");
  return { id: me.id, email: me.email, name: me.name };
}

function firstIssue(err: { issues: { message: string }[] }): string {
  return err.issues[0]?.message ?? "Please check the form and try again.";
}

function revalidateContract(id?: string): void {
  revalidatePath(LIST_PATH);
  if (id) {
    revalidatePath(`${LIST_PATH}/${id}`);
    revalidatePath(`${LIST_PATH}/${id}/edit`);
  }
}

/** Create or update a contract with its schedule and PDCs, in one write. */
export async function saveContractAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ContractSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await saveContract(parsed.data, me);
  if (result.ok) revalidateContract(result.id);
  return result;
}

/** RAISE BILL — a draft tax invoice for one schedule row (or the next retainer period). */
export async function raiseContractBillAction(
  raw: unknown,
): Promise<ActionResult<{ documentId: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = RaiseContractBillSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await raiseContractBill(parsed.data.contractId, parsed.data.itemId ?? null, me);
  revalidateContract(parsed.data.contractId);
  if (!result.ok) return result;
  revalidatePath("/billing/documents");
  return { ok: true, documentId: result.documentId };
}

/** STOP BILLING on one milestone / instalment — or put it back (`resume`). */
export async function setContractItemStoppedAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = StopContractItemSchema.extend({ stopped: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { contractId, itemId, stopped } = parsed.data;
  const result = stopped ? await stopContractItem(contractId, itemId) : await resumeContractItem(contractId, itemId);
  revalidateContract(contractId);
  return result;
}

/** STOP BILLING on the whole contract (the retainer's control), or resume it. */
export async function setContractStoppedAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ContractIdSchema.extend({ stopped: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await setContractBillingStopped(parsed.data.id, parsed.data.stopped, me);
  revalidateContract(parsed.data.id);
  return result;
}

export async function cancelContractAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CancelContractSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await cancelContract(parsed.data.id, parsed.data.reason, me);
  revalidateContract(parsed.data.id);
  return result;
}

/** Delete a contract that never raised a bill. */
export async function deleteContractAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ContractIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await deleteContract(parsed.data.id);
  revalidateContract();
  return result;
}

/**
 * ATTACH CONTRACT — one file per call (FormData: contractId, file), sent after
 * the contract is saved, exactly as the KYC form sends its documents.
 */
export async function uploadContractAttachmentAction(fd: FormData): Promise<ActionResult<{ name: string }>> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const contractId = String(fd.get("contractId") ?? "");
  const file = fd.get("file");
  if (!z.string().uuid().safeParse(contractId).success) return { ok: false, error: "Unknown contract." };
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  const result = await attachContractFile(contractId, file);
  revalidateContract(contractId);
  return result;
}

export async function removeContractAttachmentAction(raw: unknown): Promise<ActionResult> {
  const me = await actor();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ContractIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await removeContractFile(parsed.data.id);
  revalidateContract(parsed.data.id);
  return result;
}
