import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INCENTIVE_TYPES, INCENTIVE_TYPE_LABELS, type IncentiveType } from "@/db/enums";
import {
  CLIENT_PERMISSION_HAPPINESS_TYPES,
  EMAIL_ERROR,
  INCENTIVE_DATE_KEY,
  INCENTIVE_FIELDS,
  MOBILE_ERROR,
  URL_ERROR,
  incentiveDetailPairs,
  incentiveFieldErrors,
  isValidEmail,
  isValidHttpUrl,
  isValidIndianMobile,
  isValidIsoDate,
  validateIncentiveDetails,
  visibleIncentiveFields,
} from "@/lib/incentive-fields";
import {
  FULL_SPLIT_BP,
  checkSplit,
  equalSplitBasisPoints,
  formatPct,
  parsePct,
  sanitizePctTyping,
  splitTotalMessage,
} from "@/lib/incentive/split";
import { defaultIncentiveAmount, incentiveLabel } from "@/lib/incentive-amount";

/**
 * New Incentive Request — the form rules the dialog shows and the server
 * enforces (lib/incentive-fields.ts, lib/incentive/split.ts), plus structural
 * checks that both server entry points and the dialog actually use them.
 */

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ctx = { productNames: ["BSS", "PS", "OS", "Retainer", "Paid Key Note"] };

const ME = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const P4 = "44444444-4444-4444-8444-444444444444";
const P5 = "55555555-5555-4555-8555-555555555555";
const P6 = "66666666-6666-4666-8666-666666666666";
const PEOPLE = [ME, P2, P3, P4, P5, P6];

const DATE = { [INCENTIVE_DATE_KEY]: "2026-09-15" };
const VALID: Record<IncentiveType, Record<string, string>> = {
  bss_conversion: {
    ...DATE,
    participant_first_name: "Asha",
    participant_last_name: "Rao",
    workshop: "Productivity Shastra",
    batch_no: "PS-42",
    conversion: "1st Attempt",
    product: "BSS",
  },
  sales_pitch: {
    ...DATE,
    introducer_first_name: "Ravi",
    introducer_last_name: "Kulkarni",
    workshop: "NA",
    batch_no: "NA",
    prospect_first_name: "Meera",
    prospect_last_name: "Shah",
    organisation: "Acme",
    cell: "9876543210",
    email: "meera@acme.co.in",
    products: "PS",
    opportunity_type: "PS Potential",
  },
  client_happiness: {
    ...DATE,
    happiness_type: "Google Review",
    participant_first_name: "Anil",
    participant_last_name: "Bose",
    workshop: "Colloquium",
    batch_no: "7",
    content_quality: "Must Use",
    no_gyan_only_gain: "Yes",
  },
  group_intro: {
    ...DATE,
    introducer_first_name: "Anu",
    introducer_last_name: "Bhat",
    workshop: "NA",
    batch_no: "NA",
    prospect_first_name: "Chirag",
    prospect_last_name: "Desai",
    event_type: "BNI Intro",
    institution: "BNI Pune",
    cell: "7000000001",
    email: "bni@pune.org",
    tentative_date: "2026-10-01",
    approx_people: "50",
  },
  leads_referrals: {
    ...DATE,
    participant_first_name: "Farah",
    participant_last_name: "Iqbal",
    workshop: "Productivity Shastra",
    batch_no: "12",
  },
};

const validate = (type: IncentiveType, patch: Record<string, string>) =>
  validateIncentiveDetails(type, { ...VALID[type], ...patch }, ctx);

const keysOf = (type: IncentiveType, details: Record<string, string>) =>
  visibleIncentiveFields(type, details).map((f) => f.key);

