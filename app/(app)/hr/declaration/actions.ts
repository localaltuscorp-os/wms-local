"use server";

import { randomUUID } from "node:crypto";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { declarationCompliance, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET, storageErrorMessage } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";
import { safeFileName, validateUploadMeta } from "@/lib/hr/upload";
import { isMissingRegisterTable } from "@/lib/hr/registers-server";
import { DECLARATION_VERSION } from "@/lib/hr/letters/templates/declaration";
import { requireDeclarationAdmin, requireScanReader } from "@/lib/hr/declaration/guard";

/**
 * THE SIGNED DECLARATION — every write, and every read of a scan.
 *
 * Authorization is NOT inherited from the page that calls these. Each export
 * calls a guard from lib/hr/declaration/guard.ts again, because a server action
 * is a public endpoint: whoever can POST to it reaches it whether or not the
 * page that normally calls it would ever have rendered for them.
 */

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The storage prefix. Written once, because two callers spelling it differently
 * is exactly how a scan ends up outside the folder the readers look in.
 */
const scanPrefix = (employeeId: string) => `hr-declaration/${employeeId}/`;

/**
 * Has migration 0239 not been applied yet?
 *
 * Reuses the register's detector, which reads the POSTGRES ERROR CODE (42P01
 * undefined_table / 42703 undefined_column) off the error or its `cause`. An
 * earlier version of this matched on the message text and silently never fired:
 * drizzle wraps the driver error, so `err.message` is the literal SQL under a
 * "Failed query:" prefix and says nothing about what went wrong. The code is on
 * the cause.
 */
const isMissingTable = isMissingRegisterTable;

const MIGRATION_HINT =
  "The declaration register is not set up yet - run db/RUN-IN-SUPABASE-0239.sql in Supabase.";

function failed(err: unknown, fallback: string): { ok: false; error: string } {
  if (isMissingTable(err)) return { ok: false, error: MIGRATION_HINT };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/* ------------------------------------------------------------------ */
/* Reading the tracker                                                  */
/* ------------------------------------------------------------------ */

export interface DeclarationStatusRow {
  employeeId: string;
  name: string;
  /** The in-app acknowledgement. */
  acknowledgedAt: Date | null;
  /** The wet-signed scan. */
  hasScan: boolean;
  scanFileName: string | null;
  uploadedByName: string | null;
  uploadedAt: Date | null;
}

/**
 * Every ACTIVE employee and what they have done - LEFT-joined, so the people who
 * have done nothing still appear.
 *
 * That is the whole point of the screen. The brief is "all employees, no
 * exception", and an inner join would quietly report perfect compliance by
 * listing only the compliant. Same shape as `listConsentStatus` in
 * lib/queries/salary-policy.ts, for the same reason.
 *
 * Joined on the current DECLARATION_VERSION, so re-wording the declaration
 * correctly shows everybody as outstanding again rather than grandfathering
 * signatures given against different words.
 */
export async function listDeclarationStatus(): Promise<
  R<{ rows: DeclarationStatusRow[]; version: string }>
> {
  try {
    await requireDeclarationAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden." };
  }

  // A second reference to `employees` for the uploader's name - the same table
  // twice in one query needs an alias or the join is ambiguous.
  const uploader = alias(employees, "uploader");

  try {
    const rows = await db
      .select({
        employeeId: employees.id,
        name: employees.name,
        acknowledgedAt: declarationCompliance.acknowledgedAt,
        scanPath: declarationCompliance.scanPath,
        scanFileName: declarationCompliance.scanFileName,
        uploadedAt: declarationCompliance.uploadedAt,
        uploadedByName: uploader.name,
      })
      .from(employees)
      .leftJoin(
        declarationCompliance,
        and(
          eq(declarationCompliance.employeeId, employees.id),
          eq(declarationCompliance.version, DECLARATION_VERSION),
        ),
      )
      .leftJoin(uploader, eq(declarationCompliance.uploadedById, uploader.id))
      .where(eq(employees.isActive, true))
      .orderBy(asc(sql`lower(${employees.name})`));

    return {
      ok: true,
      version: DECLARATION_VERSION,
      rows: rows.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        acknowledgedAt: r.acknowledgedAt ?? null,
        hasScan: Boolean(r.scanPath),
        scanFileName: r.scanFileName ?? null,
        uploadedByName: r.uploadedByName ?? null,
        uploadedAt: r.uploadedAt ?? null,
      })),
    };
  } catch (err) {
    return failed(err, "Could not read the register.");
  }
}

/* ------------------------------------------------------------------ */
/* The employee's own acknowledgement                                   */
/* ------------------------------------------------------------------ */

/**
 * The "digital" half: the employee confirming on screen that they have read the
 * declaration and agree to it.
 *
 * It does NOT replace the physical signature, and the button that calls it says
 * so. This records only that they read and agreed in the app.
 *
 * Anyone signed in may do this FOR THEMSELVES ONLY - the employee id is taken
 * from the session and never accepted from the caller.
 */
