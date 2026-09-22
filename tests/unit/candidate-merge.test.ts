import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import { planMerge } from "@/lib/hr/candidate/merge-plan";
import { normalizeMobile } from "@/lib/hr/candidate/aadhaar-kyc";

/**
 * ONE CANDIDATE, ONE RECORD.
 *
 * A placeholder — a name and a phone number typed into the evaluation form
 * before the candidate had filled anything — accumulates an evaluation. The
 * candidate's own interview form is a DIFFERENT row. The merge folds them
 * together, and the rule is that the CANDIDATE'S row always survives: it owns
 * their login, their access links, their signatures, and the name they typed
 * for themselves.
 *
 * The dangerous half is what gets written, so that is a pure function and it is
 * tested here properly. The rest is wiring, asserted against the source.
 */

const evalPass = (by: string) => ({
  scores: { a: 8 },
  recommendation: "hire",
  updatedAt: "2026-01-01T00:00:00.000Z",
  by,
});

describe("the survivor wins every tie", () => {
  it("takes the placeholder's evaluation when the survivor has none", () => {
    const plan = planMerge({
      a: { evaluationV2: { interviewer: evalPass("placeholder") } },
      b: {},
    });
    expect(plan.evaluationV2.interviewer).toBeDefined();
    expect(plan.transferred).toEqual(["evaluationV2:interviewer"]);
    expect(plan.skipped).toEqual([]);
  });

  it("NEVER overwrites an assessment the survivor already has", () => {
    // The worst outcome this operation can produce is silently replacing one
    // interviewer's completed work with another's. It must be impossible.
    const plan = planMerge({
      a: { evaluationV2: { interviewer: evalPass("placeholder") } },
      b: { evaluationV2: { interviewer: evalPass("survivor") } },
    });
    expect(plan.evaluationV2.interviewer).toEqual(evalPass("survivor"));
    expect(plan.skipped).toEqual(["evaluationV2:interviewer"]);
    expect(plan.transferred).toEqual([]);
  });

  it("keeps transferred and skipped complementary — every blob is in exactly one", () => {
    const plan = planMerge({
      a: {
        evaluationV2: { interviewer: evalPass("a"), management: evalPass("a") },
        evaluation: { checked: ["x"] },
        managementAssessment: { score: 4 },
      },
      b: { evaluationV2: { management: evalPass("b") } },
    });
    // interviewer: only A has it -> transferred. management: B has it -> skipped.
    // evaluation + managementAssessment: B has neither -> transferred.
    expect([...plan.transferred].sort()).toEqual([
      "evaluation",
      "evaluationV2:interviewer",
      "managementAssessment",
    ]);
    expect(plan.skipped).toEqual(["evaluationV2:management"]);
    expect(plan.transferred.length + plan.skipped.length).toBe(4);
  });
});

describe("the two roles are decided separately", () => {
  it("splits them — A's interviewer pass survives even when B has a management one", () => {
    // The placeholder was scored by the interviewer; the candidate's record
    // carries a management pass. Neither may clobber the other.
    const plan = planMerge({
      a: { evaluationV2: { interviewer: evalPass("interviewer") } },
      b: { evaluationV2: { management: evalPass("management") } },
    });
    expect(plan.evaluationV2.interviewer).toEqual(evalPass("interviewer"));
    expect(plan.evaluationV2.management).toEqual(evalPass("management"));
    expect(plan.transferred).toEqual(["evaluationV2:interviewer"]);
  });

  it("leaves roles that neither side has absent, rather than writing null", () => {
    const plan = planMerge({ a: {}, b: {} });
    expect(plan.evaluationV2).toEqual({});
    expect("interviewer" in plan.evaluationV2).toBe(false);
    expect("management" in plan.evaluationV2).toBe(false);
    expect(plan.transferred).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const bV2 = { management: evalPass("b") };
    const b = { evaluationV2: bV2 };
    planMerge({ a: { evaluationV2: { interviewer: evalPass("a") } }, b });
    expect(bV2).toEqual({ management: evalPass("b") });
    expect(b.evaluationV2).toBe(bV2);
  });

  it("treats an explicit null on the placeholder as 'nothing here'", () => {
    const plan = planMerge({ a: { evaluation: null, managementAssessment: null }, b: {} });
    expect(plan.transferred).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.evaluation).toBeNull();
  });
});

