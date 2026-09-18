import { describe, it, expect } from "vitest";
import {
  LOCKED_MESSAGE,
  RESET_BLOCKED_MESSAGE,
  UNLOCKER_NAMES,
  wrongPasswordMessage,
} from "@/lib/auth/lockout-copy";
import { MAX_FAILED_ATTEMPTS } from "@/lib/auth/unlock-permission";

/**
 * The sentences the person actually reads. The requirement names two of them —
 * "3 attempts left" and "2 attempts left" — so they are asserted verbatim; if
 * anyone rewords the countdown, this says so rather than the wording quietly
 * drifting away from what was asked for.
 */
describe("what the sign-in screen says about a lockout", () => {
  it("counts down from three, by name", () => {
    expect(wrongPasswordMessage(3)).toBe("Wrong password. 3 attempts left before your account locks.");
    expect(wrongPasswordMessage(2)).toBe("Wrong password. 2 attempts left before your account locks.");
  });

  it("says it in the singular on the last attempt, and warns what happens next", () => {
    expect(wrongPasswordMessage(1)).toBe(
      "Wrong password. 1 attempt left — the next wrong password locks your account.",
    );
    expect(wrongPasswordMessage(1)).not.toContain("1 attempts");
  });

  it("stays quiet on the first couple of typos", () => {
    // 5 and 4 remaining are an ordinary mistyped password, not a warning.
    for (const remaining of [MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS - 1]) {
      expect(wrongPasswordMessage(remaining)).toBe("Wrong password. Try again, or reset it below.");
      expect(wrongPasswordMessage(remaining)).not.toMatch(/attempts? left/);
    }
  });

  it("falls through to the locked message at zero", () => {
    expect(wrongPasswordMessage(0)).toBe(LOCKED_MESSAGE);
    expect(wrongPasswordMessage(-1)).toBe(LOCKED_MESSAGE);
  });

  it("names the four unlockers, and says Forgot Password will not help", () => {
    expect(UNLOCKER_NAMES).toBe("Mohit, Rohan, Jeevan or Manan");
    expect(LOCKED_MESSAGE).toContain(UNLOCKER_NAMES);
    expect(LOCKED_MESSAGE).toContain(String(MAX_FAILED_ATTEMPTS));
    expect(LOCKED_MESSAGE).toMatch(/Forgot password/i);
    expect(RESET_BLOCKED_MESSAGE).toContain(UNLOCKER_NAMES);
  });
});
