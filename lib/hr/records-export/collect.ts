import "server-only";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agreements,
  candidateIntake,
  documentInstances,
  documentSignatures,
  employeeDocuments,
  employees,
  onboardingSubmissions,
} from "@/db/schema";
import { hrFormSubmissions, asHrFormStatus, type HrFormResponse } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import type { FormPdfInput } from "@/lib/hr/forms/pdf";
import { formatDate } from "@/lib/format";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getObjectBytes } from "@/lib/storage/objects";
import { LETTER_DOCTYPE_PREFIX, letterTypeMeta } from "@/lib/hr/letter-types";
import { docTypeMeta, isDossierDocType } from "@/lib/dossier/types";
import { getDocType } from "@/lib/hr/letters/registry";
import { ONBOARDING_SECTIONS, type OnboardingFileRef } from "@/lib/dossier/onboarding-schema";
import { buildCandidateSections, buildOnboardingSections, sectionsToResponses } from "@/lib/hr/record-sections";
import { resolvePersonEmployee } from "@/app/(app)/hr/record/resolve-person";
import { crc32 } from "./zip";
import { fileNameWith, istDay, mimeForExtension, pickExtension, uniqueNames } from "./names";
import type { PersonRef, RecordEntry } from "./types";

/**
 * Everything on file for ONE person, as a flat list of files.
 *
 *   Forms/      every HR form submission, rendered to PDF with the same renderer
 *               as the per-form download (lib/hr/forms/pdf.ts) — plus the
 *               Onboarding and Candidate Intake answers, when those were filled
 *               through the older screens that never indexed a submission.
 *   Documents/  the scans uploaded in the onboarding form (Aadhaar, PAN, address
 *               proof, selfie …), the candidate photo & signature, and every
 *               non-letter dossier document.
 *   Letters/    dossier letters, issued letters (the signed copy when there is
 *               one) and agreements.
 *
 * NO PERMISSION CHECK HERE. The ZIP route and the Drive save both decide who may
 * call this (lib/hr/records-export/access.ts). Keeping the check out lets the
 * scheduled save — which runs with no viewer at all — use the same collector.
 *
 * Nothing is downloaded or rendered until an entry's `load()` is called.
 */

export interface ExportSubject extends PersonRef {
  personalEmail: string | null;
  officialEmail: string | null;
}

/** Resolve an HR Record person id (an employee id, or a candidate-intake id) to the employee. */
export async function resolveExportSubject(personId: string): Promise<ExportSubject | null> {
  const emp = await resolvePersonEmployee(personId);
  if (!emp) return null;
  const [row] = await db
    .select({ isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, emp.id))
    .limit(1);
  if (!row) return null;
  return {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    isActive: row.isActive,
    personalEmail: emp.personalEmail,
    officialEmail: emp.officialEmail,
  };
}

async function renderFormPdf(input: FormPdfInput): Promise<Uint8Array> {
  // Lazy, like the per-form PDF route: pdfkit stays out of every bundle that
  // merely references this module.
  const { renderHrFormPdf } = await import("@/lib/hr/forms/pdf");
  return new Uint8Array(await renderHrFormPdf(input));
}