describe("phone matching tolerates formatting", () => {
  // The whole feature turns on this. HR types the number by hand while
  // `inviteCandidateByLink` stores digits only, so a raw string comparison
  // misses the exact case the merge exists for.
  it("treats the same number written two ways as one number", () => {
    const forms = [
      "9876543210",
      "+91 98765 43210",
      "09876543210",
      "+919876543210",
      "98765-43210",
      "  +91 (98765) 43210  ",
    ];
    const keys = new Set(forms.map((f) => normalizeMobile(f)));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("9876543210");
  });

  it("refuses anything that is not a 10-digit number", () => {
    for (const bad of ["", "   ", "12345", "98765432", "abc", "+91"]) {
      expect(normalizeMobile(bad), bad).toBe("");
    }
  });

  it("is what stops two candidates with BLANK numbers matching each other", () => {
    // The SQL side guards this with `length(...) >= 10`; this is the JS half of
    // the same rule. `phoneKey()` turns each of these into null, and a null key
    // short-circuits the lookup entirely rather than matching another null.
    expect(normalizeMobile("")).toBe("");
    // Null-safe because `candidate_intake.mobile` is a nullable column and a
    // candidate created from a name alone has no number. (This assertion is what
    // found that it was not.)
    expect(normalizeMobile(null)).toBe("");
    expect(normalizeMobile(undefined)).toBe("");
  });
});

describe("a retired placeholder cannot come back", () => {
  const actions = codeOf("app/(app)/hr/candidate-actions.ts");

  it("is filtered out of EVERY candidate picker", () => {
    // One query feeds the evaluation picker, /hr/candidates and
    // /hr/management-assessment; the drafts list feeds /hr/intake; the draft
    // loader serves stale ?draft= links. Missing any one of them resurrects a
    // row in a place the merge was supposed to remove it from.
    expect(actions).toMatch(/mergedIntoId/);
    const filters = [...actions.matchAll(/isNull\(candidateIntake\.mergedIntoId\)/g)];
    expect(filters.length).toBeGreaterThanOrEqual(4);
  });

  it("cannot be re-adopted by a quick candidate, which would resurrect it", () => {
    const quick = actions.slice(actions.indexOf("createQuickCandidate"));
    expect(quick).toMatch(/isNull\(candidateIntake\.mergedIntoId\)/);
  });

  it("cannot be written to by an autosave from a stale tab", () => {
    // Folded into the UPDATE's own WHERE, so it costs no extra query.
    const save = actions.slice(
      actions.indexOf("export async function saveCandidateDraft"),
      actions.indexOf("export async function submitCandidateDraft"),
    );
    expect(save).toMatch(/isNull\(candidateIntake\.mergedIntoId\)/);
    expect(save).toMatch(/updated\.length === 0/);
  });

  it("cannot be scored by an evaluation save from a stale tab", () => {
    const evalActions = codeOf("app/(app)/hr/evaluation-v2-actions.ts");
    expect(evalActions).toMatch(/mergedIntoId/);
    expect(evalActions).toMatch(/merged into another record/i);
  });
});

describe("the merge itself is guarded and audited", () => {
  const src = codeOf("app/(app)/hr/candidate-merge-actions.ts");

  it("requires HR staff — A can only have been created by HR staff", () => {
    // Tiered by irreversibility, not by how alarming it sounds: this destroys
    // nothing and is undone by one UPDATE. Putting it behind the admin tier
    // would hide the fix from the very person who created the duplicate.
    expect(src).toMatch(/requireHrStaff\(\)/);
    expect(src).toMatch(/rateLimitOrError/);
  });

  it("writes the audit row, and never deletes the retired record", () => {
    expect(src).toMatch(/candidateIntakeMergeEvents/);
    expect(src).toMatch(/restorePayload/);
    // No delete of candidate_intake anywhere — retirement is a tombstone.
    expect(src).not.toMatch(/delete\(candidateIntake\)/);
  });

  it("refuses a self-merge and a merge onto a placeholder", () => {
    expect(src).toMatch(/retiredId: z\.string\(\)\.uuid\(\)/);
    expect(src).toMatch(/Pick a different candidate to merge into/);
    expect(src).toMatch(/has not filled any part of the interview form/);
  });

  it("follows a survivor that was itself merged away, and refuses a cycle", () => {
    expect(src).toMatch(/b\.mergedIntoId/);
    expect(src).toMatch(/next\.mergedIntoId/);
  });

  it("is a COPY, not a move — the placeholder keeps its own bytes", () => {
    // Nothing nulls A's columns, so an un-merge needs no restore payload to have
    // survived, and a bug in the copy cannot lose an interviewer's assessment.
    const retire = src.slice(src.indexOf("await tx"));
    expect(retire).toMatch(/mergedIntoId: b\.id/);
    expect(retire).not.toMatch(/evaluationV2: null/);
    expect(retire).not.toMatch(/evaluation: null/);
  });
});
