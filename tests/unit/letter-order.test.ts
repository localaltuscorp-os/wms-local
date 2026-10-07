import { describe, it, expect } from "vitest";
import { HR_STAGES } from "@/lib/hr/lifecycle";
import { APPROVED_LETTER_CATALOGUE } from "@/lib/hr/letters/catalog";

function stageSlugs(key: string): string[] {
  return HR_STAGES.find((stage) => stage.key === key)?.items.map((item) => item.slug) ?? [];
}

function orderOf(list: string[], wanted: string[]): string[] {
  return list.filter((entry) => wanted.includes(entry));
}

describe("approved HR lifecycle order", () => {
  it("keeps promotion, salary revision, and appraisal + promotion as distinct appraisal letters", () => {
    expect(stageSlugs("appraisal")).toEqual([
      "appraisal",
      "promotion",
      "salary-revision",
      "appraisal-promotion",
    ]);
  });

  it("puts Exit after Appraisal", () => {
    const keys = HR_STAGES.map((stage) => stage.key);
    expect(keys.indexOf("exit")).toBeGreaterThan(keys.indexOf("appraisal"));
  });
});

describe("approved letter catalogue", () => {
  const letters = APPROVED_LETTER_CATALOGUE.flatMap((section) => section.letters);
  const keys = letters.map((letter) => letter.key);

  it("contains every approved code once and in order", () => {
    expect(letters.map((letter) => letter.code)).toEqual([
      "1A", "1B", "1C", "1D", "1E", "2", "3", "4", "5", "6", "7", "8",
      "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not fold promotion or salary revision into the combined code 16 letter", () => {
    expect(orderOf(keys, ["promotion", "increment", "promotion-revised-ctc"])).toEqual([
      "promotion",
      "increment",
      "promotion-revised-ctc",
    ]);
  });

  it("marks only the two unprovided approved letters as content pending", () => {
    expect(letters.filter((letter) => letter.availability === "content-pending").map((letter) => letter.code)).toEqual(["6", "11"]);
  });

  it("uses the approved exit ordering", () => {
    expect(orderOf(keys, ["experience-letter", "letter-of-recommendation"])).toEqual([
      "letter-of-recommendation",
      "experience-letter",
    ]);
  });
});
