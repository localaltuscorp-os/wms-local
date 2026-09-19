import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  BillingEntityFieldsSchema,
  CreateBillingEntitySchema,
  GSTIN_RE,
  PAN_RE,
  IFSC_RE,
  SAC_RE,
  isGstStateCode,
  panFromGstin,
  normalizeTaxId,
  cleanText,
  primaryContact,
  imageKindError,
  isEntityFileKind,
  isSingletonFileKind,
  ENTITY_FILE_KINDS,
} from "@/lib/billing/entity-master";
import {
  snapshotBillingEntity,
  snapshotsDiffer,
  BILLING_SNAPSHOT_VERSION,
  type SnapshotEntityInput,
} from "@/lib/billing/entity-snapshot";

/**
 * BILLING MASTER — validation, normalisation and the historical snapshot.
 *
 * These are the parts that can be driven directly, so they are driven directly
 * rather than asserted against the source text. The authorization rules live in
 * billing-entity-authorization.test.ts.
 */

/* ════════════════════════════════════════════════════════════════════════════
   §10 VALIDATION
   ════════════════════════════════════════════════════════════════════════════ */

describe("entity name is required", () => {
  it("refuses a blank or whitespace-only name", () => {
    expect(CreateBillingEntitySchema.safeParse({ name: "" }).success).toBe(false);
    expect(CreateBillingEntitySchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("accepts a real name and trims it", () => {
    const r = CreateBillingEntitySchema.safeParse({ name: "  Unleashed  " });
    expect(r.success).toBe(true);
    expect(r.success && r.data.name).toBe("Unleashed");
  });

  it("refuses a name longer than the column", () => {
    expect(CreateBillingEntitySchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
  });
});

describe("PAN format", () => {
  it("accepts a well-formed PAN", () => {
    expect(PAN_RE.test("AAAPL1234C")).toBe(true);
  });

  it("refuses the shapes people actually mistype", () => {
    expect(PAN_RE.test("AAAPL1234")).toBe(false); // missing the last letter
    expect(PAN_RE.test("AAAP1234C")).toBe(false); // four letters, not five
    expect(PAN_RE.test("AAAPL12345")).toBe(false); // digit where a letter goes
    expect(PAN_RE.test("AAAPL1234CX")).toBe(false); // too long
  });

  it("is normalised before it is checked, so pasted text still saves", () => {
    const r = BillingEntityFieldsSchema.safeParse({ panNo: " aaapl1234c " });
    expect(r.success).toBe(true);
    expect(r.success && r.data.panNo).toBe("AAAPL1234C");
  });

  it("rejects a malformed PAN with a message naming the shape", () => {
    const r = BillingEntityFieldsSchema.safeParse({ panNo: "NOPE" });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]!.message).toMatch(/ABCDE1234F/);
  });
});

describe("GSTIN format", () => {
  it("accepts a well-formed GSTIN", () => {
    expect(GSTIN_RE.test("27AAAPL1234C1Z5")).toBe(true);
  });

  it("refuses the wrong length", () => {
    expect(GSTIN_RE.test("27AAAPL1234C1Z")).toBe(false);
    expect(GSTIN_RE.test("27AAAPL1234C1Z55")).toBe(false);
  });

  it("validates the leading state code", () => {
    // 01–38 are the states and UTs; 97 and 99 are the two special codes.
    expect(isGstStateCode("01")).toBe(true);
    expect(isGstStateCode("27")).toBe(true);
    expect(isGstStateCode("38")).toBe(true);
    expect(isGstStateCode("97")).toBe(true);
    expect(isGstStateCode("99")).toBe(true);
    // These are the ones a transposition produces.
    expect(isGstStateCode("00")).toBe(false);
    expect(isGstStateCode("39")).toBe(false);
    expect(isGstStateCode("96")).toBe(false);
    expect(isGstStateCode("98")).toBe(false);
  });

  it("refuses a GSTIN whose state code does not exist", () => {
    const r = BillingEntityFieldsSchema.safeParse({ gstNo: "00AAAPL1234C1Z5" });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]!.message).toMatch(/state code/i);
  });

  it("does NOT insist on 'Z' in the reserved position", () => {
    // UIN and OIDAR registrations carry something else there. Pinning it would
    // reject a valid registration, which is worse than accepting an unusual one.
    expect(GSTIN_RE.test("27AAAPL1234C1A5")).toBe(true);
  });

  it("extracts the PAN a GSTIN carries", () => {
    expect(panFromGstin("27AAAPL1234C1Z5")).toBe("AAAPL1234C");
    expect(panFromGstin("nonsense")).toBeNull();
  });
});

