"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { resolvePersonEmployee } from "./resolve-person";
import { POLICY_CARDS, isPolicyKey } from "@/lib/hr/policies/registry";
import type { PolicySignRow, PolicySignStatus } from "./policy-status-types";

/**
 * Per-person POLICY-SIGNING record for the HR Record hub.
 *
 * Policies are signed on day one by the person themselves — the sign flow files a
 * `document_instances` row (type_key = policy key, employee_id = signer) and a
 * `document_signatures` row that reaches status "signed" once the signed PDF is
 * archived. This resolves the HR-Record person (a candidate_intake) to their
 * employee account BY EMAIL, then reports — for every PUBLISHED policy — whether
 * that employee has a SIGNED signature on it. Honest by construction: a person not
 * yet linked to an employee account simply shows 0 signed (matched:false).
 *
 * Read-only + auth-guarded. Load-neutral (a couple of indexed lookups).
 */
export async function getPolicySigningStatus(
  candidateId: string,
): Promise<{ ok: true; status: PolicySignStatus } | { ok: false; error: string }> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) {
    return { ok: false, error: "Invalid person." };
  }

  // Published, authored policies — the denominator + the display list.
  const cards = POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key));
  const policyKeys = cards.map((c) => c.key);
  const emptyRows: PolicySignRow[] = cards.map((c) => ({ key: c.key, title: c.title, signed: false }));
  if (policyKeys.length === 0) return { ok: true, status: { matched: false, policies: [] } };

  try {
    // Person id → employee account (employee-id first, candidate-email fallback).
    const emp = await resolvePersonEmployee(candidateId);
    if (!emp) return { ok: true, status: { matched: false, policies: emptyRows } };

    // Which of those policies does this employee have a SIGNED signature on?
    const signedRows = await db
      .selectDistinct({ typeKey: documentInstances.typeKey })
      .from(documentInstances)
      .innerJoin(
        documentSignatures,
        and(
          eq(documentSignatures.docId, documentInstances.id),
          eq(documentSignatures.docKind, "letter"),
          eq(documentSignatures.status, "signed"),
        ),
      )
      .where(
        and(
          eq(documentInstances.employeeId, emp.id),
          inArray(documentInstances.typeKey, policyKeys),
        ),
      );
    const signedSet = new Set(signedRows.map((r) => r.typeKey));

    return {
      ok: true,
      status: {
        matched: true,
        policies: cards.map((c) => ({ key: c.key, title: c.title, signed: signedSet.has(c.key) })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load policy status." };
  }
}
