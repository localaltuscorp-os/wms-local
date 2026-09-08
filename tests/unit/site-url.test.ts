import { describe, it, expect, afterEach } from "vitest";
import { siteUrl } from "@/lib/site-url";

const FALLBACK = "https://altus-corp-dashboard.vercel.app";
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("siteUrl", () => {
  it("returns a well-formed https URL unchanged", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wms.mananvasa.com";
    expect(siteUrl()).toBe("https://wms.mananvasa.com");
  });

  it("prepends https:// when the scheme is missing (the prod bug)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "wms.mananvasa.com";
    expect(siteUrl()).toBe("https://wms.mananvasa.com");
  });

  it("strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wms.mananvasa.com///";
    expect(siteUrl()).toBe("https://wms.mananvasa.com");
  });

  it("preserves an http localhost URL with a port", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("falls back when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe(FALLBACK);
  });

  it("falls back when blank/whitespace", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    expect(siteUrl()).toBe(FALLBACK);
  });

  it("falls back when the value is unparseable", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://";
    expect(siteUrl()).toBe(FALLBACK);
  });

  it("always returns a value Firebase accepts as a continue URL", () => {
    for (const v of ["wms.mananvasa.com", "https://x.com/", "  ", "garbage url"]) {
      process.env.NEXT_PUBLIC_SITE_URL = v;
      const url = `${siteUrl()}/welcome?intent=invite`;
      // Mirror firebase-admin's accept criteria: parseable, http(s) scheme.
      const parsed = new URL(url);
      expect(["http:", "https:"]).toContain(parsed.protocol);
    }
  });
});
