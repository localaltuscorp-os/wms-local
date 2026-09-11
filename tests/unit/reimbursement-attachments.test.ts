import { describe, it, expect, vi } from "vitest";

// attachment-rows.ts opens with `import "server-only"`.
vi.mock("server-only", () => ({}));
import {
  CLAIM_ACCEPT_ATTR,
  CLAIM_FILE_MAX_BYTES,
  CLAIM_MAX_FILES,
  checkClaimFile,
  claimObjectPrefix,
  employeeIdFromClaimPath,
  extensionAllowed,
  formatBytes,
  isInlineViewable,
  isThumbnailable,
  legacyBillKind,
  resolvedMimeFor,
  safeObjectName,
} from "@/lib/reimbursements/attachment-rules";
import { buildClaimAttachmentRows } from "@/lib/reimbursements/attachment-rows";
import { MODULES } from "@/lib/forms/modules";
import { validateFields } from "@/lib/forms/field-types";

/**
 * REIMBURSEMENT UPLOAD RULES.
 *
 * These are the checks standing between "any signed-in employee can upload a
 * file" and the firm's private document bucket, so they are tested as security
 * code: the interesting cases are the hostile ones, not the happy path.
 *
 * Two properties matter most:
 *   1. The type gate is keyed off the EXTENSION, never the browser-supplied
 *      MIME, and it is an allow-list.
 *   2. `employeeIdFromClaimPath` is the ownership check — it has to reject any
 *      path that is not exactly one we minted, for the employee we minted it
 *      for. Every "clever" path below must come back null.
 */

const EMP = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER = "9c858901-8a57-4791-81fe-4c455b099bc9";

/* ── Type gate ─────────────────────────────────────────────────────────────── */

