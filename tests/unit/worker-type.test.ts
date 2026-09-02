import { describe, it, expect } from "vitest";
import { payBasisFor, gradingModeFor, asWorkerType } from "@/lib/attendance/worker-type";

describe("worker-type resolver", () => {
  it("maps pay basis — ONLY a full-timer is on monthly CTC (Sir, 2026-08)", () => {
    expect(payBasisFor("full_time")).toBe("monthly_ctc");
    expect(payBasisFor("first_half")).toBe("hourly");
    expect(payBasisFor("second_half")).toBe("hourly");
    expect(payBasisFor("hybrid")).toBe("hourly");
    expect(payBasisFor("project_remote")).toBe("fixed_fee");
  });
  it("maps grading mode", () => {
    expect(gradingModeFor("full_time")).toBe("day");
    expect(gradingModeFor("second_half")).toBe("day");
    expect(gradingModeFor("hybrid")).toBe("hours");
    expect(gradingModeFor("project_remote")).toBe("session");
  });
  it("narrows untrusted strings, defaulting to full_time", () => {
    expect(asWorkerType("hybrid")).toBe("hybrid");
    expect(asWorkerType("garbage")).toBe("full_time");
    expect(asWorkerType(null)).toBe("full_time");
  });
});
