import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyDocuments, policyVersions } from "@/db/schema";
import { isEntityId, type EntityId } from "@/lib/hr/entities";
import { getPolicy } from "@/lib/hr/policies/registry";
import { declaration, type PolicyDoc, type PolicySection } from "@/lib/hr/policies/types";

/**
 * Load the CURRENTLY-PUBLISHED version of a policy from the CMS tables, shaped as
 * a declarative {@link PolicyDoc} the shared <PolicyDocument> renderer consumes.
 *
 * The public `/hr/policies/<key>` page reads through this so that live edits
 * (published via the Policy-CMS editor) render immediately. When there is no DB
 * row yet — a policy that has only ever existed in code — it falls back to the
 * code registry (`getPolicy`) so nothing dead-ends during the seed transition.
 *
 * server-only: touches the DB. Returns `null` when the key resolves to neither a
 * published DB policy nor a code-registered one (the caller then shows its
 * coming-soon / not-found state).
 */
export async function loadPublishedPolicy(key: string): Promise<PolicyDoc | null> {
  if (!key) return null;

  const fallback = getPolicy(key) ?? null;

  try {
    const [doc] = await db
      .select()
      .from(policyDocuments)
      .where(eq(policyDocuments.key, key))
      .limit(1);
    if (!doc) return fallback;

    const [current] = await db
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.policyKey, key), eq(policyVersions.version, doc.currentVersion)))
      .limit(1);
    if (!current) return fallback;

    const entityDefault: EntityId | undefined = isEntityId(doc.entityDefault)
      ? doc.entityDefault
      : fallback?.entityDefault;

    return {
      key: doc.key,
      title: current.title || doc.title,
      docCode: current.docCode || doc.docCode || fallback?.docCode || "",
      effectiveDate: current.effectiveDate || fallback?.effectiveDate || "",
      version: String(doc.currentVersion),
      owner: doc.owner || fallback?.owner || "Human Resources",
      registeredOffice: doc.registeredOffice || fallback?.registeredOffice || "",
      hrEmail: doc.hrEmail || fallback?.hrEmail || "",
      entityDefault,
      blurb: doc.blurb || fallback?.blurb,
      summary: current.summary || doc.summary || fallback?.summary || "",
      sections: (current.sections as PolicySection[]) ?? fallback?.sections ?? [],
      declaration: fallback?.declaration ?? declaration(),
    };
  } catch {
    // Never let a CMS read take down the public policy page — fall back to code.
    return fallback;
  }
}
