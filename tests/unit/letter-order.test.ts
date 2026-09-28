import { describe, it, expect } from "vitest";
import { HR_STAGES } from "@/lib/hr/lifecycle";
import { getLetter, LETTER_LIST } from "@/lib/hr/letters/registry";
import { hasBodyDateField, initialValues } from "@/lib/hr/letters/types";

function stageSlugs(key: string): string[] {
  return HR_STAGES.find((s) => s.key === key)?.items.map((i) => i.slug) ?? [];
}

/** Keeps only `wanted`, in the order they appear in `list`. */
function orderOf(list: string[], wanted: string[]): string[] {
  return list.filter((x) => wanted.includes(x));
}

describe("HR lifecycle order", () => {
  it("Appraisal: End of Probation → Appraisal → Promotion → Increment → New CTC Appraisal → New CTC Promotion", () => {
    expect(stageSlugs("appraisal")).toEqual([
      "end-of-probation",
      "appraisal",
      "promotion",
      "increment",
      "appraisal-revised-ctc",
      "promotion-revised-ctc",
    ]);
  });

  it("Exit follows Appraisal", () => {
    const keys = HR_STAGES.map((s) => s.key);
    expect(keys.indexOf("exit")).toBeGreaterThan(keys.indexOf("appraisal"));
  });

  it("Exit: the Experience Letter comes before the Letter of Recommendation", () => {
    expect(orderOf(stageSlugs("exit"), ["experience-letter", "letter-of-recommendation"])).toEqual([
      "experience-letter",
      "letter-of-recommendation",
    ]);
  });
});

describe("letters index order (registry insertion order)", () => {
  const keys = LETTER_LIST.map((l) => l.key);

  it("compensation letters follow the appraisal workflow", () => {
    expect(orderOf(keys, ["promotion", "increment", "appraisal-revised-ctc", "promotion-revised-ctc"])).toEqual([
      "promotion",
      "increment",
      "appraisal-revised-ctc",
      "promotion-revised-ctc",
    ]);
  });

  it("the Experience Letter comes before the Letter of Recommendation", () => {
    expect(orderOf(keys, ["experience-letter", "letter-of-recommendation"])).toEqual([
      "experience-letter",
      "letter-of-recommendation",
    ]);
  });
});

describe("editable document dates", () => {
  it("shows a genuine body Date row, prefilled with today and still editable", () => {
    const increment = getLetter("increment")!;
    expect(hasBodyDateField(increment)).toBe(true);
    expect(initialValues(increment).date).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
  });

  it("recognises document-date fields whose id is not literally date", () => {
    const undertaking = getLetter("minor-internship-undertaking")!;
    expect(hasBodyDateField(undertaking)).toBe(true);
    expect(initialValues(undertaking).letterDate).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
  });

  it("does not mistake an interview date for the letter's document date", () => {
    const nextRound = getLetter("next-round")!;
    expect(hasBodyDateField(nextRound)).toBe(false);
    expect(initialValues(nextRound).date).toBe("");
  });
});
