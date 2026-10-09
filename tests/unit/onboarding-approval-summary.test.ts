import { describe, expect, it } from "vitest";
import { onboardingReviewSummary } from "@/lib/hr/onboarding/approval-summary";

describe("onboardingReviewSummary", () => {
  it("reports completed sections and attachment count", () => {
    expect(onboardingReviewSummary({ firstName: "Test", lastCtc: "500000" }, { selfie: { path: "photo.png" }, cv: { path: "cv.pdf" } }))
      .toBe("2/9 sections · 2 files");
  });

  it("uses singular file wording and ignores empty attachment entries", () => {
    expect(onboardingReviewSummary({ firstName: "Test" }, { selfie: { path: "photo.png" }, cv: null }))
      .toBe("1/9 sections · 1 file");
  });
});