export async function acknowledgeDeclaration(): Promise<R> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const now = new Date();
  try {
    await db
      .insert(declarationCompliance)
      .values({ employeeId: me.id, version: DECLARATION_VERSION, acknowledgedAt: now })
      .onConflictDoUpdate({
        target: [declarationCompliance.employeeId, declarationCompliance.version],
        // ONLY the acknowledgement. Re-confirming must never clear a scan that
        // has already been filed against this person.
        set: { acknowledgedAt: now, updatedAt: now },
      });
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not record that.");
  }
}

/** What the signed-in person has done, for their own page. */
export async function myDeclarationState(): Promise<
  R<{ acknowledgedAt: Date | null; hasScan: boolean; scanFileName: string | null; version: string }>
> {
  const me = await requireUser();
  try {
    const [row] = await db
      .select({
        acknowledgedAt: declarationCompliance.acknowledgedAt,
        scanPath: declarationCompliance.scanPath,
        scanFileName: declarationCompliance.scanFileName,
      })
      .from(declarationCompliance)
      .where(
        and(
          eq(declarationCompliance.employeeId, me.id),
          eq(declarationCompliance.version, DECLARATION_VERSION),
        ),
      )
      .limit(1);

    return {
      ok: true,
      version: DECLARATION_VERSION,
      acknowledgedAt: row?.acknowledgedAt ?? null,
      hasScan: Boolean(row?.scanPath),
      scanFileName: row?.scanFileName ?? null,
    };
  } catch (err) {
    return failed(err, "Could not read that.");
  }
}

/* ------------------------------------------------------------------ */
/* Uploading the scan                                                   */
/* ------------------------------------------------------------------ */

/**
 * Mint a one-shot signed upload URL so the BROWSER sends the scan straight to
 * Supabase, never through the Server Action body - Next caps those at 1 MB, and
 * a phone photograph of a signed page is routinely larger than that.
 *
 * The path is built HERE. The client chooses neither the bucket nor the folder,
 * so it cannot land a file in somebody else's prefix.
 */
export async function mintDeclarationScanUrl(
  employeeId: string,
  input: { fileName: string; mime?: string | null; size?: number | null },
): Promise<R<{ path: string; token: string; bucket: string }>> {
  let me;
  try {
    me = await requireDeclarationAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const valid = validateUploadMeta(input);
  if (!valid.ok) return valid;

  const path = `${scanPrefix(employeeId)}${randomUUID()}/${safeFileName(input.fileName)}`;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, error: storageErrorMessage(error?.message ?? "Could not start upload.") };
    }
    return { ok: true, path, token: data.token, bucket: DOCUMENTS_BUCKET };
  } catch (err) {
    return failed(err, "Could not start upload.");
  }
}

/**
 * Record the uploaded scan against the person.
 *
 * The returned path is RE-VALIDATED against the prefix this server would have
 * minted. The upload URL was signed, but the reference travels back through the
 * client, and a reference is not proof of where the bytes actually went.
 */
export async function saveDeclarationScan(
  employeeId: string,
  ref: { path: string; fileName: string; mime?: string | null; size?: number | null },
): Promise<R> {
  let me;
  try {
    me = await requireDeclarationAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  if (!ref?.path || !ref.path.startsWith(scanPrefix(employeeId))) {
    return { ok: false, error: "That file was not uploaded to this person's folder." };
  }

  const now = new Date();
  const name = safeFileName(ref.fileName);
  try {
    await db
      .insert(declarationCompliance)
      .values({
        employeeId,
        version: DECLARATION_VERSION,
        scanPath: ref.path,
        scanFileName: name,
        scanMime: ref.mime ?? null,
        scanSizeBytes: ref.size ?? null,
        uploadedById: me.id,
        uploadedAt: now,
      })
      .onConflictDoUpdate({
        target: [declarationCompliance.employeeId, declarationCompliance.version],
        // Replaces a previous scan - a re-scan of the same sheet - but leaves
        // the employee's own acknowledgement alone. That is their record, not
        // the uploader's to overwrite.
        set: {
          scanPath: ref.path,
          scanFileName: name,
          scanMime: ref.mime ?? null,
          scanSizeBytes: ref.size ?? null,
          uploadedById: me.id,
          uploadedAt: now,
          updatedAt: now,
        },
      });
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not save that.");
  }
}

/**
 * A short-lived link to one person's scan.
 *
 * Guarded by `requireScanReader`: the custodians, or the employee looking at
 * their own. The bucket is private, so a signed URL is the only way in - and it
 * is minted only after the predicate has said yes. Five minutes is plenty to
 * open a PDF and short enough that a copied link is not a standing grant.
 */
export async function openDeclarationScan(employeeId: string): Promise<R<{ url: string }>> {
  try {
    await requireScanReader(employeeId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden." };
  }

  try {
    const [row] = await db
      .select({ scanPath: declarationCompliance.scanPath })
      .from(declarationCompliance)
      .where(
        and(
          eq(declarationCompliance.employeeId, employeeId),
          eq(declarationCompliance.version, DECLARATION_VERSION),
        ),
      )
      .limit(1);
    if (!row?.scanPath) return { ok: false, error: "No signed copy has been filed yet." };

    const url = await createSignedObjectUrl(DOCUMENTS_BUCKET, row.scanPath, 300);
    if (!url) return { ok: false, error: "Could not open that file." };
    return { ok: true, url };
  } catch (err) {
    return failed(err, "Could not open that file.");
  }
}