// ── The four forms as they were before this change ──────────────────────────
const ORIGINAL: Record<string, { key: string; type: string; required: boolean; options?: string[]; showIf?: string }[]> = {
  bss_conversion: [
    { key: "participant_first_name", type: "text", required: true },
    { key: "participant_last_name", type: "text", required: true },
    { key: "workshop", type: "select", required: true },
    { key: "batch_no", type: "text", required: true },
    { key: "conversion", type: "select", required: true, options: ["1st Attempt", "2nd Attempt", "Direct"] },
    { key: "prospect_first_name", type: "text", required: false, showIf: "Direct" },
    { key: "prospect_last_name", type: "text", required: false, showIf: "Direct" },
    { key: "prospect_cell", type: "tel", required: false, showIf: "Direct" },
    { key: "prospect_email", type: "email", required: false, showIf: "Direct" },
    { key: "prospect_organisation", type: "text", required: false, showIf: "Direct" },
  ],
  sales_pitch: [
    { key: "introducer_first_name", type: "text", required: true },
    { key: "introducer_last_name", type: "text", required: true },
    { key: "workshop", type: "select", required: true },
    { key: "batch_no", type: "text", required: true },
    { key: "prospect_first_name", type: "text", required: true },
    { key: "prospect_last_name", type: "text", required: true },
    { key: "organisation", type: "text", required: true },
    { key: "cell", type: "tel", required: true },
    { key: "email", type: "email", required: true },
    { key: "products", type: "text", required: true },
    {
      key: "opportunity_type",
      type: "select",
      required: true,
      options: ["BSS Potential", "Inhouse Consulting", "Inhouse Training", "PS Potential", "Sales Consulting"],
    },
    { key: "notes", type: "textarea", required: false },
  ],
  client_happiness: [
    { key: "happiness_type", type: "select", required: true, options: ["Case Study", "Google Review", "Interview", "LinkedIn Testimonial"] },
    { key: "participant_first_name", type: "text", required: true },
    { key: "participant_last_name", type: "text", required: true },
    { key: "workshop", type: "select", required: true },
    { key: "batch_no", type: "text", required: true },
    { key: "link", type: "url", required: false },
    { key: "content_quality", type: "select", required: true, options: ["2-3 Sentences", "Do Not Use", "Good to Use", "Must Use"] },
    { key: "no_gyan_only_gain", type: "select", required: true, options: ["Yes", "No"] },
    { key: "notes", type: "textarea", required: false },
  ],
  group_intro: [
    { key: "introducer_first_name", type: "text", required: true },
    { key: "introducer_last_name", type: "text", required: true },
    { key: "workshop", type: "select", required: true },
    { key: "batch_no", type: "text", required: true },
    { key: "prospect_first_name", type: "text", required: true },
    { key: "prospect_last_name", type: "text", required: true },
    { key: "event_type", type: "select", required: true, options: ["Ascent Intro", "BNI Intro", "Jito Intro", "Key Note", "Paid Event", "Sales Event"] },
    { key: "institution", type: "text", required: true },
    { key: "cell", type: "tel", required: true },
    { key: "email", type: "email", required: true },
    { key: "products", type: "text", required: false },
    { key: "tentative_date", type: "date", required: true },
    { key: "approx_people", type: "number", required: true },
    { key: "notes", type: "textarea", required: false },
  ],
};

describe("incentive types", () => {
  it("keeps the four existing types and adds Leads / Referrals", () => {
    expect(INCENTIVE_TYPES).toEqual(["bss_conversion", "sales_pitch", "client_happiness", "group_intro", "leads_referrals"]);
    expect(INCENTIVE_TYPE_LABELS.leads_referrals).toBe("Leads / Referrals");
  });

  it("BSS Conversion reads Conversion everywhere the form shows it", () => {
    expect(INCENTIVE_TYPE_LABELS.bss_conversion).toBe("Conversion");
    for (const t of INCENTIVE_TYPES) {
      for (const f of INCENTIVE_FIELDS[t]) expect(f.label, `${t}.${f.key}`).not.toMatch(/BSS Conversion/);
    }
    expect(Object.values(INCENTIVE_TYPE_LABELS)).not.toContain("BSS Conversion");
  });

  it("the stored key is unchanged, so existing amounts and scheme labels still map", () => {
    expect(defaultIncentiveAmount("bss_conversion", { conversion: "Direct" })).toBe(2000);
    expect(incentiveLabel("bss_conversion", { conversion: "1st Attempt" })).toBe("BSS Convert 1st Attempt");
    expect(defaultIncentiveAmount("client_happiness", { happiness_type: "Case Study" })).toBe(200);
    expect(defaultIncentiveAmount("leads_referrals", {})).toBe(0);
    expect(incentiveLabel("leads_referrals", {})).toBe("Leads / Referrals");
  });
});

