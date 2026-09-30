import { describe, expect, it } from "vitest";
import { matchesCandidateSearch } from "@/lib/hr/candidate/candidate-search";

const candidate = {
  fullName: "Test Candidate",
  positionApplied: "Test Role",
  mobile: "9876543210",
  email: "test.candidate@example.com",
};

describe("matchesCandidateSearch", () => {
  it("does not turn an email-domain fragment into a match", () => {
    expect(matchesCandidateSearch(candidate, "om")).toBe(false);
  });

  it("searches candidate-specific fields, including the email local part", () => {
    expect(matchesCandidateSearch(candidate, "candidate")).toBe(true);
    expect(matchesCandidateSearch(candidate, "role")).toBe(true);
    expect(matchesCandidateSearch(candidate, "3210")).toBe(true);
    expect(matchesCandidateSearch(candidate, "candidate@")).toBe(false);
    expect(matchesCandidateSearch(candidate, "test.candidate")).toBe(true);
  });
});
