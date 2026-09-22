"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures, employees } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { listMyLetters } from "@/lib/hr/sections";
import { getDocType, isLetterKey } from "@/lib/hr/letters/registry";
import { CATEGORY_LABELS } from "@/lib/hr/letters/types";
import { POLICY_CARDS, isPolicyKey, type PolicyCard } from "@/lib/hr/policies/registry";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { resolvePersonEmployee } from "./resolve-person";
import {
  EMPTY_PERSON_LETTERS,
  type LetterStatus,
  type LetterTableRow,
  type PersonLetters,
  type SignatureState,
} from "./person-letters-types";

/**
 * Every letter and policy on ONE person's file, as rows for HR Record's table.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * HR Record listed only UPLOADED letters (employee_documents). Letters issued
 * from the composer — Selection, Appointment, After Free Training, Relieving —
 * are document_instances rows, and never appeared on the record at all. This
 * reads both, plus the policies the person signs, so "what has this person been
 * given and what have they signed" is one list.
 *
 * Same contract as person-files.ts: HR-gated, keyed on the id
 * `resolvePersonEmployee` returns for the person on screen, and fail-soft to
 * empty so the table says "nothing on file" rather than taking the page down.
 */

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const SIGNED_URL_TTL = 60 * 60;
const INSTANCE_LIMIT = 300;
const KNOWN_STATUSES = new Set<LetterStatus>(["draft", "sent", "acknowledged", "signed"]);

const issuer = alias(employees, "person_letters_issuer");

type Sig = { docId: string; status: string; signedAt: Date | null; signedPdfPath: string | null };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const humanize = (key: string) => key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** One batched signing call. Storage being unreachable costs the Open links, not the rows. */
async function signPaths(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return out;
  try {
    const { data } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch {
    /* leave the map empty — every row renders "No file yet" instead of a dead link */
  }
  return out;
}

function policyRow(
  card: PolicyCard,
  instance: { id: string; issuedAt: Date | null; createdAt: Date; issuerName: string | null } | null,
  sig: Sig | undefined,
  urls: Map<string, string>,
): LetterTableRow {
  const signed = sig?.status === "signed";
  return {
    id: instance?.id ?? `policy:${card.key}`,
    kind: "policy",
    title: card.title,
    category: "Policies",
    status: signed ? "signed" : "pending",
    signature: signed ? "signed" : "pending",
    issuedAt: iso(instance?.issuedAt ?? instance?.createdAt),
    signedAt: signed ? iso(sig?.signedAt) : null,
    issuedBy: instance?.issuerName ?? null,
    openUrl: signed && sig?.signedPdfPath ? (urls.get(sig.signedPdfPath) ?? null) : null,
    composeKey: null,
  };
}

export async function getPersonLetters(personId: string): Promise<PersonLetters> {
  try {
    await requireHrStaff();
  } catch {
    return EMPTY_PERSON_LETTERS;
  }
  if (!isUuid(personId)) return EMPTY_PERSON_LETTERS;

  const policyCards = POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key));

  try {
    const emp = await resolvePersonEmployee(personId);
    // No employee account yet: nothing can have been issued or signed, but the
    // policies they WILL sign are still worth listing as pending.
    if (!emp) {
      return { matched: false, rows: policyCards.map((c) => policyRow(c, null, undefined, new Map())) };
    }

    const [instances, uploaded] = await Promise.all([
      db
        .select({
          id: documentInstances.id,
          typeKey: documentInstances.typeKey,
          status: documentInstances.status,
          renderedPdfPath: documentInstances.renderedPdfPath,
          issuedAt: documentInstances.issuedAt,
          createdAt: documentInstances.createdAt,
          issuerName: issuer.name,
        })
        .from(documentInstances)
        .leftJoin(issuer, eq(issuer.id, documentInstances.issuedById))
        .where(eq(documentInstances.employeeId, emp.id))
        .orderBy(desc(documentInstances.createdAt))
        .limit(INSTANCE_LIMIT),
      listMyLetters(emp.id).catch(() => []),
    ]);

    const ids = instances.map((i) => i.id);
    const sigRows: (Sig & { createdAt: Date })[] = ids.length
      ? await db
          .select({
            docId: documentSignatures.docId,
            status: documentSignatures.status,
            signedAt: documentSignatures.signedAt,
            signedPdfPath: documentSignatures.signedPdfPath,
            createdAt: documentSignatures.createdAt,
          })
          .from(documentSignatures)
          .where(and(eq(documentSignatures.docKind, "letter"), inArray(documentSignatures.docId, ids)))
          .orderBy(desc(documentSignatures.createdAt))
      : [];

    // One signature per document: a SIGNED one wins, otherwise the newest (rows
    // arrive newest-first, so the first seen is kept unless a signed one follows).
    const sigByDoc = new Map<string, Sig>();
    for (const s of sigRows) {
      const cur = sigByDoc.get(s.docId);
      if (!cur || (cur.status !== "signed" && s.status === "signed")) sigByDoc.set(s.docId, s);
    }

    const urls = await signPaths(
      instances.flatMap((i) => [sigByDoc.get(i.id)?.signedPdfPath, i.renderedPdfPath]),
    );

    const rows: LetterTableRow[] = [];

    // Composed letters.
    for (const i of instances) {
      if (isPolicyKey(i.typeKey)) continue;
      const doc = getDocType(i.typeKey);
      const sig = sigByDoc.get(i.id);
      const signature: SignatureState = sig?.status === "signed" ? "signed" : sig ? "pending" : "none";
      const raw = i.status as LetterStatus;
      const status: LetterStatus = signature === "signed" ? "signed" : KNOWN_STATUSES.has(raw) ? raw : "issued";
      const path = sig?.signedPdfPath ?? i.renderedPdfPath;
      rows.push({
        id: i.id,
        kind: "letter",
        title: doc?.title ?? humanize(i.typeKey),
        category: doc ? CATEGORY_LABELS[doc.category] : "Letter",
        status,
        signature,
        issuedAt: iso(i.issuedAt ?? i.createdAt),
        signedAt: signature === "signed" ? iso(sig?.signedAt) : null,
        issuedBy: i.issuerName ?? null,
        openUrl: path ? (urls.get(path) ?? null) : null,
        composeKey: isLetterKey(i.typeKey) ? i.typeKey : null,
      });
    }

    // Policies — every published one, against the best instance on file for it
    // (a signed instance beats a newer unsigned re-send).
    const bestPolicy = new Map<string, (typeof instances)[number]>();
    for (const i of instances) {
      if (!isPolicyKey(i.typeKey)) continue;
      const cur = bestPolicy.get(i.typeKey);
      const curSigned = cur ? sigByDoc.get(cur.id)?.status === "signed" : false;
      if (!cur || (!curSigned && sigByDoc.get(i.id)?.status === "signed")) bestPolicy.set(i.typeKey, i);
    }
    for (const card of policyCards) {
      const inst = bestPolicy.get(card.key) ?? null;
      rows.push(policyRow(card, inst, inst ? sigByDoc.get(inst.id) : undefined, urls));
    }

    // Uploaded letters (already signed-URL'd by their reader).
    for (const l of uploaded) {
      rows.push({
        id: l.id,
        kind: "uploaded",
        title: l.title || l.letterLabel,
        category: l.letterLabel,
        status: "issued",
        signature: "none",
        issuedAt: l.effectiveDate ?? null,
        signedAt: null,
        issuedBy: null,
        openUrl: l.signedUrl ?? null,
        composeKey: null,
      });
    }

    return { matched: true, rows };
  } catch {
    return EMPTY_PERSON_LETTERS;
  }
}
