import { describe, expect, it } from "vitest";
import {
  decodePolicyOriginalFileName,
  encodePolicyOriginalFileName,
} from "@/lib/hr/policy-types";

describe("policy upload filename metadata", () => {
  it("preserves the original filename while leaving the visible description intact", () => {
    const fileName = "Employee Travel & Railway Pass Policy.docx";
    const encoded = encodePolicyOriginalFileName("Approved policy", fileName);

    expect(decodePolicyOriginalFileName(encoded)).toEqual({
      fileName,
      description: "Approved policy",
    });
  });

  it("keeps legacy policy descriptions readable when no filename metadata exists", () => {
    expect(decodePolicyOriginalFileName("Existing policy note")).toEqual({
      fileName: null,
      description: "Existing policy note",
    });
  });
});
