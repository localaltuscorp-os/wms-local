import type { PGlite } from "@electric-sql/pglite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DUMMY_STORAGE_DIR } from "../lib/db/dummy-dir";
import { crc32 } from "../lib/hr/records-export/zip";

/**
 * Dummy HR records for DUMMY MODE — so the per-person ZIP and the Google Drive
 * backup can be tried end to end on a laptop.
 *
 * Every row points at a file that is really written to `.dummy-storage/documents`
 * (generated PDFs and PNG "scans"), except ONE deliberately missing file on the
 * former employee, which is how the "could not be included" path gets exercised.
 *
 *   Asha Kulkarni   onboarding form + Aadhaar/PAN/address/selfie scans, a CTC
 *                   breakup form, a KPI draft, appointment/CTC/NDA documents and
 *                   two increment letters (same title → de-duplicated names)
 *   Ravi Deshpande  candidate intake with photo + signature, management
 *                   assessment + candidate evaluation, a salary certificate
 *                   shared as a LINK (written to a .txt, not dropped)
 *   Kavya Menon     FORMER employee (inactive): exit interview + handover,
 *                   relieving & experience letters, one missing file
 *   Everyone else   nothing on file — the empty state
 *
 * Nobody real. Idempotent: fixed ids, `on conflict do nothing`, files overwritten.
 */

const KAVYA = "00000000-0000-4000-8000-000000000007";

