"use server";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireHrStaff } from "@/lib/hr/access";
import { hrFormSubmissions, asHrFormStatus } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import { employeeFormEditHref, hrFormModuleHref } from "@/lib/hr/forms/edit-href";
import { listMyLetters } from "@/lib/hr/sections";
import { resolvePersonEmployee } from "./resolve-person";
import {
  EMPTY_PERSON_FILES,
  type FiledFormRow,
  type LetterFileRow,
  type PersonFiles,
} from "./person-files-types";

/**
 * Everything SAVED for one person that an admin should be able to open: their
 * indexed HR form submissions and the letters already issued to them.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * HR Record could tell you a form's STATUS and nothing else. "Submitted" is not
 * a record — an admin correcting a bank account or checking an address had to
 * leave, guess which module owns the form, and find the person again. This turns
 * each status into something openable.
 *
 * ── THE SUBJECT IS ALWAYS THE SELECTED PERSON ──────────────────────────────
 * Every query below is keyed on the id `resolvePersonEmployee` returned for the
 * person on screen. The session decides only whether the caller is ALLOWED to
 * look; it never decides WHOSE record is read. That separation is the whole
 * point: the failure mode this replaces is an admin opening their own form,
 * editing it, and believing they fixed someone else's.
 *
 * HR-gated and fail-soft: any auth failure or query error degrades to empty, so
 * the card shows "nothing on file" rather than taking the page down.
 */

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Newest-first, drafts (which have no submitted_at) after submitted rows. */
const FORMS_LIMIT = 100;

export async function getPersonFiles(personId: string): Promise<PersonFiles> {
  try {
    await requireHrStaff();
  } catch {
    return EMPTY_PERSON_FILES;
  }
  if (!isUuid(personId)) return EMPTY_PERSON_FILES;

  try {
    const emp = await resolvePersonEmployee(personId);
    if (!emp) return EMPTY_PERSON_FILES;

    // Both reads are scoped to emp.id and neither depends on the other.
    const [subs, letters] = await Promise.all([
      db
        .select({
          id: hrFormSubmissions.id,
          formKey: hrFormSubmissions.formKey,
          formName: hrFormSubmissions.formName,
          section: hrFormSubmissions.section,
          status: hrFormSubmissions.status,
          submittedAt: hrFormSubmissions.submittedAt,
          updatedAt: hrFormSubmissions.updatedAt,
        })
        .from(hrFormSubmissions)
        .where(eq(hrFormSubmissions.employeeId, emp.id))
        // NULLS LAST for the same reason All Filled Forms spells it out: Postgres
        // defaults DESC to NULLS FIRST, which floats every draft above the
        // submitted rows in a list captioned "newest first", and only this form
        // of the ordering can be served by hr_form_submissions_employee_idx.
        .orderBy(
          sql`${hrFormSubmissions.submittedAt} desc nulls last`,
          desc(hrFormSubmissions.updatedAt),
        )
        .limit(FORMS_LIMIT),
      // Letters are dossier rows with a `letter_` docType; this reader already
      // signs each storage path, so the rows come back openable.
      listMyLetters(emp.id).catch(() => []),
    ]);

    const forms: FiledFormRow[] = subs.map((r) => ({
      id: r.id,
      formKey: r.formKey,
      formName: r.formName,
      sectionLabel: hrSectionLabel(r.section),
      status: asHrFormStatus(r.status),
      dateIso: (r.submittedAt ?? r.updatedAt)?.toISOString() ?? null,
      viewHref: `/hr/forms/${r.id}`,
      // Employee-scoped or nothing — see employeeFormEditHref for why a link
      // that omits the id is worse than no link at all.
      editHref: employeeFormEditHref(r.formKey, emp.id),
      moduleHref: hrFormModuleHref(r.formKey),
    }));

    const letterRows: LetterFileRow[] = letters.map((l) => ({
      id: l.id,
      title: l.title,
      label: l.letterLabel,
      dateIso: l.effectiveDate,
      signedUrl: l.signedUrl,
    }));

    return { matched: true, employeeId: emp.id, forms, letters: letterRows };
  } catch {
    return EMPTY_PERSON_FILES;
  }
}