describe("existing forms lost nothing", () => {
  for (const [type, fields] of Object.entries(ORIGINAL)) {
    it(`${type} still has every original field with the same type, required-ness and options`, () => {
      const now = INCENTIVE_FIELDS[type as IncentiveType];
      for (const o of fields) {
        const f = now.find((x) => x.key === o.key);
        expect(f, `${type}.${o.key} missing`).toBeDefined();
        expect(f!.type, `${type}.${o.key} type`).toBe(o.type);
        expect(!!f!.required, `${type}.${o.key} required`).toBe(o.required);
        for (const opt of o.options ?? []) expect(f!.options, `${type}.${o.key} option ${opt}`).toContain(opt);
        if (o.showIf) expect(f!.showIf).toEqual({ key: "conversion", value: o.showIf });
      }
    });
  }

  it("each form's valid answers still pass", () => {
    for (const t of INCENTIVE_TYPES) {
      const res = validateIncentiveDetails(t, VALID[t], ctx);
      expect(res, t).toEqual({ ok: true, details: VALID[t] });
    }
  });

  it("hidden and unknown keys are still stripped", () => {
    const res = validate("bss_conversion", { prospect_cell: "123", smuggled: "x" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.details).not.toHaveProperty("prospect_cell");
      expect(res.details).not.toHaveProperty("smuggled");
    }
  });

  it("Conversion → Direct still reveals the prospect block", () => {
    const direct = keysOf("bss_conversion", { conversion: "Direct" });
    expect(direct).toEqual(expect.arrayContaining(["prospect_first_name", "prospect_last_name", "prospect_cell", "prospect_email", "prospect_organisation"]));
    expect(keysOf("bss_conversion", { conversion: "1st Attempt" })).not.toContain("prospect_cell");
  });
});

describe("mobile numbers — every tel field in every form", () => {
  const telFields = INCENTIVE_TYPES.flatMap((t) => INCENTIVE_FIELDS[t].filter((f) => f.type === "tel").map((f) => [t, f.key] as const));

  it("finds the three existing mobile fields", () => {
    expect(telFields).toEqual([
      ["bss_conversion", "prospect_cell"],
      ["sales_pitch", "cell"],
      ["group_intro", "cell"],
    ]);
  });

  it.each(["9876543210", "6000000000", "7123456789", "8999999999"])("accepts %s", (v) => {
    expect(isValidIndianMobile(v)).toBe(true);
  });

  it.each([
    ["9 digits", "987654321"],
    ["11 digits", "98765432101"],
    ["letters", "98765abcde"],
    ["+91 prefix", "+919876543210"],
    ["spaces", "98765 43210"],
    ["dashes", "98765-43210"],
    ["leading 0", "0987654321"],
    ["not a mobile series (5)", "5987654321"],
    ["decimal", "987654321.0"],
  ])("rejects %s", (_label, v) => {
    expect(isValidIndianMobile(v)).toBe(false);
  });

  it("the server-side validator refuses a bad number on each form", () => {
    expect(validate("sales_pitch", { cell: "12345" })).toEqual({ ok: false, error: MOBILE_ERROR });
    expect(validate("group_intro", { cell: "98765abcde" })).toEqual({ ok: false, error: MOBILE_ERROR });
    expect(validate("bss_conversion", { conversion: "Direct", prospect_cell: "987654321012" })).toEqual({ ok: false, error: MOBILE_ERROR });
  });

  it("an optional mobile field may be left empty, but not filled wrongly", () => {
    expect(validate("bss_conversion", { conversion: "Direct" }).ok).toBe(true);
    expect(validate("bss_conversion", { conversion: "Direct", prospect_cell: "abc" }).ok).toBe(false);
  });

  it("the old +91 placeholder is gone — it would have failed its own field", () => {
    for (const [t, key] of telFields) {
      const f = INCENTIVE_FIELDS[t].find((x) => x.key === key)!;
      expect(f.placeholder ?? "").not.toMatch(/\+91/);
    }
  });
});

