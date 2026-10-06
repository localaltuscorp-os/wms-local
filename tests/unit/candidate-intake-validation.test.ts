import { describe, expect, it } from "vitest";
import {
  INTAKE_SECTIONS,
  isValidCandidateMobile,
  sectionRequiredKeys,
} from "@/lib/hr/candidate/intake-schema";
import { isCandidatePhotoPath } from "@/lib/hr/candidate/photo";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("candidate intake requirements", () => {
  it("does not require Family Details when no member is applicable", () => {
    const family = INTAKE_SECTIONS.find((section) => section.id === "family");
    expect(family).toBeDefined();
    expect(sectionRequiredKeys(family!, {}, {})).toEqual([]);
  });

  it("starts education with 10th and only reveals 12th details after confirmation", () => {
    const education = INTAKE_SECTIONS.find((section) => section.id === "education");
    expect(education?.repeat).toBeUndefined();

    const initial = sectionRequiredKeys(education!, {}, {});
    expect(initial).toContain("education.tenthSchool");
    expect(initial).toContain("education.hasTwelfth");
    expect(initial).not.toContain("education.twelfthSchool");

    const afterTwelfth = sectionRequiredKeys(education!, { "education.hasTwelfth": "Yes" }, {});
    expect(afterTwelfth).toContain("education.twelfthSchool");
  });

  it("accepts exactly ten numerical mobile digits", () => {
    expect(isValidCandidateMobile("9876543210")).toBe(true);
    expect(isValidCandidateMobile("987654321")).toBe(false);
    expect(isValidCandidateMobile("98765abc10")).toBe(false);
  });
});

describe("candidate photo paths", () => {
  it("accepts only the supported signed-upload photo paths", () => {
    expect(isCandidatePhotoPath(`candidate-intake/photo/${UUID}.jpg`)).toBe(true);
    expect(isCandidatePhotoPath(`candidate-intake/${UUID}/photo-${UUID}.png`)).toBe(true);
    expect(isCandidatePhotoPath(`candidate-intake/${UUID}/photo/${UUID}.webp`)).toBe(true);
    expect(isCandidatePhotoPath(`candidate-intake/photo/${UUID}.pdf`)).toBe(false);
    expect(isCandidatePhotoPath(`candidate-intake/work/${UUID}/image.jpg`)).toBe(false);
  });
});
