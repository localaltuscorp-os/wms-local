import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { caHandoverCredentials, caHandoverReturns } from "@/db/schema";

/**
 * Read layer for the CA-Handover section. CRITICAL: credential rows are returned
 * WITHOUT the ciphertext (`passwordEnc`) — only a `hasPassword` boolean leaks to
 * the client. The plaintext is NEVER batch-decrypted; it is revealed one row at
 * a time through the gated `revealCredentialPassword` server action.
 */

// Constants + row types live in a client-safe module (no DB import) so client
// components can use them without pulling postgres into the browser bundle.
import { CA_PORTAL_TYPES, CA_PORTAL_LABELS } from "@/lib/accounts/ca-constants";
import type {
  CaPortalType,
  CaCredentialRow,
  CaCredentialGroup,
  CaReturnRow,
} from "@/lib/accounts/ca-constants";
export { CA_PORTAL_TYPES, CA_PORTAL_LABELS };
export type { CaPortalType, CaCredentialRow, CaCredentialGroup, CaReturnRow };

/**
 * All credential rows, grouped by portal type in the canonical order, sorted
 * within a group by sortOrder then entity name. No plaintext crosses this
 * boundary — `passwordEnc` is collapsed to `hasPassword`.
 */
export async function listCaCredentials(): Promise<CaCredentialGroup[]> {
  // Resilient against a momentary pooler hiccup — retry on a fresh connection
  // instead of hard-failing the page to the error boundary (matches the
  // dashboard's withRetry pattern; the load path stays untouched otherwise).
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(caHandoverCredentials)
        .orderBy(
          asc(caHandoverCredentials.portalType),
          asc(caHandoverCredentials.sortOrder),
          asc(caHandoverCredentials.entityName),
        ),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "ca-credentials" },
  );

  const scrubbed: CaCredentialRow[] = rows.map((r) => ({
    id: r.id,
    portalType: r.portalType,
    entityName: r.entityName,
    username: r.username,
    hasPassword: Boolean(r.passwordEnc),
    phone: r.phone,
    defaultEmail: r.defaultEmail,
    websiteLink: r.websiteLink,
    emailUpdated: r.emailUpdated,
    passwordReset: r.passwordReset,
    primaryPhoneUpdated: r.primaryPhoneUpdated,
    secondaryPhoneUpdated: r.secondaryPhoneUpdated,
    note: r.note,
    sortOrder: r.sortOrder ?? 100,
  }));

  // Build a group per known portal type (in order), then append any unknown
  // types that somehow exist so nothing is silently hidden.
  const byType = new Map<string, CaCredentialRow[]>();
  for (const row of scrubbed) {
    const list = byType.get(row.portalType) ?? [];
    list.push(row);
    byType.set(row.portalType, list);
  }

  const groups: CaCredentialGroup[] = [];
  for (const t of CA_PORTAL_TYPES) {
    groups.push({ portalType: t, label: CA_PORTAL_LABELS[t] ?? t, rows: byType.get(t) ?? [] });
    byType.delete(t);
  }
  for (const [t, list] of byType) {
    groups.push({ portalType: t, label: CA_PORTAL_LABELS[t] ?? t, rows: list });
  }
  return groups;
}

/** A returns-archive row — every column is a plain document link or note. */
/** All returns rows, newest FY first then entity name. */
export async function listCaReturns(): Promise<CaReturnRow[]> {
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(caHandoverReturns)
        .orderBy(asc(caHandoverReturns.fy), asc(caHandoverReturns.entityName)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "ca-returns" },
  );

  return rows
    .map(
      (r): CaReturnRow => ({
        id: r.id,
        fy: r.fy,
        entityName: r.entityName,
        itrV: r.itrV,
        filedComputation: r.filedComputation,
        filedItrForm: r.filedItrForm,
        balanceSheet: r.balanceSheet,
        pnl: r.pnl,
        taxAuditReport: r.taxAuditReport,
        selfAssessmentChallan: r.selfAssessmentChallan,
        form26as: r.form26as,
        ais: r.ais,
        assessmentOrder: r.assessmentOrder,
        refundAsPerReturn: r.refundAsPerReturn,
        refundReceived: r.refundReceived,
        gstr1: r.gstr1,
        gstr3b: r.gstr3b,
        gstr2b: r.gstr2b,
        gstWorkingExcel: r.gstWorkingExcel,
        gstr9: r.gstr9,
        note: r.note,
      }),
    )
    // Sort FY descending (newest first) — string sort on "2024-25" style works.
    .sort((a, b) => (b.fy.localeCompare(a.fy) || a.entityName.localeCompare(b.entityName)));
}
