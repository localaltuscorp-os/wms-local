import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTwoStepPass,
  isValidTwoStepPass,
  nextMidnightIst,
  twoStepEnabled,
  twoStepPassSetCookie,
} from "@/lib/auth/two-step-pass";

/**
 * Two-step sign-in: the "done for today" pass. The requirement is not 24 hours —
 * it is "until the next day", and the day is India's.
 */

beforeAll(() => {
  process.env.COOKIE_SECRET_CURRENT = "a".repeat(64);
  process.env.COOKIE_SECRET_PREVIOUS = "b".repeat(64);
});

describe("nextMidnightIst", () => {
  it("a 9 am IST verification lasts until that night's midnight IST", () => {
    // 2026-09-19 09:00 IST = 03:30 UTC
    const at = new Date("2026-09-19T03:30:00Z");
    // 2026-09-20 00:00 IST = 2026-09-19 18:30 UTC
    expect(nextMidnightIst(at).toISOString()).toBe("2026-09-19T18:30:00.000Z");
  });

  it("11:55 pm IST still ends five minutes later, not 24 hours later", () => {
    const at = new Date("2026-09-19T18:25:00Z"); // 23:55 IST
    expect(nextMidnightIst(at).toISOString()).toBe("2026-09-19T18:30:00.000Z");
  });

  it("just after midnight IST lasts the whole new day", () => {
    const at = new Date("2026-09-19T18:31:00Z"); // 00:01 IST on the 20th
    expect(nextMidnightIst(at).toISOString()).toBe("2026-09-20T18:30:00.000Z");
  });

  it("rolls over month and year ends", () => {
    const at = new Date("2026-12-31T10:00:00Z"); // 15:30 IST, 31 Dec
    expect(nextMidnightIst(at).toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});

describe("the pass cookie", () => {
  const now = new Date("2026-09-19T05:00:00Z");

  it("is valid for the person it was issued to, the same day", async () => {
    const { value } = await createTwoStepPass("uid-mohit", "ver-1", now);
    expect(await isValidTwoStepPass(value, "uid-mohit", now)).toBe(true);
  });

  it("is refused after midnight IST", async () => {
    const { value } = await createTwoStepPass("uid-mohit", "ver-1", now);
    const nextMorning = new Date("2026-09-20T03:30:00Z");
    expect(await isValidTwoStepPass(value, "uid-mohit", nextMorning)).toBe(false);
  });

  it("is worthless next to someone else's session", async () => {
    const { value } = await createTwoStepPass("uid-mohit", "ver-1", now);
    expect(await isValidTwoStepPass(value, "uid-rohan", now)).toBe(false);
  });

  it("cannot be edited — moving the uid or the expiry breaks the signature", async () => {
    const { value } = await createTwoStepPass("uid-mohit", "ver-1", now);
    const [v, , exp, ver, sig] = value.split(".");
    expect(await isValidTwoStepPass([v, "uid-rohan", exp, ver, sig].join("."), "uid-rohan", now)).toBe(false);
    const later = String(Number(exp) + 7 * 86400);
    expect(await isValidTwoStepPass([v, "uid-mohit", later, ver, sig].join("."), "uid-mohit", now)).toBe(false);
  });

  it("refuses garbage and missing values", async () => {
    expect(await isValidTwoStepPass(undefined, "uid-mohit", now)).toBe(false);
    expect(await isValidTwoStepPass("", "uid-mohit", now)).toBe(false);
    expect(await isValidTwoStepPass("v1.uid-mohit.9999999999.x", "uid-mohit", now)).toBe(false);
  });

  it("survives a secret rotation (signed with what is now the PREVIOUS secret)", async () => {
    const { value } = await createTwoStepPass("uid-mohit", "ver-1", now);
    process.env.COOKIE_SECRET_PREVIOUS = process.env.COOKIE_SECRET_CURRENT;
    process.env.COOKIE_SECRET_CURRENT = "c".repeat(64);
    try {
      expect(await isValidTwoStepPass(value, "uid-mohit", now)).toBe(true);
    } finally {
      process.env.COOKIE_SECRET_CURRENT = process.env.COOKIE_SECRET_PREVIOUS;
      process.env.COOKIE_SECRET_PREVIOUS = "b".repeat(64);
    }
  });

  it("the Set-Cookie header expires at the same midnight, HttpOnly", async () => {
    const pass = await createTwoStepPass("uid-mohit", "ver-1", now);
    const header = twoStepPassSetCookie(pass.value, pass.expiresAt, now);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    // 05:00 UTC → 18:30 UTC is 13.5 hours.
    expect(header).toContain(`Max-Age=${13.5 * 3600}`);
    expect(header).toContain(`Expires=${pass.expiresAt.toUTCString()}`);
  });
});

describe("the switch", () => {
  it("is on unless explicitly set to off", () => {
    delete process.env.TWO_STEP_VERIFICATION;
    expect(twoStepEnabled()).toBe(true);
    process.env.TWO_STEP_VERIFICATION = "OFF";
    expect(twoStepEnabled()).toBe(false);
    delete process.env.TWO_STEP_VERIFICATION;
  });
});

describe("wiring — every way in goes through the code", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the shared session mint asks for a code when the browser has no pass", () => {
    const mint = read("lib/auth/session-mint.ts");
    expect(mint).toMatch(/isValidTwoStepPass\(existing, decoded\.uid\)/);
    expect(mint).toMatch(/issueTwoStepChallenge\(/);
    expect(mint).toMatch(/"two-step-required"/);
  });

  it("the middleware checks the pass on every signed-in request", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toMatch(/isValidTwoStepPass\(pass, tokens\.decodedToken\.uid\)/);
    expect(proxy).toMatch(/"\/api\/auth\/two-step\/"/);
  });

  it("the code is never blind-copied to the archive inbox", () => {
    const resend = read("lib/email/resend.ts");
    const fn = resend.slice(resend.indexOf("export async function sendTwoStepCodeEmail"));
    expect(fn.slice(0, fn.indexOf("\nexport "))).not.toMatch(/companyBcc|bcc:/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   WHO THE SIGN-IN CODE COMES FROM
   ════════════════════════════════════════════════════════════════════════════ */

describe("the sender of the sign-in code", () => {
  // The rules moved to lib/email/sign-in-sender.ts so a test can import them —
  // lib/email/resend.ts is `server-only`. Their behaviour is covered directly
  // in tests/unit/two-step-sender-fallback.test.ts; these keep watch over the
  // WIRING, which no import can see.
  const src = readFileSync("lib/email/sign-in-sender.ts", "utf8");
  const mailer = readFileSync("lib/email/resend.ts", "utf8");

  it("is noreply@altuscorp.in, not the environment's notification sender", () => {
    // Asked for on 21 Sep: the one email a person reads BEFORE they are inside
    // the app carries the company's own address.
    expect(src).toMatch(/COMPANY_SIGN_IN_FROM = "Altus Corp <noreply@altuscorp\.in>"/);
    expect(mailer).toMatch(/export const SIGN_IN_FROM = signInFrom\(\)/);
  });

  it("can still be overridden where that domain is not verified", () => {
    /* Resend refuses a `from` on an unverified domain and the failure is total:
       no code arrives, so nobody can sign in. wms-local has only mananvasa.com
       verified, which is exactly how that outage happened before. */
    expect(src).toMatch(/process\.env\.RESEND_SIGNIN_FROM/);
  });

  it("falls back to a verified sender rather than failing the sign-in", () => {
    const fn = mailer.slice(mailer.indexOf("export async function sendTwoStepCodeEmail"));
    const body = fn.slice(0, fn.indexOf("\nexport "));
    expect(body).toMatch(/for \(const from of signInFromCandidates\(\)\)/);
    expect(body).toMatch(/isUnverifiedDomainError\(error\.message\)/);
  });
});