const fromStorage = (path: string) => () => getObjectBytes(DOCUMENTS_BUCKET, path);

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function collectRecordEntries(subject: ExportSubject): Promise<RecordEntry[]> {
  const emails = [...new Set([subject.email, subject.personalEmail, subject.officialEmail].map((e) => clean(e).toLowerCase()))].filter(
    Boolean,
  );

  // Candidate intake is matched by email, exactly as HR Record's Records card does.
  const intakes = emails.length
    ? await db
        .select({
          id: candidateIntake.id,
          data: candidateIntake.data,
          submittedAt: candidateIntake.submittedAt,
          updatedAt: candidateIntake.updatedAt,
          photoPath: candidateIntake.photoPath,
          signaturePath: candidateIntake.signaturePath,
        })
        .from(candidateIntake)
        .where(inArray(sql`lower(${candidateIntake.email})`, emails))
        .orderBy(desc(candidateIntake.submittedAt), desc(candidateIntake.createdAt))
    : [];
  const intakeIds = intakes.map((i) => i.id);

  const [forms, onboardingRows, docs, instances, agreementRows] = await Promise.all([
    db
      .select({
        id: hrFormSubmissions.id,
        formKey: hrFormSubmissions.formKey,
        formName: hrFormSubmissions.formName,
        section: hrFormSubmissions.section,
        status: hrFormSubmissions.status,
        responses: hrFormSubmissions.responses,
        submittedAt: hrFormSubmissions.submittedAt,
        updatedAt: hrFormSubmissions.updatedAt,
        candidateIntakeId: hrFormSubmissions.candidateIntakeId,
      })
      .from(hrFormSubmissions)
      .where(
        intakeIds.length
          ? or(eq(hrFormSubmissions.employeeId, subject.id), inArray(hrFormSubmissions.candidateIntakeId, intakeIds))
          : eq(hrFormSubmissions.employeeId, subject.id),
      ),
    db
      .select({
        fields: onboardingSubmissions.fields,
        files: onboardingSubmissions.files,
        status: onboardingSubmissions.status,
        submittedAt: onboardingSubmissions.submittedAt,
        updatedAt: onboardingSubmissions.updatedAt,
      })
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.employeeId, subject.id))
      .limit(1),
    db
      .select({
        id: employeeDocuments.id,
        docType: employeeDocuments.docType,
        title: employeeDocuments.title,
        effectiveDate: employeeDocuments.effectiveDate,
        storagePath: employeeDocuments.storagePath,
        fileName: employeeDocuments.fileName,
        mimeType: employeeDocuments.mimeType,
        updatedAt: employeeDocuments.updatedAt,
      })
      .from(employeeDocuments)
      .where(and(eq(employeeDocuments.employeeId, subject.id), eq(employeeDocuments.archived, false))),
    db
      .select({
        id: documentInstances.id,
        typeKey: documentInstances.typeKey,
        renderedPdfPath: documentInstances.renderedPdfPath,
        issuedAt: documentInstances.issuedAt,
        createdAt: documentInstances.createdAt,
      })
      .from(documentInstances)
      .where(eq(documentInstances.employeeId, subject.id)),
    db
      .select({
        id: agreements.id,
        title: agreements.title,
        pdfPath: agreements.pdfPath,
        signedPdfPath: agreements.signedPdfPath,
        signedAt: agreements.signedAt,
        createdAt: agreements.createdAt,
      })
      .from(agreements)
      .where(eq(agreements.employeeId, subject.id)),
  ]);

  // The newest signed copy of each issued letter, the same rule as the docket.
  const signedByInstance = new Map<string, string>();
  if (instances.length) {
    const sigs = await db
      .select({ docId: documentSignatures.docId, signedPdfPath: documentSignatures.signedPdfPath })
      .from(documentSignatures)
      .where(
        and(
          inArray(
            documentSignatures.docId,
            instances.map((i) => i.id),
          ),
          eq(documentSignatures.docKind, "letter"),
          eq(documentSignatures.status, "signed"),
          isNotNull(documentSignatures.signedPdfPath),
        ),
      )
      .orderBy(desc(documentSignatures.signedAt), desc(documentSignatures.createdAt));
    for (const s of sigs) if (s.signedPdfPath && !signedByInstance.has(s.docId)) signedByInstance.set(s.docId, s.signedPdfPath);
  }

  const entries: RecordEntry[] = [];

  // ── Forms ────────────────────────────────────────────────────────────────
  for (const f of forms) {
    const status = asHrFormStatus(f.status);
    const day = istDay(f.submittedAt ?? f.updatedAt);
    const title = status === "draft" ? `${f.formName} (Draft)` : day ? `${f.formName} - ${day}` : f.formName;
    entries.push({
      key: `form:${f.id}`,
      folder: "Forms",
      name: fileNameWith(title, ".pdf", "Form"),
      mime: "application/pdf",
      version: `${status}|${f.updatedAt.toISOString()}`,
      load: () =>
        renderFormPdf({
          formName: f.formName,
          sectionLabel: hrSectionLabel(f.section),
          employeeName: subject.name,
          submittedOn: formatDate(f.submittedAt ?? f.updatedAt),
          status,
          responses: (f.responses ?? []) as HrFormResponse[],
        }),
    });
  }

  // ── Onboarding form: answers (unless already indexed above) + uploaded scans ──
  const onboarding = onboardingRows[0];
  if (onboarding) {
    const fields = (onboarding.fields as Record<string, unknown>) ?? {};
    const files = (onboarding.files as Record<string, OnboardingFileRef>) ?? {};
    if (!forms.some((f) => f.formKey === "onboarding")) {
      const draft = onboarding.status !== "submitted";
      entries.push({
        key: "onboarding-form",
        folder: "Forms",
        name: draft ? "Onboarding Form (Draft).pdf" : "Onboarding Form.pdf",
        mime: "application/pdf",
        version: `onboarding|${onboarding.status}|${onboarding.updatedAt.toISOString()}`,
        load: () =>
          renderFormPdf({
            formName: "Onboarding Form",
            sectionLabel: hrSectionLabel("pre-joining"),
            employeeName: subject.name,
            submittedOn: formatDate(onboarding.submittedAt ?? onboarding.updatedAt),
            status: draft ? "draft" : "submitted",
            responses: sectionsToResponses(buildOnboardingSections(fields, files)),
          }),
      });
    }

    const links: string[] = [];
    for (const section of ONBOARDING_SECTIONS) {
      for (const field of section.fields) {
        if (field.type !== "file") continue;
        const ref = files[field.key];
        if (ref?.path) {
          const ext = pickExtension({ fileName: ref.fileName, path: ref.path, mime: ref.mime });
          entries.push({
            key: `onboarding-file:${field.key}`,
            folder: "Documents",
            name: fileNameWith(field.label, ext, "Document"),
            mime: ref.mime || mimeForExtension(ext),
            version: ref.path,
            load: fromStorage(ref.path),
          });
        } else if (ref?.link) {
          links.push(`${field.label}: ${ref.link}`);
        }
      }
    }
    if (links.length) {
      // Some people share a Google Drive link instead of uploading. The link is
      // all the app holds, so it is written down rather than silently dropped.
      // BOM so Notepad reads names and links as UTF-8 rather than guessing ANSI.
      const text = `﻿Documents ${subject.name} shared as links in the onboarding form:\r\n\r\n${links.join("\r\n")}\r\n`;
      const bytes = new TextEncoder().encode(text);
      entries.push({
        key: "onboarding-links",
        folder: "Documents",
        name: "Onboarding document links.txt",
        mime: "text/plain",
        version: `links|${crc32(bytes)}`,
        load: async () => bytes,
      });
    }
  }

  // ── Candidate intake: answers (unless indexed) + photo & signature ────────
  for (const intake of intakes) {
    const indexed = forms.some((f) => f.formKey === "candidate-intake" && f.candidateIntakeId === intake.id);
    const data = (intake.data as Record<string, unknown>) ?? {};
    if (!indexed && (intake.submittedAt || Object.keys(data).length > 0)) {
      entries.push({
        key: `candidate-intake:${intake.id}`,
        folder: "Forms",
        name: intake.submittedAt ? "Candidate Intake Form.pdf" : "Candidate Intake Form (Draft).pdf",
        mime: "application/pdf",
        version: `intake|${intake.updatedAt.toISOString()}`,
        load: () =>
          renderFormPdf({
            formName: "Candidate Intake Form",
            sectionLabel: hrSectionLabel("pre-interview"),
            employeeName: subject.name,
            submittedOn: formatDate(intake.submittedAt ?? intake.updatedAt),
            status: intake.submittedAt ? "submitted" : "draft",
            responses: sectionsToResponses(buildCandidateSections(data)),
          }),
      });
    }
    for (const [path, label, kind] of [
      [intake.photoPath, "Candidate Photo", "photo"],
      [intake.signaturePath, "Candidate Signature", "signature"],
    ] as const) {
      if (!path) continue;
      const ext = pickExtension({ path });
      entries.push({
        key: `candidate-${kind}:${intake.id}`,
        folder: "Documents",
        name: fileNameWith(label, ext, label),
        mime: mimeForExtension(ext),
        version: path,
        load: fromStorage(path),
      });
    }
  }

  // ── Dossier documents and letters ────────────────────────────────────────
  // Letters = the HR letters library (letter_*) PLUS the dossier's letter-type
  // documents — HR looks for an appointment letter under Letters, not among the
  // ID scans. Only "onboarding" and "other" dossier uploads go to Documents.
  const dossierLetterTypes = new Set(["appointment", "probation_end", "ctc_breakup", "increment", "confidentiality_1", "confidentiality_2"]);
  for (const d of docs) {
    const isLetter = d.docType.startsWith(LETTER_DOCTYPE_PREFIX) || dossierLetterTypes.has(d.docType);
    const fallbackTitle = isLetter
      ? letterTypeMeta(d.docType).label
      : isDossierDocType(d.docType)
        ? docTypeMeta(d.docType).label
        : "Document";
    const ext = pickExtension({ fileName: d.fileName, path: d.storagePath, mime: d.mimeType });
    const title = clean(d.title) || fallbackTitle;
    entries.push({
      key: `empdoc:${d.id}`,
      folder: isLetter ? "Letters" : "Documents",
      name: fileNameWith(d.effectiveDate ? `${title} - ${d.effectiveDate}` : title, ext, fallbackTitle),
      mime: d.mimeType || mimeForExtension(ext),
      version: `${d.storagePath}|${d.updatedAt.toISOString()}`,
      load: fromStorage(d.storagePath),
    });
  }

  for (const inst of instances) {
    const signed = signedByInstance.get(inst.id) ?? null;
    const path = signed ?? inst.renderedPdfPath;
    if (!path) continue;
    const title = getDocType(inst.typeKey)?.title ?? inst.typeKey;
    const day = istDay(inst.issuedAt ?? inst.createdAt);
    entries.push({
      key: `letter-doc:${inst.id}`,
      folder: "Letters",
      name: fileNameWith(`${title}${signed ? " (Signed)" : ""}${day ? ` - ${day}` : ""}`, ".pdf", "Letter"),
      mime: "application/pdf",
      version: path,
      load: fromStorage(path),
    });
  }

  for (const a of agreementRows) {
    const path = a.signedPdfPath ?? a.pdfPath;
    if (!path) continue;
    const day = istDay(a.signedAt ?? a.createdAt);
    entries.push({
      key: `agreement:${a.id}`,
      folder: "Letters",
      name: fileNameWith(`${clean(a.title) || "Agreement"}${a.signedPdfPath ? " (Signed)" : ""}${day ? ` - ${day}` : ""}`, ".pdf", "Agreement"),
      mime: "application/pdf",
      version: path,
      load: fromStorage(path),
    });
  }

  return uniqueNames(entries);
}
