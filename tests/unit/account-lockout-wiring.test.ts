import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * THE LOCK ONLY WORKS IF IT SITS IN THE RIGHT PLACES.
 *
 * Every rule below is one a future edit could silently undo — moving the
 * password check back into the browser, or letting a locked account reset its
 * own password — and none of them fails a type check. So they are asserted
 * against the source, the way daily-start-exemption.test.ts does.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("the password check happens on the server", () => {
  const route = read("app/api/auth/login/route.ts");

  it("refuses a locked account BEFORE asking Firebase", () => {
    const lockCheck = route.indexOf("getLockoutState");
    const firebaseCall = route.indexOf("identitytoolkit.googleapis.com");
    expect(lockCheck).toBeGreaterThan(-1);
    expect(firebaseCall).toBeGreaterThan(-1);
    // Order matters: verifying the password of a locked account leaks whether it
    // was correct through timing.
    expect(lockCheck).toBeLessThan(firebaseCall);
    expect(route).toMatch(/status:\s*423/);
  });

  it("counts every refusal and clears the streak on success", () => {
    expect(route).toContain("recordFailedAttempt");
    expect(route).toContain("clearFailedAttempts");
    // Counted even for addresses with no account — those are the attempts most
    // worth counting.
    expect(route).toContain("EMAIL_NOT_FOUND");
  });

  it("mints the same session cookies as every other sign-in path", () => {
    expect(route).toContain("mintSessionForIdToken");
    // The shared minting helper, not a second copy of the cookie logic.
    expect(read("lib/auth/session-mint.ts")).toContain("enableMultipleCookies: true");
    expect(read("app/api/auth/session/route.ts")).not.toContain("setAuthCookies(");
  });

  it("hands the browser a one-time token instead of re-using the password", () => {
    expect(route).toContain("createCustomToken");
  });
});

describe("the login form no longer checks the password itself", () => {
  const form = read("components/auth/login-form-canva.tsx");

  it("posts the credentials to the server route", () => {
    expect(form).toContain('fetch("/api/auth/login"');
  });

  it("never calls Firebase with the password", () => {
    // The whole control rests on this: a browser-side check cannot be counted.
    expect(form).not.toContain("signInWithEmailAndPassword");
  });

  it("shows the server's sentence, so the countdown is worded in one place", () => {
    expect(form).toContain("payload.message");
  });
});

describe("a locked account cannot reset its own password", () => {
  const action = read("app/(auth)/forgot-password/actions.ts");

  it("checks the lock before generating a reset link", () => {
    const guard = action.indexOf("isAccountLocked");
    const link = action.indexOf("generatePasswordResetLink");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(link);
    expect(action).toContain("RESET_BLOCKED_MESSAGE");
  });
});

describe("only role holders can unlock", () => {
  it("gates the screen on the role, not on admin", () => {
    const page = read("app/(app)/account-locks/page.tsx");
    expect(page).toContain("mayUnlockAccounts(me)");
    expect(page).toContain("notFound()");
    // NOT under /admin: that area redirects anyone without is_admin, and Jeevan
    // is not an admin.
    expect(page).not.toContain("requireAdmin");
  });

  it("re-checks in the server action, which is what actually writes", () => {
    const actions = read("app/(app)/account-locks/actions.ts");
    const check = actions.indexOf("mayUnlockAccounts(me)");
    const write = actions.indexOf("unlockAccount(email");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
  });

  it("keeps handing the role out narrower than holding it", () => {
    const actions = read("app/(app)/account-locks/actions.ts");
    // Granting is gated on mayGrantSecurityRoles (the four + super-admins), so a
    // role cannot hand itself out and spread without anyone deciding to.
    for (const fn of ["grantUnlockRoleAction", "revokeUnlockRoleAction"]) {
      const at = actions.indexOf(fn);
      expect(at, fn).toBeGreaterThan(-1);
      expect(actions.slice(at, at + 400)).toContain("mayGrantSecurityRoles(me)");
    }
  });
});