describe("emails — every email field in every form", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.in", "meera_s@acme-corp.com", "X@Y.ORG"])("accepts %s", (v) => {
    expect(isValidEmail(v)).toBe(true);
  });

  it.each(["abc", "a@b", "a@.com", "a@b.c", "a b@c.com", "@b.com", "a@b..com", "a@-b.com", "a..b@c.com", ".a@b.com", "a@b.com.", "a@@b.com", "a@b.c0m"])(
    "rejects %s",
    (v) => {
      expect(isValidEmail(v)).toBe(false);
    },
  );

  it("the server-side validator refuses a bad email on each form", () => {
    expect(validate("sales_pitch", { email: "meera@acme" })).toEqual({ ok: false, error: EMAIL_ERROR });
    expect(validate("group_intro", { email: "no-at-sign.com" })).toEqual({ ok: false, error: EMAIL_ERROR });
    expect(validate("bss_conversion", { conversion: "Direct", prospect_email: "x@y" })).toEqual({ ok: false, error: EMAIL_ERROR });
  });
});

describe("Conversion → Product, from Admin → Products", () => {
  const product = INCENTIVE_FIELDS.bss_conversion.find((f) => f.key === "product")!;

  it("is required and has no hardcoded options", () => {
    expect(product.required).toBe(true);
    expect(product.optionsFrom).toBe("products");
    expect(product.options).toBeUndefined();
    for (const name of ["Retainer", "Paid Key Note"]) expect(code("lib/incentive-fields.ts")).not.toContain(`"${name}"`);
  });

  it("accepts any active product and refuses anything else", () => {
    expect(validate("bss_conversion", { product: "Paid Key Note" }).ok).toBe(true);
    expect(validate("bss_conversion", { product: "Rent" })).toEqual({ ok: false, error: "Product: invalid option." });
    expect(validate("bss_conversion", { product: "" })).toEqual({ ok: false, error: "Product is required." });
  });

  it("follows the master: a product added there becomes valid with no code change", () => {
    const res = validateIncentiveDetails("bss_conversion", { ...VALID.bss_conversion, product: "Rent" }, { productNames: [...ctx.productNames, "Rent"] });
    expect(res.ok).toBe(true);
  });

  it("an empty master says where to fix it", () => {
    const res = validateIncentiveDetails("bss_conversion", { ...VALID.bss_conversion, product: "" }, { productNames: [] });
    expect(res).toEqual({ ok: false, error: "No products are set up yet — add them in Admin → Products." });
  });

  it("is not on the other forms", () => {
    for (const t of INCENTIVE_TYPES.filter((x) => x !== "bss_conversion")) {
      expect(INCENTIVE_FIELDS[t].some((f) => f.optionsFrom === "products"), t).toBe(false);
    }
  });
});

describe("Leads / Referrals", () => {
  it("shows exactly the fields the brief lists, plus the incentive date", () => {
    expect(INCENTIVE_FIELDS.leads_referrals.map((f) => [f.label, !!f.required])).toEqual([
      ["Participant First Name", true],
      ["Participant Last Name", true],
      ["Link / Attachments", false],
      ["Workshop Name", true],
      ["Batch No", true],
      ["Notes", false],
      ["Incentive Date", true],
    ]);
  });

  it("requires each starred field", () => {
    for (const key of ["participant_first_name", "participant_last_name", "workshop", "batch_no"]) {
      expect(validate("leads_referrals", { [key]: "" }).ok, key).toBe(false);
    }
  });

  it("takes an http(s) link, and refuses anything else in it", () => {
    expect(validate("leads_referrals", { link: "https://drive.google.com/file/d/abc" }).ok).toBe(true);
    expect(validate("leads_referrals", { link: "drive.google.com/abc" })).toEqual({ ok: false, error: URL_ERROR });
    expect(validate("leads_referrals", { link: "javascript:alert(1)" })).toEqual({ ok: false, error: URL_ERROR });
  });
});