const id = (group: string, n: number) => `00000000-0000-4000-${group}-${String(n).padStart(12, "0")}`;

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(11, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function put(path: string, bytes: Uint8Array): Promise<number> {
  const full = join(DUMMY_STORAGE_DIR, "documents", path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return bytes.length;
}

/** A one-page A4 PDF. WinAnsi text only (pdf-lib's standard fonts). */
async function pdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("ALTUS CORP", { x: 56, y: 780, size: 10, font: bold, color: rgb(0.88, 0.02, 0) });
  page.drawText(title, { x: 56, y: 748, size: 20, font: bold, color: rgb(0.09, 0.09, 0.11) });
  page.drawText("DUMMY DOCUMENT - generated for testing, not a real record.", {
    x: 56, y: 724, size: 9.5, font, color: rgb(0.45, 0.45, 0.5),
  });
  lines.forEach((line, i) => page.drawText(line, { x: 56, y: 686 - i * 20, size: 11.5, font, color: rgb(0.2, 0.2, 0.24) }));
  return doc.save();
}

/** A small RGB PNG drawn pixel by pixel — enough to look like a card scan. */
function png(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** An ID-card-looking scan: header band in `accent`, a photo box, grey text bars. */
function cardScan(accent: [number, number, number]): Uint8Array {
  return png(420, 260, (x, y) => {
    if (x < 6 || y < 6 || x > 413 || y > 253) return [200, 200, 205];
    if (y < 52) return accent;
    if (x > 24 && x < 124 && y > 76 && y < 206) return [214, 211, 209];
    const bar = (top: number, right: number) => y > top && y < top + 12 && x > 148 && x < right;
    if (bar(84, 360) || bar(116, 320) || bar(148, 390) || bar(180, 280)) return [150, 150, 158];
    return [247, 246, 243];
  });
}

function signature(): Uint8Array {
  return png(300, 110, (x, y) => {
    const wave = 55 + Math.round(22 * Math.sin(x / 17) * Math.cos(x / 41));
    return Math.abs(y - wave) < 2 && x > 20 && x < 280 ? [30, 41, 99] : [255, 255, 255];
  });
}

export async function seedDummyHrRecords(
  pg: PGlite,
  who: { admin: string; asha: string; ravi: string },
): Promise<Record<string, number>> {
  // A former employee, so "current and former" is visibly both.
  await pg.query(
    `insert into employees (id, name, email, role, is_admin, is_active, joined_at)
     values ($1, 'Kavya Menon', 'kavya@example.invalid', 'doer'::employee_role, false, false, now() - interval '700 days')
     on conflict (id) do nothing`,
    [KAVYA],
  );

  // ── Files on disk ─────────────────────────────────────────────────────────
  const files: Record<string, { path: string; size: number; name: string; mime: string }> = {};
  const file = async (key: string, path: string, name: string, mime: string, bytes: Uint8Array | Promise<Uint8Array>) => {
    files[key] = { path, name, mime, size: await put(path, await bytes) };
  };
  const onb = (emp: string, field: string, name: string) => `dossier/onboarding/${emp}/${field}-seed/${name}`;

  await file("ashaAadhaar", onb(who.asha, "aadharCopy", "aadhaar-front.png"), "aadhaar-front.png", "image/png", cardScan([37, 99, 235]));
  await file("ashaPan", onb(who.asha, "panCopy", "pan-card.pdf"), "pan-card.pdf", "application/pdf",
    pdf("PAN Card (scan)", ["Name: Asha Kulkarni", "Permanent Account Number: ABCDE1234F (dummy)"]));
  await file("ashaAddress", onb(who.asha, "addressProof", "electricity-bill.png"), "electricity-bill.png", "image/png", cardScan([22, 163, 74]));
  await file("ashaSelfie", onb(who.asha, "latestSelfie", "selfie.png"), "selfie.png", "image/png", cardScan([217, 119, 6]));
  await file("ravAadhaar", onb(who.ravi, "aadharCopy", "aadhaar.png"), "aadhaar.png", "image/png", cardScan([124, 58, 237]));
  await file("ravPan", onb(who.ravi, "panCopy", "pan.pdf"), "pan.pdf", "application/pdf",
    pdf("PAN Card (scan)", ["Name: Ravi Deshpande", "Permanent Account Number: PQRSX9876K (dummy)"]));
  await file("kavAadhaar", onb(KAVYA, "aadharCopy", "aadhaar.png"), "aadhaar.png", "image/png", cardScan([190, 18, 60]));

  const doc = (emp: string, type: string, name: string) => `dossier/${emp}/${type}/seed/${name}`;
  await file("ashaAppt", doc(who.asha, "appointment", "appointment-letter.pdf"), "appointment-letter.pdf", "application/pdf",
    pdf("Appointment Letter", ["To: Asha Kulkarni", "Designation: Manager, Operations", "Date of joining: 1 April 2025"]));
  await file("ashaCtc", doc(who.asha, "ctc_breakup", "ctc.pdf"), "ctc.pdf", "application/pdf",
    pdf("Salary CTC Breakup", ["Annual CTC: Rs 9,60,000", "Basic: Rs 40,000 / month", "HRA: Rs 16,000 / month"]));
  await file("ashaNda", doc(who.asha, "confidentiality_1", "nda.pdf"), "nda.pdf", "application/pdf",
    pdf("Confidentiality Agreement", ["Between Altus Corp and Asha Kulkarni", "Signed electronically (dummy)"]));
  await file("ashaInc1", doc(who.asha, "letter_increment", "increment-2025.pdf"), "increment-2025.pdf", "application/pdf",
    pdf("Increment Letter", ["Revised CTC effective 1 April 2025"]));
  await file("ashaInc2", doc(who.asha, "letter_increment", "increment-2026.pdf"), "increment-2026.pdf", "application/pdf",
    pdf("Increment Letter", ["Revised CTC effective 1 April 2026"]));
  await file("ravPhoto", `candidates/${id("8013", 1)}/photo.png`, "photo.png", "image/png", cardScan([15, 118, 110]));
  await file("ravSign", `candidates/${id("8013", 1)}/signature.png`, "signature.png", "image/png", signature());
  await file("kavAppt", doc(KAVYA, "appointment", "appointment.pdf"), "appointment.pdf", "application/pdf",
    pdf("Appointment Letter", ["To: Kavya Menon", "Designation: Executive, Finance"]));
  await file("kavReliev", doc(KAVYA, "letter_relieving", "relieving.pdf"), "relieving.pdf", "application/pdf",
    pdf("Relieving Letter", ["Kavya Menon is relieved of her duties with effect from 31 August 2026."]));
  await file("kavExp", doc(KAVYA, "letter_experience", "experience.pdf"), "experience.pdf", "application/pdf",
    pdf("Experience Letter", ["Kavya Menon worked with Altus Corp from 2024 to 2026."]));

  // ── Onboarding submissions (answers + file refs) ──────────────────────────
  const ref = (k: string) => ({ path: files[k]!.path, fileName: files[k]!.name, mime: files[k]!.mime, size: files[k]!.size });
  const onboarding: [string, string, Record<string, string>, Record<string, unknown>][] = [
    [id("8011", 1), who.asha,
      { firstName: "Asha", lastName: "Kulkarni", phone: "98200 00001", fatherName: "Suresh Kulkarni", motherName: "Lata Kulkarni", lastCompanyName: "Deccan Foods", lastDesignation: "Assistant Manager" },
      { aadharCopy: ref("ashaAadhaar"), panCopy: ref("ashaPan"), addressProof: ref("ashaAddress"), latestSelfie: ref("ashaSelfie") }],
    [id("8011", 2), who.ravi,
      { firstName: "Ravi", lastName: "Deshpande", phone: "98200 00002", fatherName: "Anil Deshpande" },
      { aadharCopy: ref("ravAadhaar"), panCopy: ref("ravPan"), lastSalaryCertificate: { link: "https://drive.google.com/file/d/dummy-salary-certificate", fileName: "Salary certificate (Drive link)" } }],
    [id("8011", 3), KAVYA,
      { firstName: "Kavya", lastName: "Menon", phone: "98200 00007" },
      { aadharCopy: ref("kavAadhaar") }],
  ];
  for (const [rowId, emp, fields, fileRefs] of onboarding) {
    await pg.query(
      `insert into onboarding_submissions (id, employee_id, fields, files, status, submitted_at, created_by_id)
       values ($1,$2,$3,$4,'submitted',$5,$2) on conflict do nothing`,
      [rowId, emp, JSON.stringify(fields), JSON.stringify(fileRefs), daysAgo(160)],
    );
  }

  // ── Indexed HR form submissions ───────────────────────────────────────────
  const r = (group: string, question: string, answer: string) => ({ group, question, answer });
  const forms: [string, string, string, string, string, string, unknown[], number][] = [
    [id("8010", 1), "ctc-breakup", "CTC Breakup", "pre-joining", who.asha, "submitted",
      [r("Employee", "Name", "Asha Kulkarni"), r("Salary", "Annual CTC", "Rs 9,60,000"), r("Salary", "Basic (monthly)", "Rs 40,000"), r("Salary", "HRA (monthly)", "Rs 16,000")], 150],
    [id("8010", 2), "kpi-assignment", "KPI Assignment", "during", who.asha, "draft",
      [r("KPIs", "Dispatch turnaround", "Under 24 hours"), r("KPIs", "Vendor escalations closed", "")], 3],
    [id("8010", 3), "management-assessment", "Management Assessment", "post-interview", who.ravi, "submitted",
      [r("Assessment", "Communication", "Good"), r("Assessment", "Outcome", "Selected"), r("Notes", "Comments", "Strong on logistics, needs Excel training.")], 220],
    [id("8010", 4), "candidate-evaluation-v2", "Candidate Evaluation", "post-interview", who.ravi, "submitted",
      [r("Interviewer", "Overall rating", "4 / 5"), r("Interviewer", "Recommendation", "Hire")], 225],
    [id("8010", 5), "exit-interview", "Exit Interview", "exit", KAVYA, "submitted",
      [r("Exit", "Reason for leaving", "Higher studies"), r("Exit", "Would you rejoin?", "Yes"), r("Feedback", "What should we improve?", "Clearer appraisal timelines.")], 20],
    [id("8010", 6), "exit-handover", "Exit Handover", "exit", KAVYA, "submitted",
      [r("Handover", "Laptop returned", "Yes"), r("Handover", "Access revoked", "Yes"), r("Handover", "Handed over to", "Meera Iyer")], 18],
  ];
  for (const [rowId, key, name, section, emp, status, responses, ago] of forms) {
    await pg.query(
      `insert into hr_form_submissions
         (id, form_key, form_name, section, employee_id, submitted_by_id, status, responses, submitted_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) on conflict do nothing`,
      [rowId, key, name, section, emp, who.admin, status, JSON.stringify(responses), status === "submitted" ? daysAgo(ago) : null, daysAgo(ago)],
    );
  }

  // ── Dossier documents and letters ─────────────────────────────────────────
  const docs: [string, string, string, string, string | null, string][] = [
    [id("8012", 1), who.asha, "appointment", "Appointment Letter", "2025-04-01", "ashaAppt"],
    [id("8012", 2), who.asha, "ctc_breakup", "Salary CTC Breakup", "2025-04-01", "ashaCtc"],
    [id("8012", 3), who.asha, "confidentiality_1", "Confidentiality Letter I", null, "ashaNda"],
    [id("8012", 4), who.asha, "letter_increment", "Increment Letter", "2025-04-01", "ashaInc1"],
    [id("8012", 5), who.asha, "letter_increment", "Increment Letter", "2026-04-01", "ashaInc2"],
    [id("8012", 6), KAVYA, "appointment", "Appointment Letter", "2024-06-10", "kavAppt"],
    [id("8012", 7), KAVYA, "letter_relieving", "Relieving Letter", "2026-08-31", "kavReliev"],
    [id("8012", 8), KAVYA, "letter_experience", "Experience Letter", "2026-08-31", "kavExp"],
  ];
  for (const [rowId, emp, type, title, date, fileKey] of docs) {
    const f = files[fileKey]!;
    await pg.query(
      `insert into employee_documents (id, employee_id, doc_type, title, effective_date, storage_path, file_name, mime_type, size_bytes, uploaded_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
      [rowId, emp, type, title, date, f.path, f.name, f.mime, f.size, who.admin],
    );
  }
  // The deliberately missing file: a row whose object was never uploaded.
  await pg.query(
    `insert into employee_documents (id, employee_id, doc_type, title, storage_path, file_name, mime_type, uploaded_by_id)
     values ($1,$2,'other','Address Proof (old)',$3,'address-proof.pdf','application/pdf',$4) on conflict do nothing`,
    [id("8012", 9), KAVYA, `dossier/${KAVYA}/other/seed/never-uploaded.pdf`, who.admin],
  );

  // ── Candidate intake, matched to Ravi by email ────────────────────────────
  await pg.query(
    `insert into candidate_intake (id, position_applied, full_name, mobile, email, status, data, submitted_at, photo_path, signature_path)
     values ($1,'Dispatch Executive','Ravi Deshpande','98200 00002','ravi@example.invalid','hired',$2,$3,$4,$5)
     on conflict do nothing`,
    [
      id("8013", 1),
      JSON.stringify({ "personal.fullName": "Ravi Deshpande", "personal.dob": "1996-03-14", "jobDetails.position": "Dispatch Executive", "jobDetails.department": "Operations" }),
      daysAgo(230),
      files.ravPhoto!.path,
      files.ravSign!.path,
    ],
  );

  const n = async (sql: string) => (await pg.query<{ n: number }>(sql)).rows[0]?.n ?? 0;
  return {
    hr_form_submissions: await n("select count(*)::int as n from hr_form_submissions"),
    onboarding_submissions: await n("select count(*)::int as n from onboarding_submissions"),
    employee_documents: await n("select count(*)::int as n from employee_documents"),
    dummy_record_files: Object.keys(files).length,
  };
}