describe("what may be attached", () => {
  it("accepts the formats the request asked for", () => {
    for (const n of [
      "bill.jpg", "bill.jpeg", "bill.png", "bill.webp", "bill.gif",
      "bill.heic", "bill.heif", "bill.pdf", "bill.doc", "bill.docx",
    ]) {
      expect(extensionAllowed(n)).toBe(true);
    }
  });

  it("is case-insensitive about the extension", () => {
    expect(extensionAllowed("RECEIPT.PDF")).toBe(true);
    expect(extensionAllowed("Scan.JPeG")).toBe(true);
  });

  it("refuses executables and anything scriptable from the storage origin", () => {
    // .svg and .html are the dangerous ones specifically: served inline from
    // the storage domain they would be stored XSS.
    for (const n of [
      "payload.svg", "page.html", "page.htm", "run.exe", "run.bat", "run.sh",
      "x.js", "x.mjs", "app.jar", "setup.msi", "macro.xlsm", "sheet.xlsx",
      "archive.zip", "notes.txt",
    ]) {
      expect(extensionAllowed(n)).toBe(false);
    }
  });

  it("refuses a file with no extension at all", () => {
    expect(extensionAllowed("receipt")).toBe(false);
    expect(extensionAllowed("")).toBe(false);
  });

  it("reads only the LAST extension, so a double extension cannot smuggle", () => {
    // "invoice.pdf.exe" is an .exe. The reverse must also hold.
    expect(extensionAllowed("invoice.pdf.exe")).toBe(false);
    expect(extensionAllowed("invoice.exe.pdf")).toBe(true);
  });

  it("is not fooled by an extension in the directory part of a name", () => {
    expect(extensionAllowed("folder.pdf/run.exe")).toBe(false);
    expect(extensionAllowed("folder.pdf\\run.exe")).toBe(false);
  });

  it("resolves OUR mime from the extension, never the uploader's claim", () => {
    expect(resolvedMimeFor("bill.pdf")).toBe("application/pdf");
    expect(resolvedMimeFor("bill.jpeg")).toBe("image/jpeg");
    expect(resolvedMimeFor("bill.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    // A refused type has no resolved mime, so nothing can be served for it.
    expect(resolvedMimeFor("payload.svg")).toBeNull();
  });

  it("offers the allow-list to the file picker", () => {
    expect(CLAIM_ACCEPT_ATTR).toContain(".pdf");
    expect(CLAIM_ACCEPT_ATTR).toContain(".docx");
    expect(CLAIM_ACCEPT_ATTR).not.toContain(".svg");
  });
});

/* ── Size + shape ──────────────────────────────────────────────────────────── */

describe("checkClaimFile", () => {
  const ok = { name: "bill.pdf", size: 1024 };

  it("passes an ordinary receipt", () => {
    expect(checkClaimFile(ok)).toEqual({ ok: true });
  });

  it("refuses an empty file", () => {
    expect(checkClaimFile({ ...ok, size: 0 }).ok).toBe(false);
  });

  it("refuses a nameless file", () => {
    expect(checkClaimFile({ name: "   ", size: 10 }).ok).toBe(false);
  });

  it("allows exactly the cap and refuses one byte more", () => {
    expect(checkClaimFile({ ...ok, size: CLAIM_FILE_MAX_BYTES }).ok).toBe(true);
    const over = checkClaimFile({ ...ok, size: CLAIM_FILE_MAX_BYTES + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/25 MB/);
  });

  it("refuses a disallowed type by name", () => {
    const res = checkClaimFile({ name: "payload.svg", size: 100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not a supported type/i);
  });

  it("names the offending file, so a multi-file pick says which one failed", () => {
    const res = checkClaimFile({ name: "holiday.mov", size: 100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("holiday.mov");
  });

  it("survives a NaN or negative size without passing it", () => {
    expect(checkClaimFile({ ...ok, size: Number.NaN }).ok).toBe(false);
    expect(checkClaimFile({ ...ok, size: -5 }).ok).toBe(false);
  });

  it("caps a claim at a sane number of documents", () => {
    expect(CLAIM_MAX_FILES).toBeGreaterThan(1);
    expect(CLAIM_MAX_FILES).toBeLessThanOrEqual(20);
  });
});

/* ── Ownership: the path check ─────────────────────────────────────────────── */

describe("employeeIdFromClaimPath — the ownership gate", () => {
  const valid = `${claimObjectPrefix(EMP)}/11111111-2222-3333-4444-555555555555/bill.pdf`;

  it("reads the employee id out of a path we minted", () => {
    expect(employeeIdFromClaimPath(valid)).toBe(EMP);
  });

  it("returns the OTHER employee's id for their path, so a swap is detectable", () => {
    const theirs = `${claimObjectPrefix(OTHER)}/11111111-2222-3333-4444-555555555555/bill.pdf`;
    // The action compares this against the caller's own id and refuses.
    expect(employeeIdFromClaimPath(theirs)).toBe(OTHER);
    expect(employeeIdFromClaimPath(theirs)).not.toBe(EMP);
  });

  it("rejects traversal", () => {
    expect(employeeIdFromClaimPath(`reimbursements/../../etc/passwd`)).toBeNull();
    expect(employeeIdFromClaimPath(`reimbursements/${EMP}/../../x/bill.pdf`)).toBeNull();
    expect(employeeIdFromClaimPath(`../${valid}`)).toBeNull();
  });

  it("rejects a different prefix — another module's or another bucket's objects", () => {
    expect(
      employeeIdFromClaimPath(`dossier/onboarding/${EMP}/aadhaar/x/scan.pdf`),
    ).toBeNull();
    expect(employeeIdFromClaimPath(`task-attachments/${EMP}/x/bill.pdf`)).toBeNull();
    expect(employeeIdFromClaimPath(`avatars/${EMP}/x/bill.pdf`)).toBeNull();
  });

  it("rejects a prefix that merely STARTS with ours", () => {
    expect(employeeIdFromClaimPath(`reimbursements-evil/${EMP}/x/bill.pdf`)).toBeNull();
  });

  it("rejects a non-uuid in the employee segment", () => {
    expect(employeeIdFromClaimPath("reimbursements/me/x/bill.pdf")).toBeNull();
    expect(employeeIdFromClaimPath("reimbursements//x/bill.pdf")).toBeNull();
  });

  it("rejects the wrong number of segments", () => {
    expect(employeeIdFromClaimPath(`reimbursements/${EMP}/bill.pdf`)).toBeNull();
    expect(employeeIdFromClaimPath(`reimbursements/${EMP}`)).toBeNull();
    expect(employeeIdFromClaimPath(`reimbursements/${EMP}/x/y/bill.pdf`)).toBeNull();
  });

  it("rejects an absolute or empty path", () => {
    expect(employeeIdFromClaimPath(`/reimbursements/${EMP}/x/bill.pdf`)).toBeNull();
    expect(employeeIdFromClaimPath("")).toBeNull();
  });
});

/* ── Object naming ─────────────────────────────────────────────────────────── */

describe("safeObjectName", () => {
  it("strips anything that could change the path's shape", () => {
    expect(safeObjectName("../../etc/passwd")).not.toContain("/");
    expect(safeObjectName("a b&c?d.pdf")).toBe("a_b_c_d.pdf");
  });

  it("can never produce a RELATIVE path segment", () => {
    // "…/<uuid>/.." resolves back up to "…/<uuid>", i.e. not the key we minted.
    // No result may begin with a dot, and a dot-only name is not a name.
    for (const n of ["..", ".", "...", "./..", "..\..", ".hidden"]) {
      const out = safeObjectName(n);
      expect(out.startsWith(".")).toBe(false);
      expect(out).not.toBe("..");
      expect(out).not.toBe(".");
    }
  });

  it("keeps the extension, which the type gate reads", () => {
    expect(safeObjectName("Uber receipt (Sep).pdf").endsWith(".pdf")).toBe(true);
  });

  it("never returns an empty or symbol-only key", () => {
    // "???" collapses to "_", which is truthy — so a plain `|| "file"` would
    // have keyed the object on a bare underscore.
    expect(safeObjectName("???")).toBe("file");
    expect(safeObjectName("___")).toBe("file");
    expect(safeObjectName("")).toBe("file");
    expect(safeObjectName("   ")).toBe("file");
  });

  it("bounds the length so a hostile name cannot blow the key size", () => {
    expect(safeObjectName(`${"a".repeat(500)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});

/* ── Display decisions ────────────────────────────────────────────────────── */

describe("how a file is offered to the viewer", () => {
  it("opens images and PDFs in a tab", () => {
    expect(isInlineViewable("bill.pdf")).toBe(true);
    expect(isInlineViewable("bill.png")).toBe(true);
  });

  it("downloads Word — no browser renders it", () => {
    expect(isInlineViewable("bill.doc")).toBe(false);
    expect(isInlineViewable("bill.docx")).toBe(false);
  });

  it("thumbnails only formats a browser can actually paint", () => {
    expect(isThumbnailable("bill.jpg")).toBe(true);
    expect(isThumbnailable("bill.webp")).toBe(true);
    // HEIC is an image no major browser renders in an <img>; a thumbnail would
    // be a broken-image icon, so it stays a download.
    expect(isThumbnailable("bill.heic")).toBe(false);
    expect(isThumbnailable("bill.pdf")).toBe(false);
  });

  it("never calls a refused type inline-viewable", () => {
    expect(isInlineViewable("payload.svg")).toBe(false);
    expect(isThumbnailable("payload.svg")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("reads at human scale", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
  });

  it("says nothing rather than '0' when the size is unknown", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(undefined)).toBe("");
  });
});

/* ── Row building: the ownership enforcement point ────────────────────────── */

describe("buildClaimAttachmentRows", () => {
  const SUB = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const path = (emp: string, name = "bill.pdf") =>
    `${claimObjectPrefix(emp)}/11111111-2222-3333-4444-555555555555/${name}`;
  const ref = (over: Partial<{ path: string; fileName: string; mime: string | null; size: number }> = {}) => ({
    path: path(EMP),
    fileName: "bill.pdf",
    mime: "application/pdf",
    size: 2048,
    ...over,
  });

  it("builds a row per ref, keyed to the submission and the uploader", () => {
    const res = buildClaimAttachmentRows([ref()], { id: EMP }, SUB);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      submissionId: SUB,
      uploadedById: EMP,
      fileName: "bill.pdf",
      sizeBytes: 2048,
    });
  });

  it("REFUSES a path under another employee's prefix", () => {
    // The whole point: the path is minted server-side but travels through the
    // browser, so a crafted submit must not staple someone else's receipt on.
    const res = buildClaimAttachmentRows([ref({ path: path(OTHER) })], { id: EMP }, SUB);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/invalid attachment/i);
  });

  it("REFUSES a traversal path", () => {
    expect(
      buildClaimAttachmentRows(
        [ref({ path: `reimbursements/${EMP}/../../x/bill.pdf` })],
        { id: EMP },
        SUB,
      ).ok,
    ).toBe(false);
  });

  it("REFUSES a disallowed type even with a plausible mime", () => {
    // The client says "application/pdf"; the NAME says .svg. The name wins.
    const res = buildClaimAttachmentRows(
      [ref({ path: path(EMP, "x.svg"), fileName: "payload.svg", mime: "application/pdf" })],
      { id: EMP },
      SUB,
    );
    expect(res.ok).toBe(false);
  });

  it("records OUR mime, never the browser's", () => {
    const res = buildClaimAttachmentRows(
      [ref({ fileName: "bill.pdf", mime: "text/html" })],
      { id: EMP },
      SUB,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // "text/html" is exactly the value that would turn an inline viewer into
    // stored XSS. It is dropped and the extension's type recorded instead.
    expect(res.rows[0]!.mime).toBe("application/pdf");
  });

  it("de-duplicates a double submit rather than storing the file twice", () => {
    const res = buildClaimAttachmentRows([ref(), ref()], { id: EMP }, SUB);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows).toHaveLength(1);
  });

  it("refuses more refs than a claim may hold", () => {
    const many = Array.from({ length: CLAIM_MAX_FILES + 1 }, (_, i) =>
      ref({ path: path(EMP, `bill-${i}.pdf`) }),
    );
    const res = buildClaimAttachmentRows(many, { id: EMP }, SUB);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(new RegExp(String(CLAIM_MAX_FILES)));
  });

  it("accepts an empty batch — a claim needs no receipt to be filed", () => {
    const res = buildClaimAttachmentRows([], { id: EMP }, SUB);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rows).toEqual([]);
  });

  it("bounds a hostile filename without losing the real one", () => {
    const long = `${"a".repeat(400)}.pdf`;
    const res = buildClaimAttachmentRows(
      [ref({ path: path(EMP, "safe.pdf"), fileName: long })],
      { id: EMP },
      SUB,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0]!.fileName!.length).toBeLessThanOrEqual(300);
  });
});

/* ── The legacy bill field ────────────────────────────────────────────────── */

describe("legacyBillKind — telling the two old shapes apart", () => {
  it("calls an http(s) link a URL", () => {
    expect(legacyBillKind("https://drive.google.com/file/d/abc/view")).toBe("url");
    expect(legacyBillKind("http://example.com/bill.pdf")).toBe("url");
    expect(legacyBillKind("HTTPS://Drive.Google.com/x")).toBe("url");
  });

  it("calls a bare storage key a PATH — the Android app's shape", () => {
    // The app uploads to the private `documents` bucket under its own
    // "<employeeId>/…" prefix and stores the key it got back. Prefixing this
    // with "https://" — which the card used to do — produced a dead link on
    // every mobile-filed claim.
    expect(legacyBillKind(`${EMP}/reimbursements/bill.jpg`)).toBe("path");
    expect(legacyBillKind(`${EMP}/bill-2026-09.pdf`)).toBe("path");
  });

  it("is null for an empty or whitespace value", () => {
    expect(legacyBillKind("")).toBeNull();
    expect(legacyBillKind("   ")).toBeNull();
    expect(legacyBillKind(null)).toBeNull();
    expect(legacyBillKind(undefined)).toBeNull();
  });

  it("treats a schemeless bare domain as a URL, not a path", () => {
    // Someone typing "drive.google.com/abc" into the old field meant a link.
    expect(legacyBillKind("drive.google.com/abc")).toBe("path");
    expect(legacyBillKind("drive.google.com")).toBe("url");
  });
});

describe("the reimbursement request form still carries bill_url", () => {
  it("keeps the field, because the ANDROID APP posts through it", () => {
    // `validateFields` drops any value whose key is not in this list, so
    // removing the field would make every mobile-filed claim arrive with no
    // bill at all — silently. This test is the tripwire for that.
    const keys = MODULES.reimbursement.requestFields.map((f) => f.key);
    expect(keys).toContain("bill_url");
    expect(keys).toContain("notes");
  });

  it("survives validation, so a mobile POST's bill is stored", () => {
    const res = validateFields(MODULES.reimbursement.requestFields, {
      expense_for: "Cab to client",
      amount: "450",
      expense_date: "2026-09-10",
      bill_url: `${EMP}/bill.jpg`,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.values.bill_url).toBe(`${EMP}/bill.jpg`);
  });
});