describe("Client Permission to Publish", () => {
  it("applies to exactly Video Testimonial and Case Study", () => {
    expect([...CLIENT_PERMISSION_HAPPINESS_TYPES].sort()).toEqual(["Case Study", "Video Testimonial"]);
    const happiness = INCENTIVE_FIELDS.client_happiness.find((f) => f.key === "happiness_type")!;
    expect(happiness.options).toContain("Video Testimonial");
  });

  it.each(["Case Study", "Video Testimonial"])("is shown and required for %s, with no default", (h) => {
    expect(keysOf("client_happiness", { happiness_type: h })).toContain("client_permission");
    const field = INCENTIVE_FIELDS.client_happiness.find((f) => f.key === "client_permission")!;
    expect(field.control).toBe("radio");
    expect(field.options).toEqual(["Yes", "No"]);
    expect(validate("client_happiness", { happiness_type: h })).toEqual({
      ok: false,
      error: "Select Yes or No for Client Permission to Publish.",
    });
    expect(validate("client_happiness", { happiness_type: h, client_permission: "Yes" }).ok).toBe(true);
    expect(validate("client_happiness", { happiness_type: h, client_permission: "No" }).ok).toBe(true);
    expect(validate("client_happiness", { happiness_type: h, client_permission: "Maybe" }).ok).toBe(false);
  });

  it.each(["Google Review", "Interview", "LinkedIn Testimonial"])("is hidden — and stripped — for %s", (h) => {
    expect(keysOf("client_happiness", { happiness_type: h })).not.toContain("client_permission");
    const res = validate("client_happiness", { happiness_type: h, client_permission: "Yes" });
    expect(res.ok && res.details.client_permission).toBeFalsy();
  });

  it("is not on any other form", () => {
    for (const t of INCENTIVE_TYPES.filter((x) => x !== "client_happiness")) {
      expect(INCENTIVE_FIELDS[t].some((f) => f.key === "client_permission"), t).toBe(false);
    }
  });
});

describe("Incentive Date", () => {
  it("is on every form, required", () => {
    for (const t of INCENTIVE_TYPES) {
      const f = INCENTIVE_FIELDS[t].find((x) => x.key === INCENTIVE_DATE_KEY);
      expect(f, t).toMatchObject({ label: "Incentive Date", type: "date", required: true });
    }
  });

  it("must be a real ISO calendar date", () => {
    expect(isValidIsoDate("2026-09-15")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "15-Sep-2026", "2026-9-15", "", "1999-12-31"]) {
      expect(isValidIsoDate(bad), bad).toBe(false);
    }
    expect(validate("sales_pitch", { [INCENTIVE_DATE_KEY]: "" })).toEqual({ ok: false, error: "Incentive Date is required." });
    expect(validate("sales_pitch", { [INCENTIVE_DATE_KEY]: "2026-02-30" })).toEqual({
      ok: false,
      error: "Enter a valid Incentive Date (DD-MMM-YYYY).",
    });
  });

  it("is persisted as ISO and displayed DD-MMM-YYYY", () => {
    const res = validate("group_intro", {});
    expect(res.ok && res.details[INCENTIVE_DATE_KEY]).toBe("2026-09-15");
    const pairs = incentiveDetailPairs("group_intro", VALID.group_intro);
    expect(pairs).toContainEqual(["Incentive Date", "15-Sep-2026"]);
    expect(pairs).toContainEqual(["Tentative Date", "01-Oct-2026"]);
  });
});

