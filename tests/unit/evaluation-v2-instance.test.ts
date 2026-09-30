import { describe, expect, it } from "vitest";
import { emptyInstance, resolveEvaluationInstance, type EvaluationV2 } from "@/lib/hr/candidate/evaluation-v2";

describe("resolveEvaluationInstance", () => {
  it("keeps an existing management pass independent", () => {
    const management = { ...emptyInstance(), ratings: { "test-skill": 8 } };
    const result = resolveEvaluationInstance({ interviewer: emptyInstance(), management }, "management");

    expect(result.instance).toBe(management);
    expect(result.seededFromInterviewer).toBe(false);
  });

  it("uses a cloned interviewer pass when management has not started one", () => {
    const interviewer = { ...emptyInstance(), ratings: { "test-skill": 7 }, notes: { "test-skill": "Recorded" } };
    const blob: EvaluationV2 = { interviewer };
    const result = resolveEvaluationInstance(blob, "management");

    expect(result.seededFromInterviewer).toBe(true);
    expect(result.instance).toEqual(interviewer);
    expect(result.instance).not.toBe(interviewer);
    expect(result.instance.ratings).not.toBe(interviewer.ratings);
  });

  it("starts an empty interviewer pass when neither pass exists", () => {
    expect(resolveEvaluationInstance({}, "interviewer")).toEqual({
      instance: emptyInstance(),
      seededFromInterviewer: false,
    });
  });
});
