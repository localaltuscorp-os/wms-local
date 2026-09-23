import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-in code must still arrive where altuscorp.in is not a verified
 * Resend sender. That refusal blocks every login, and it has already happened
 * twice on wms-local.
 */

async function load() {
  vi.resetModules();
  return import("@/lib/email/sign-in-sender");
}

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("signInFromCandidates", () => {
  it("tries the company address first, then the environment's, then mananvasa", async () => {
    process.env.RESEND_SIGNIN_FROM = "";
    process.env.RESEND_FROM_EMAIL = "Altus Corp Dashboard <noreply@mananvasa.com>";
    const { signInFromCandidates } = await load();
    expect(signInFromCandidates()[0]).toBe("Altus Corp <noreply@altuscorp.in>");
    expect(signInFromCandidates().some((f) => f.includes("mananvasa.com"))).toBe(true);
  });

  it("honours RESEND_SIGNIN_FROM as the first choice", async () => {
    process.env.RESEND_SIGNIN_FROM = "Altus <hello@example.com>";
    const { signInFromCandidates } = await load();
    expect(signInFromCandidates()[0]).toBe("Altus <hello@example.com>");
  });

  it("never lists the same sender twice", async () => {
    process.env.RESEND_SIGNIN_FROM = "Altus Corp <noreply@mananvasa.com>";
    process.env.RESEND_FROM_EMAIL = "Altus Corp <noreply@mananvasa.com>";
    const { signInFromCandidates } = await load();
    expect(new Set((await load()).signInFromCandidates()).size).toBe(signInFromCandidates().length);
  });

  it("always ends with a mananvasa.com sender, the verified one", async () => {
    process.env.RESEND_SIGNIN_FROM = "A <a@altuscorp.in>";
    process.env.RESEND_FROM_EMAIL = "B <b@altuscorp.in>";
    const { signInFromCandidates } = await load();
    expect(signInFromCandidates().at(-1)).toContain("mananvasa.com");
  });
});

describe("isUnverifiedDomainError", () => {
  it("recognises Resend's wording, and nothing else", async () => {
    const { isUnverifiedDomainError } = await load();
    expect(
      isUnverifiedDomainError(
        "The altuscorp.in domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      ),
    ).toBe(true);
    expect(isUnverifiedDomainError("Too many requests")).toBe(false);
    expect(isUnverifiedDomainError("Invalid `to` field")).toBe(false);
    expect(isUnverifiedDomainError(null)).toBe(false);
  });
});