describe("Notes — every form has one, and it is the dictation field", () => {
  it("one optional Notes textarea per form", () => {
    for (const t of INCENTIVE_TYPES) {
      const areas = INCENTIVE_FIELDS[t].filter((f) => f.type === "textarea");
      expect(areas.map((f) => [f.key, f.label, !!f.required]), t).toEqual([["notes", "Notes", false]]);
    }
  });

  it("the dialog renders every textarea through NotesInput, which dictates", () => {
    const dialog = code("components/incentive/incentive-form-dialog.tsx");
    expect(dialog).toMatch(/field\.type === "textarea"\)\s*\{\s*return \(\s*<NotesInput/);
    expect(dialog).toMatch(/function NotesInput[\s\S]*useDictation\(/);
    expect(dialog).toContain('from "@/components/ui/use-dictation"');
    // No second, private speech implementation.
    expect(dialog).not.toMatch(/SpeechRecognition/);
  });
});

describe("Split Incentive", () => {
  const rows = (...pcts: (number | null)[]) => pcts.map((pct, i) => ({ employeeId: PEOPLE[i]!, pct }));
  const ok = (r: ReturnType<typeof rows>) => checkSplit(r, { requesterId: ME });

  it.each([
    [2, [5000, 5000]],
    [3, [3334, 3333, 3333]],
    [4, [2500, 2500, 2500, 2500]],
    [5, [2000, 2000, 2000, 2000, 2000]],
  ])("splits equally between %i people, totalling exactly 100%%", (n, expected) => {
    const bps = equalSplitBasisPoints(n);
    expect(bps).toEqual(expected);
    expect(bps.reduce((a, b) => a + b, 0)).toBe(FULL_SPLIT_BP);
    const res = ok(rows(...bps.map((b) => b / 100)));
    expect(res.ok, `n=${n}`).toBe(true);
    expect(res.totalBp).toBe(FULL_SPLIT_BP);
  });

  it("accepts custom splits that total 100", () => {
    expect(ok(rows(60, 40)).ok).toBe(true);
    expect(ok(rows(33.33, 33.33, 33.34)).ok).toBe(true);
    expect(ok(rows(10, 20, 30, 15.5, 24.5)).ok).toBe(true);
  });

  it("names a total under or over 100", () => {
    expect(ok(rows(50, 40))).toMatchObject({ ok: false, error: "Split must total 100%.", totalBp: 9000 });
    expect(ok(rows(60, 50))).toMatchObject({ ok: false, error: "Split cannot exceed 100%.", totalBp: 11000 });
    expect(splitTotalMessage(9000)).toBe("Split must total 100%.");
    expect(splitTotalMessage(10000)).toBeNull();
  });

  it("refuses negative, zero, over-100 and over-precise shares", () => {
    expect(ok(rows(110, -10))).toMatchObject({ ok: false, error: "A share cannot be more than 100%." });
    expect(ok(rows(90, -10)).ok).toBe(false);
    expect(ok(rows(100, 0))).toMatchObject({ ok: false, error: "Every share must be more than 0%." });
    expect(ok(rows(33.333, 66.667))).toMatchObject({ ok: false, error: "Use at most 2 decimal places for a share." });
    expect(ok(rows(50, null))).toMatchObject({ ok: false, error: "Enter a share for every person in the split.", totalBp: 5000 });
  });

  it("allows 2 to 5 people", () => {
    expect(ok(rows(100))).toMatchObject({ ok: false, error: "Add at least one more person to split with." });
    expect(ok(rows(20, 20, 20, 20, 10, 10))).toMatchObject({ ok: false, error: "A split can include at most 5 people." });
  });

  it("needs a distinct, chosen employee per row — the requester among them", () => {
    expect(checkSplit([{ employeeId: ME, pct: 50 }, { employeeId: "", pct: 50 }], { requesterId: ME })).toMatchObject({
      error: "Pick an employee for every person in the split.",
    });
    expect(checkSplit([{ employeeId: ME, pct: 50 }, { employeeId: ME, pct: 50 }], { requesterId: ME })).toMatchObject({
      error: "Each person can appear in the split only once.",
    });
    expect(checkSplit([{ employeeId: P2, pct: 50 }, { employeeId: P3, pct: 50 }], { requesterId: ME })).toMatchObject({
      error: "You must be one of the people in the split.",
    });
  });

  it("typing cannot produce a negative or a third decimal", () => {
    expect(sanitizePctTyping("-50")).toBe("50");
    expect(sanitizePctTyping("12.345")).toBe("12.34");
    expect(sanitizePctTyping("1.2.3")).toBe("1.23");
    expect(sanitizePctTyping("abc")).toBe("");
    expect(sanitizePctTyping("007")).toBe("7");
    expect(sanitizePctTyping("0.5")).toBe("0.5");
    expect(parsePct("")).toBeNull();
    expect(parsePct(".")).toBeNull();
    expect(parsePct("12.")).toBe(12);
    expect(parsePct("33.34")).toBe(33.34);
    expect(formatPct(3334 / 100)).toBe("33.34");
  });
});

describe("dual-screen layout hints", () => {
  it("links, notes and the incentive date sit on the right; the type's first fields on the left", () => {
    for (const t of INCENTIVE_TYPES) {
      for (const f of INCENTIVE_FIELDS[t]) {
        if (["notes", "link", INCENTIVE_DATE_KEY].includes(f.key)) expect(f.pane, `${t}.${f.key}`).toBe("right");
      }
      expect(INCENTIVE_FIELDS[t][0]!.pane ?? "left", t).toBe("left");
    }
  });

  it("the dialog is two columns from md and one below, with validation off to the browser", () => {
    const dialog = code("components/incentive/incentive-form-dialog.tsx");
    expect(dialog).toContain("md:grid-cols-2");
    expect(dialog).toContain("noValidate");
    expect(dialog).toContain('data-pane="left"');
    expect(dialog).toContain('data-pane="right"');
  });
});

describe("server enforcement — both entry points use the one gate", () => {
  it("the web action and the mobile POST call prepareIncentiveRequest", () => {
    for (const p of ["app/(app)/incentive/actions.ts", "app/api/mobile/incentive/route.ts"]) {
      const src = code(p);
      expect(src, p).toContain("prepareIncentiveRequest(me.id,");
      expect(src, p).not.toMatch(/validateIncentiveDetails\(/);
    }
  });

  it("the gate validates details against the live product master and checks the split's employees", () => {
    const src = code("lib/incentive/prepare-request.ts");
    expect(src).toContain('import "server-only"');
    expect(src).toMatch(/listActiveProductNames\(\)/);
    expect(src).toMatch(/validateIncentiveDetails\(type, details, \{ productNames \}\)/);
    expect(src).toMatch(/checkSplit\(split, \{ requesterId \}\)/);
    expect(src).toMatch(/eq\(employees\.isActive, true\)/);
  });

  it("the field errors the dialog shows are the ones the server returns", () => {
    const errors = incentiveFieldErrors("sales_pitch", { ...VALID.sales_pitch, cell: "123", email: "x" }, ctx);
    expect(errors).toEqual({ cell: MOBILE_ERROR, email: EMAIL_ERROR });
  });

  it("url and number keep the rules the browser used to apply", () => {
    expect(isValidHttpUrl("https://example.com/a")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(validate("group_intro", { approx_people: "0" }).ok).toBe(false);
    expect(validate("group_intro", { approx_people: "12.5" }).ok).toBe(false);
    expect(validate("client_happiness", { link: "not a link" })).toEqual({ ok: false, error: URL_ERROR });
  });
});

describe("migration 0229", () => {
  const sql = code("db/migrations/0229_incentive_request_split.sql");
  it("adds a nullable jsonb split column with a shape check, idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS split jsonb;/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS incentive_requests_split_shape_chk/);
    expect(sql).toMatch(/jsonb_array_length\(split\) BETWEEN 2 AND 5/);
    expect(sql).not.toMatch(/\bNOT NULL\b/);
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)|DELETE FROM|TRUNCATE/i);
  });
});
