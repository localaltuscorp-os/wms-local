import { describe, expect, it } from "vitest";
import {
  ACCOUNT_UNLOCKER_EMAILS,
  FAILED_ATTEMPT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  canUnlockAccounts,
  isLockoutExempt,
  remainingAttempts,
} from "@/lib/auth/unlock-permission";

describe("canUnlockAccounts", () => {
  it("admits exactly the four named people and nobody else", () => {
    expect(ACCOUNT_UNLOCKER_EMAILS).toHaveLength(4);
    for (const email of ACCOUNT_UNLOCKER_EMAILS) {
      expect(canUnlockAccounts(email)).toBe(true);
    }
  });

  it("refuses an ordinary employee", () => {
    expect(canUnlockAccounts("shreya.randhe05@gmail.com")).toBe(false);
  });

  // The list is compared lower-cased because `employees.email` is not guaranteed
  // to be stored in one case, and a sign-in form does not lower-case what is
  // typed. A capability that depended on capitalisation would grant or refuse
  // unpredictably.
  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(canUnlockAccounts("  MohitGupta.AltusCorp@Gmail.com  ")).toBe(true);
  });

  it("refuses null, undefined and empty", () => {
    expect(canUnlockAccounts(null)).toBe(false);
    expect(canUnlockAccounts(undefined)).toBe(false);
    expect(canUnlockAccounts("")).toBe(false);
    expect(canUnlockAccounts("   ")).toBe(false);
  });

  // Guards the substring mistake: an `includes()` over a joined string rather
  // than over the array would admit anything containing a real address.
  it("refuses an address that merely contains an unlocker's", () => {
    expect(canUnlockAccounts("evil+rohanchoudhary.altuscorp@gmail.com")).toBe(false);
    expect(canUnlockAccounts("rohanchoudhary.altuscorp@gmail.com.attacker.net")).toBe(false);
  });
});

describe("isLockoutExempt", () => {
  // The break-glass: if all four could be locked out — and their addresses are
  // guessable — five wrong passwords against each would leave nobody able to
  // release anybody, a company-wide outage anyone could trigger.
  it("exempts every unlocker, so they can never all be locked out at once", () => {
    for (const email of ACCOUNT_UNLOCKER_EMAILS) {
      expect(isLockoutExempt(email)).toBe(true);
    }
  });

  it("does not exempt anyone else", () => {
    expect(isLockoutExempt("vinalpatil.altuscorp@gmail.com")).toBe(false);
  });
});

describe("remainingAttempts", () => {
  it("counts down from the threshold", () => {
    expect(remainingAttempts(0)).toBe(5);
    expect(remainingAttempts(1)).toBe(4);
    expect(remainingAttempts(2)).toBe(3);
    expect(remainingAttempts(3)).toBe(2);
    expect(remainingAttempts(4)).toBe(1);
    expect(remainingAttempts(5)).toBe(0);
  });

  // The countdown is rendered directly into a sentence ("2 attempts left"), so a
  // negative number would read as nonsense rather than as an error.
  it("never returns a negative number", () => {
    expect(remainingAttempts(6)).toBe(0);
    expect(remainingAttempts(99)).toBe(0);
  });
});

describe("constants", () => {
  it("locks on the fifth failure, as specified", () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });

  it("counts failures over 24 hours", () => {
    expect(FAILED_ATTEMPT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