describe("the GST/PAN cross-check — the one typo neither field can catch alone", () => {
  it("accepts a matching pair", () => {
    const r = BillingEntityFieldsSchema.safeParse({
      panNo: "AAAPL1234C",
      gstNo: "27AAAPL1234C1Z5",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a mismatched pair and says which PAN the GSTIN belongs to", () => {
    const r = BillingEntityFieldsSchema.safeParse({
      panNo: "ZZZPL9999Z",
      gstNo: "27AAAPL1234C1Z5",
    });
    expect(r.success).toBe(false);
    const msg = r.success === false ? r.error.issues[0]!.message : "";
    expect(msg).toContain("AAAPL1234C");
    expect(msg).toContain("ZZZPL9999Z");
  });

  it("says nothing when only one of the two is given", () => {
    // Half a pair is not a contradiction — an entity may have its PAN on file
    // while the GST registration is still pending.
    expect(BillingEntityFieldsSchema.safeParse({ panNo: "AAAPL1234C" }).success).toBe(true);
    expect(BillingEntityFieldsSchema.safeParse({ gstNo: "27AAAPL1234C1Z5" }).success).toBe(true);
  });

  it("is case-insensitive, matching how both are normalised", () => {
    const r = BillingEntityFieldsSchema.safeParse({
      panNo: "aaapl1234c",
      gstNo: "27aaapl1234c1z5",
    });
    expect(r.success).toBe(true);
  });
});

describe("IFSC format", () => {
  it("accepts a well-formed IFSC", () => {
    expect(IFSC_RE.test("HDFC0001234")).toBe(true);
  });

  it("requires the reserved zero in the fifth position", () => {
    expect(IFSC_RE.test("HDFC1001234")).toBe(false);
  });

  it("refuses the wrong length", () => {
    expect(IFSC_RE.test("HDFC000123")).toBe(false);
    expect(IFSC_RE.test("HDFC00012345")).toBe(false);
  });
});

describe("SAC codes are multiple (§2)", () => {
  it("accepts the three real widths", () => {
    expect(SAC_RE.test("9983")).toBe(true);
    expect(SAC_RE.test("998313")).toBe(true);
    expect(SAC_RE.test("99831300")).toBe(true);
  });

  it("refuses five or seven digits, and anything non-numeric", () => {
    expect(SAC_RE.test("99831")).toBe(false);
    expect(SAC_RE.test("9983130")).toBe(false);
    expect(SAC_RE.test("99831A")).toBe(false);
  });

  it("keeps several codes, in order", () => {
    const r = BillingEntityFieldsSchema.safeParse({ sacCodes: ["998313", "9983", "99831300"] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.sacCodes).toEqual(["998313", "9983", "99831300"]);
  });

  it("de-duplicates silently — the same code twice is a slip, not a choice", () => {
    const r = BillingEntityFieldsSchema.safeParse({ sacCodes: ["998313", "998313", "9983"] });
    expect(r.success && r.data.sacCodes).toEqual(["998313", "9983"]);
  });

  it("drops blanks and strips inner spaces", () => {
    const r = BillingEntityFieldsSchema.safeParse({ sacCodes: ["", "  ", "99 83 13"] });
    expect(r.success && r.data.sacCodes).toEqual(["998313"]);
  });

  it("rejects the whole list when one code is malformed", () => {
    // Saving three of four and silently dropping the bad one would put an
    // incomplete SAC list on an invoice with no indication anything was lost.
    const r = BillingEntityFieldsSchema.safeParse({ sacCodes: ["998313", "12"] });
    expect(r.success).toBe(false);
  });

  it("accepts an empty list — clearing every code is a legitimate edit", () => {
    const r = BillingEntityFieldsSchema.safeParse({ sacCodes: [] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.sacCodes).toEqual([]);
  });
});

describe("email and free text", () => {
  it("validates an email address", () => {
    expect(BillingEntityFieldsSchema.safeParse({ email: "billing@example.com" }).success).toBe(true);
    expect(BillingEntityFieldsSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("treats a cleared field as 'not recorded' rather than a validation failure", () => {
    // The workspace sends a cleared input as "". Refusing it would make a field
    // impossible to un-set once filled.
    expect(BillingEntityFieldsSchema.safeParse({ email: "" }).success).toBe(true);
    expect(BillingEntityFieldsSchema.safeParse({ address: "" }).success).toBe(true);
    expect(BillingEntityFieldsSchema.safeParse({ panNo: "" }).success).toBe(true);
    expect(BillingEntityFieldsSchema.safeParse({ gstNo: "" }).success).toBe(true);
  });

  it("collapses whitespace and returns null for empty", () => {
    expect(cleanText("  Sacred   Space,  C-6  ")).toBe("Sacred Space, C-6");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });

  it("normalizeTaxId strips all whitespace and upper-cases", () => {
    expect(normalizeTaxId(" 27 aaapl 1234 c1z5 ")).toBe("27AAAPL1234C1Z5");
  });
});

describe("the patch is SPARSE — an absent key must never blank a column", () => {
  it("keeps only the keys that were sent", () => {
    const r = BillingEntityFieldsSchema.safeParse({ bankName: "HDFC Bank" });
    expect(r.success).toBe(true);
    // Not `{bankName, gstNo: undefined, ifsc: undefined, …}` — the action
    // iterates the parsed object, so an extra key would write a null.
    expect(r.success && Object.keys(r.data)).toEqual(["bankName"]);
  });

  it("accepts an empty patch at the schema level (the action refuses it)", () => {
    expect(BillingEntityFieldsSchema.safeParse({}).success).toBe(true);
  });

  it("is STRICT, so a typo'd key is an error and not a silent no-op", () => {
    expect(BillingEntityFieldsSchema.safeParse({ gstNumber: "27AAAPL1234C1Z5" }).success).toBe(false);
  });
});

describe("THERE IS NO ENTITY CODE", () => {
  it("the schema has no key for one", () => {
    for (const key of ["entityCode", "entity_code", "code", "codePrefix"]) {
      expect(
        BillingEntityFieldsSchema.safeParse({ [key]: "ABC" }).success,
        `${key} must not be accepted`,
      ).toBe(false);
    }
  });

  it("no Billing Master source file mentions an entity code", () => {
    for (const f of [
      "lib/billing/entity-master.ts",
      "lib/billing/entity-snapshot.ts",
      "lib/queries/billing-entities.ts",
      "app/(admin)/admin/billing-master/actions.ts",
      "app/(admin)/admin/billing-master/page.tsx",
      "components/admin/billing-master/master-table.tsx",
      "components/admin/billing-master/workspace.tsx",
    ]) {
      expect(codeOf(f), f).not.toMatch(/entityCode|entity_code/);
    }
  });

  it("the migration does not add one, and leaves employee numbering alone", () => {
    const sqlText = codeOf("db/migrations/0226_billing_master.sql");
    expect(sqlText).not.toMatch(/entity_code/);
    // `code_prefix` belongs to the employee-code allocator. Dropping it would
    // break an unrelated module.
    expect(sqlText).not.toMatch(/DROP COLUMN[\s\S]*code_prefix/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   FILES
   ════════════════════════════════════════════════════════════════════════════ */

describe("file kinds", () => {
  it("knows exactly three", () => {
    expect([...ENTITY_FILE_KINDS]).toEqual(["logo", "signature", "document"]);
  });

  it("refuses an unknown kind", () => {
    expect(isEntityFileKind("logo")).toBe(true);
    expect(isEntityFileKind("invoice")).toBe(false);
    expect(isEntityFileKind("")).toBe(false);
    expect(isEntityFileKind(null)).toBe(false);
  });

  it("logo and signature are singletons; documents are not", () => {
    expect(isSingletonFileKind("logo")).toBe(true);
    expect(isSingletonFileKind("signature")).toBe(true);
    expect(isSingletonFileKind("document")).toBe(false);
  });

  it("the logo and signature must be raster images", () => {
    expect(imageKindError("logo", "image/png")).toBeNull();
    expect(imageKindError("logo", "image/jpeg")).toBeNull();
    expect(imageKindError("signature", "image/webp")).toBeNull();
    // A PDF accepted as a logo fails later, inside the renderer, with an error
    // that points at the wrong place.
    expect(imageKindError("logo", "application/pdf")).toMatch(/PNG, JPEG or WebP/);
    expect(imageKindError("signature", null)).toMatch(/PNG, JPEG or WebP/);
  });

  it("SVG is refused — it is script-capable, which is why HR already blocks it", () => {
    expect(imageKindError("logo", "image/svg+xml")).toMatch(/PNG, JPEG or WebP/);
  });

  it("a document may be any type the shared upload rules allow", () => {
    expect(imageKindError("document", "application/pdf")).toBeNull();
    expect(imageKindError("document", null)).toBeNull();
  });
});

describe("the list's Contact column", () => {
  it("prefers the cell number, falls back to email, then to nothing", () => {
    expect(primaryContact({ cellNo: "+91 98765 43210", email: "a@b.com" })).toBe("+91 98765 43210");
    expect(primaryContact({ cellNo: null, email: "a@b.com" })).toBe("a@b.com");
    expect(primaryContact({ cellNo: "  ", email: "a@b.com" })).toBe("a@b.com");
    expect(primaryContact({ cellNo: null, email: null })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §7 THE HISTORICAL SNAPSHOT
   ════════════════════════════════════════════════════════════════════════════ */

const ENTITY: SnapshotEntityInput = {
  id: "entity-1",
  name: "Unleashed",
  proprietorName: "Manan Vasa",
  proprietorDesignation: "Proprietor",
  address: "Sacred Space, C-6, Mumbai 63",
  cellNo: "+91 80970 10410",
  email: "manan@unleashed.in",
  website: "www.mananvasa.com",
  panNo: "AAAPL1234C",
  gstNo: "27AAAPL1234C1Z5",
  sacCodes: ["998313"],
  bankName: "HDFC Bank",
  accountName: "Unleashed",
  accountNumber: "50200012345678",
  ifsc: "HDFC0001234",
  branch: "Goregaon East",
};

const FILES = [
  { kind: "logo" as const, storagePath: "billing-entities/e1/logo/a/l.png", fileName: "l.png", mimeType: "image/png" },
  { kind: "signature" as const, storagePath: "billing-entities/e1/signature/b/s.png", fileName: "s.png", mimeType: "image/png" },
  { kind: "document" as const, storagePath: "billing-entities/e1/document/c/gst.pdf", fileName: "gst.pdf", mimeType: "application/pdf" },
];

describe("the snapshot carries everything an invoice prints", () => {
  const snap = snapshotBillingEntity(ENTITY, FILES, new Date("2026-09-12T10:00:00Z"));

  it("freezes every billing field by VALUE, not by reference to the master", () => {
    expect(snap.name).toBe("Unleashed");
    expect(snap.gstNo).toBe("27AAAPL1234C1Z5");
    expect(snap.panNo).toBe("AAAPL1234C");
    expect(snap.address).toBe("Sacred Space, C-6, Mumbai 63");
    expect(snap.proprietorName).toBe("Manan Vasa");
    expect(snap.proprietorDesignation).toBe("Proprietor");
    expect(snap.bankName).toBe("HDFC Bank");
    expect(snap.accountName).toBe("Unleashed");
    expect(snap.accountNumber).toBe("50200012345678");
    expect(snap.ifsc).toBe("HDFC0001234");
    expect(snap.branch).toBe("Goregaon East");
    expect(snap.sacCodes).toEqual(["998313"]);
    expect(snap.cellNo).toBe("+91 80970 10410");
    expect(snap.email).toBe("manan@unleashed.in");
    expect(snap.website).toBe("www.mananvasa.com");
  });

  it("carries the entity id, a shape version and when it was taken", () => {
    expect(snap.entityId).toBe("entity-1");
    expect(snap.v).toBe(BILLING_SNAPSHOT_VERSION);
    expect(snap.takenAt).toBe("2026-09-12T10:00:00.000Z");
  });

  it("carries the logo and signature as STORAGE PATHS, never as signed URLs", () => {
    // A signed URL expires in minutes; an old invoice holding one would point
    // at a dead link. The storage path is permanent, and a replaced logo is a
    // new object at a new path, so an old snapshot keeps resolving to the image
    // that was actually printed.
    expect(snap.logo).toEqual({
      storagePath: "billing-entities/e1/logo/a/l.png",
      fileName: "l.png",
      mimeType: "image/png",
    });
    expect(snap.signature?.storagePath).toBe("billing-entities/e1/signature/b/s.png");
    expect(JSON.stringify(snap)).not.toMatch(/token=|X-Amz-|signedUrl|https?:\/\//);
  });

  it("does NOT carry the billing documents", () => {
    // They are the entity's own paperwork, not something an invoice prints, and
    // an unbounded list copied into every invoice would bloat the row.
    expect(JSON.stringify(snap)).not.toMatch(/gst\.pdf/);
  });

  it("reports missing files as null rather than omitting the keys", () => {
    const bare = snapshotBillingEntity(ENTITY, []);
    expect(bare.logo).toBeNull();
    expect(bare.signature).toBeNull();
    expect("logo" in bare).toBe(true);
  });

  it("normalises a null SAC array to an empty one", () => {
    const s = snapshotBillingEntity({ ...ENTITY, sacCodes: null }, []);
    expect(s.sacCodes).toEqual([]);
  });

  it("survives a JSON round-trip unchanged — it is stored as jsonb", () => {
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe("editing the master must not rewrite the past", () => {
  it("a snapshot taken before an edit still holds the OLD values", () => {
    const before = snapshotBillingEntity(ENTITY, FILES);
    // The entity's bank account and GST change, as they do.
    const after = snapshotBillingEntity(
      { ...ENTITY, accountNumber: "99999999999999", gstNo: "29AAAPL1234C1Z5" },
      FILES,
    );
    expect(before.accountNumber).toBe("50200012345678");
    expect(before.gstNo).toBe("27AAAPL1234C1Z5");
    expect(after.accountNumber).toBe("99999999999999");
    // This is the whole requirement: the old payload is untouched by the new one.
    expect(before.accountNumber).not.toBe(after.accountNumber);
  });

  it("a replaced logo does not change an earlier snapshot", () => {
    const before = snapshotBillingEntity(ENTITY, FILES);
    const after = snapshotBillingEntity(ENTITY, [
      { kind: "logo", storagePath: "billing-entities/e1/logo/NEW/l2.png", fileName: "l2.png", mimeType: "image/png" },
    ]);
    expect(before.logo?.storagePath).toBe("billing-entities/e1/logo/a/l.png");
    expect(after.logo?.storagePath).toBe("billing-entities/e1/logo/NEW/l2.png");
  });
});

describe("a no-op save writes no version row", () => {
  it("two snapshots of an unchanged entity do not differ", () => {
    const a = snapshotBillingEntity(ENTITY, FILES, new Date("2026-09-12T10:00:00Z"));
    const b = snapshotBillingEntity(ENTITY, FILES, new Date("2026-09-12T11:30:00Z"));
    // Different `takenAt`, same content — the time a photograph was taken is
    // not part of what it shows.
    expect(a.takenAt).not.toBe(b.takenAt);
    expect(snapshotsDiffer(a, b)).toBe(false);
  });

  it("detects a change in any field an invoice prints", () => {
    const base = snapshotBillingEntity(ENTITY, FILES);
    const changes: Partial<SnapshotEntityInput>[] = [
      { name: "Unleashed LLP" },
      { gstNo: "29AAAPL1234C1Z5" },
      { panNo: "ZZZPL9999Z" },
      { address: "Somewhere else" },
      { accountNumber: "1" },
      { ifsc: "ICIC0001234" },
      { bankName: "ICICI" },
      { branch: "Andheri" },
      { proprietorName: "Someone Else" },
      { proprietorDesignation: "Partner" },
      { sacCodes: ["998314"] },
      { cellNo: "+91 1" },
      { email: "x@y.com" },
      { website: "www.other.com" },
      { accountName: "Other" },
    ];
    for (const change of changes) {
      const next = snapshotBillingEntity({ ...ENTITY, ...change }, FILES);
      expect(snapshotsDiffer(base, next), JSON.stringify(change)).toBe(true);
    }
  });

  it("detects a changed logo or signature", () => {
    const base = snapshotBillingEntity(ENTITY, FILES);
    const noLogo = snapshotBillingEntity(ENTITY, FILES.filter((f) => f.kind !== "logo"));
    expect(snapshotsDiffer(base, noLogo)).toBe(true);
  });

  it("is INDEPENDENT OF KEY ORDER — the stored side comes back reordered", () => {
    /**
     * Postgres `jsonb` stores object keys sorted by length then alphabetically,
     * not in insertion order. So one side of this comparison is always a
     * reordered version of what was written, and a `JSON.stringify` comparison
     * reports every pair as different — which silently defeated the no-op
     * guard until scripts/verify-billing-master.ts caught it on real data.
     *
     * This reproduces the reordering in memory so the regression is pinned
     * here too, where it runs on every commit.
     */
    const built = snapshotBillingEntity(ENTITY, FILES, new Date("2026-09-12T10:00:00Z"));
    const asJsonbWould = Object.fromEntries(
      Object.keys(built)
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .map((k) => [k, (built as unknown as Record<string, unknown>)[k]]),
    ) as unknown as typeof built;

    expect(Object.keys(asJsonbWould)).not.toEqual(Object.keys(built));
    expect(JSON.stringify(asJsonbWould)).not.toBe(JSON.stringify(built));
    // Same values, so: not a change.
    expect(snapshotsDiffer(asJsonbWould, built)).toBe(false);
  });

  it("still detects a real change when the keys are also reordered", () => {
    // The order-independence must not have been bought by ignoring content.
    const built = snapshotBillingEntity(ENTITY, FILES);
    const changed = snapshotBillingEntity({ ...ENTITY, gstNo: "29AAAPL1234C1Z5" }, FILES);
    const reordered = Object.fromEntries(
      Object.keys(changed).sort().map((k) => [k, (changed as unknown as Record<string, unknown>)[k]]),
    ) as unknown as typeof changed;
    expect(snapshotsDiffer(built, reordered)).toBe(true);
  });

  it("keeps SAC order significant — array order is data, key order is not", () => {
    const a = snapshotBillingEntity({ ...ENTITY, sacCodes: ["998313", "9983"] }, FILES);
    const b = snapshotBillingEntity({ ...ENTITY, sacCodes: ["9983", "998313"] }, FILES);
    expect(snapshotsDiffer(a, b)).toBe(true);
  });

  it("does NOT report a change when only a billing document was added", () => {
    // Documents are outside the snapshot, so adding one cannot alter what an
    // invoice would print.
    const base = snapshotBillingEntity(ENTITY, FILES);
    const extra = snapshotBillingEntity(ENTITY, [
      ...FILES,
      { kind: "document", storagePath: "p", fileName: "pan.pdf", mimeType: "application/pdf" },
    ]);
    expect(snapshotsDiffer(base, extra)).toBe(false);
  });
});
