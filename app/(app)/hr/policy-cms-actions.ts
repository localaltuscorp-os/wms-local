"use server";

import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyDocuments, policyVersions, policyCompliance, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { setAdminPin, hasAdminPin, verifyAdminPin } from "@/lib/hr/admin-pin";
import type { PolicyEditorData, PublishPolicyInput, PolicyVersionMeta } from "./policy-cms-actions-types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
type VoidResult = { ok: true } | { ok: false; error: string };

/** Admin-only: load a policy for the editor (current sections + version history + compliance). */
export async function loadPolicyEditor(key: string): Promise<Result<{ data: PolicyEditorData }>> {
  try {
    await requireWorkspaceAdmin("hr");
  } catch {
    return { ok: false, error: "Admins only." };
  }
  if (!key) return { ok: false, error: "Invalid policy." };
  try {
    const [doc] = await db.select().from(policyDocuments).where(eq(policyDocuments.key, key)).limit(1);
    if (!doc) return { ok: false, error: "Policy not found. Seed the CMS first." };
    const [current] = await db
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.policyKey, key), eq(policyVersions.version, doc.currentVersion)))
      .limit(1);
    const versionRows = await db
      .select({ version: policyVersions.version, title: policyVersions.title, publishedAt: policyVersions.publishedAt })
      .from(policyVersions)
      .where(eq(policyVersions.policyKey, key))
      .orderBy(desc(policyVersions.version));
    const versions: PolicyVersionMeta[] = versionRows.map((v) => ({
      version: v.version,
      title: v.title,
      publishedAt: v.publishedAt.toISOString(),
    }));
    const compliance = await complianceCounts(key);
    return {
      ok: true,
      data: {
        key: doc.key,
        title: doc.title,
        summary: doc.summary,
        docCode: doc.docCode,
        effectiveDate: current?.effectiveDate ?? "",
        sections: (current?.sections as unknown[]) ?? [],
        currentVersion: doc.currentVersion,
        status: doc.status,
        versions,
        compliance,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the policy." };
  }
}

async function complianceCounts(key: string) {
  const rows = (await db
    .select({ status: policyCompliance.status, n: sql<number>`count(*)::int` })
    .from(policyCompliance)
    .where(eq(policyCompliance.policyKey, key))
    .groupBy(policyCompliance.status)) as { status: string; n: number }[];
  const signed = rows.find((r) => r.status === "signed")?.n ?? 0;
  const pending = rows.find((r) => r.status === "pending")?.n ?? 0;
  return { total: signed + pending, signed, pending };
}

/**
 * Admin + PIN: publish an edited policy as a NEW version, then RESET compliance —
 * every active employee is marked 'pending' for the new version (the re-signing
 * request). Version auto-increments.
 */
export async function publishPolicy(input: PublishPolicyInput): Promise<Result<{ version: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  try {
    await requireWorkspaceAdmin("hr");
  } catch {
    return { ok: false, error: "Admins only." };
  }
  if (!(await hasAdminPin())) return { ok: false, error: "No Admin PIN is set. Ask a super-admin to set it first." };
  if (!(await verifyAdminPin(input.pin))) return { ok: false, error: "Incorrect Admin PIN." };
  if (!input.key || !input.title.trim()) return { ok: false, error: "Title is required." };

  try {
    const [doc] = await db.select().from(policyDocuments).where(eq(policyDocuments.key, input.key)).limit(1);
    if (!doc) return { ok: false, error: "Policy not found." };
    const nextVersion = doc.currentVersion + 1;

    await db.insert(policyVersions).values({
      policyKey: input.key,
      version: nextVersion,
      title: input.title,
      docCode: doc.docCode,
      effectiveDate: input.effectiveDate,
      summary: input.summary,
      sections: input.sections as object,
      publishedById: me.id,
    });

    await db
      .update(policyDocuments)
      .set({ title: input.title, summary: input.summary, currentVersion: nextVersion, updatedById: me.id, updatedAt: new Date() })
      .where(eq(policyDocuments.key, input.key));

    // Re-signing request: reset every active employee to 'pending' for the new version.
    const emps = await db.select({ id: employees.id }).from(employees);
    if (emps.length > 0) {
      await db
        .insert(policyCompliance)
        .values(
          emps.map((e) => ({
            policyKey: input.key,
            version: nextVersion,
            employeeId: e.id,
            status: "pending" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [policyCompliance.policyKey, policyCompliance.employeeId],
          set: { version: nextVersion, status: "pending", signedAt: null, docInstanceId: null, updatedAt: new Date() },
        });
    }
    return { ok: true, version: nextVersion };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not publish the policy." };
  }
}

/** Super-admin: set/replace the org Admin PIN. */
export async function setAdminPinAction(pin: string): Promise<VoidResult> {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return { ok: false, error: "Super-admin only." };
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "PIN must be 4–8 digits." };
  try {
    await setAdminPin(pin);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not set the PIN." };
  }
}

/** Whether an Admin PIN has been configured (to drive the UI). */
export async function adminPinStatus(): Promise<Result<{ hasPin: boolean }>> {
  try {
    await requireWorkspaceAdmin("hr");
  } catch {
    return { ok: false, error: "Admins only." };
  }
  return { ok: true, hasPin: await hasAdminPin() };
}
