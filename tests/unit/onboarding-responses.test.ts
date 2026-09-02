import { describe, it, expect } from "vitest";
import { onboardingResponses } from "@/lib/dossier/onboarding-responses";
import { ONBOARDING_SECTIONS } from "@/lib/dossier/onboarding-schema";

/**
 * The onboarding submission → HR-forms-index normaliser. This is what makes a
 * submitted onboarding form show as FILLED in My/All Filled Forms instead of
 * being invisible to them.
 */

const find = (label: string) => (r: { question: string }) => r.question === label;

describe("onboardingResponses", () => {
  it("turns answered fields into labelled question/answer pairs", () => {
    const out = onboardingResponses({ firstName: "Mansi", phone: "9876543210" });
    expect(out.find(find("First Name"))?.answer).toBe("Mansi");
    expect(out.find(find("Phone No"))?.answer).toBe("9876543210");
  });

  it("keeps the section heading as the group, so a long form stays readable", () => {
    const out = onboardingResponses({ firstName: "Mansi" });
    expect(out.find(find("First Name"))?.group).toBe("Personal Details");
  });

  it("carries ONLY answered questions — a blank field is not an answer", () => {
    const out = onboardingResponses({ firstName: "Mansi", middleName: "", lastName: "   " });
    expect(out.map((r) => r.question)).toEqual(["First Name"]);
  });

  it("returns nothing at all for an empty submission", () => {
    expect(onboardingResponses({})).toEqual([]);
  });

  it("trims whitespace off the stored answer", () => {
    expect(onboardingResponses({ firstName: "  Mansi  " })[0]?.answer).toBe("Mansi");
  });

  it("records an uploaded file by NAME, never by signed URL", () => {
    const out = onboardingResponses(
      {},
      { selfie: { path: "dossier/onboarding/abc/selfie-1/photo.jpg", fileName: "photo.jpg" } },
    );
    const row = out.find(find("Selfie (FaceCut · Plain BG)"));
    expect(row?.answer).toBe("photo.jpg");
    // Signed URLs expire; this row long outlives them.
    expect(JSON.stringify(out)).not.toContain("http");
  });

  it("records a pasted link as a link", () => {
    const out = onboardingResponses({}, { selfie: { link: "https://drive.example/x" } });
    expect(out.find(find("Selfie (FaceCut · Plain BG)"))?.answer).toBe("Link provided");
  });

  it("ignores a file key with neither an upload nor a link", () => {
    const out = onboardingResponses({}, { selfie: {} });
    expect(out).toEqual([]);
  });

  it("expands a repeater into one readable line per row", () => {
    const key = repeaterKey();
    if (!key) return; // no repeater in the schema — nothing to assert
    const { field, rows } = key;
    const out = onboardingResponses({ [field.key]: JSON.stringify(rows) });
    const lines = out.filter((r) => r.question === field.label);
    expect(lines).toHaveLength(rows.length);
    // Rendered as "Label: value", never as raw JSON.
    expect(lines[0]?.answer).not.toContain("{");
    expect(lines[0]?.answer).toContain(":");
  });

  it("keeps an unparseable repeater value rather than dropping the answer", () => {
    const key = repeaterKey();
    if (!key) return;
    const out = onboardingResponses({ [key.field.key]: "not-json-at-all" });
    expect(out.find((r) => r.question === key.field.label)?.answer).toBe("not-json-at-all");
  });

  it("never invents an answer for a field the employee left out", () => {
    const out = onboardingResponses({ firstName: "Mansi" });
    for (const r of out) expect(r.answer.trim().length).toBeGreaterThan(0);
  });
});

/** The first repeater in the live schema, with two plausible rows. */
function repeaterKey() {
  for (const s of ONBOARDING_SECTIONS) {
    for (const f of s.fields) {
      if (f.type !== "repeater" || !f.sub?.length) continue;
      const mk = (n: number) =>
        Object.fromEntries(f.sub!.map((c) => [c.key, `${c.label}-${n}`])) as Record<string, string>;
      return { field: f, rows: [mk(1), mk(2)] };
    }
  }
  return null;
}
