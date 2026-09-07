import { describe, it, expect, afterEach } from "vitest";
import { siteUrl, rehostActionLink } from "@/lib/site-url";

const FALLBACK = "https://altus-corp-dashboard.vercel.app";
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("siteUrl", () => {
  it("returns a well-formed https URL unchanged", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://os.altuscorp.in";
    expect(siteUrl()).toBe("https://os.altuscorp.in");
  });

  it("prepends https:// when the scheme is missing (the prod bug)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "os.altuscorp.in";
    expect(siteUrl()).toBe("https://os.altuscorp.in");
  });

  it("strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://os.altuscorp.in///";
    expect(siteUrl()).toBe("https://os.altuscorp.in");
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
    for (const v of ["os.altuscorp.in", "https://x.com/", "  ", "garbage url"]) {
      process.env.NEXT_PUBLIC_SITE_URL = v;
      const url = `${siteUrl()}/welcome?intent=invite`;
      // Mirror firebase-admin's accept criteria: parseable, http(s) scheme.
      const parsed = new URL(url);
      expect(["http:", "https:"]).toContain(parsed.protocol);
    }
  });
});

describe("rehostActionLink", () => {
  // Firebase builds action links on its own configured host, which as of
  // 2026-09-07 is stuck on a dead domain (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED).
  // The reset is carried by oobCode, so only the origin may change.
  const FIREBASE_LINK =
    "https://wms.mananvasa.com/set-password?mode=resetPassword" +
    "&oobCode=iCuyzPM2VGOV1_WAaY0udOC84x10ttb2S8G73s_rqtUAAAGgew0R6A" +
    "&apiKey=AIzaSyBNQ9eTGVV3SxX-g0BKxwVcLzNsI1fezlM" +
    "&continueUrl=https%3A%2F%2Fos.altuscorp.in%2Flogin&lang=en";

  it("swaps the origin and changes nothing else", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://os.altuscorp.in";
    const before = new URL(FIREBASE_LINK);
    const after = new URL(rehostActionLink(FIREBASE_LINK));

    expect(after.host).toBe("os.altuscorp.in");
    expect(after.pathname).toBe(before.pathname);
    expect(after.search).toBe(before.search);
    // the credential itself must survive byte-for-byte
    expect(after.searchParams.get("oobCode")).toBe(before.searchParams.get("oobCode"));
    expect(after.searchParams.get("continueUrl")).toBe(before.searchParams.get("continueUrl"));
  });

  it("is a no-op once the link is already on our origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://os.altuscorp.in";
    const link = "https://os.altuscorp.in/set-password?oobCode=abc";
    expect(rehostActionLink(link)).toBe(link);
  });

  it("follows NEXT_PUBLIC_SITE_URL rather than hardcoding a host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.example.com";
    expect(new URL(rehostActionLink(FIREBASE_LINK)).host).toBe("staging.example.com");
  });

  it("never throws — an unparseable link is returned unchanged", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://os.altuscorp.in";
    for (const bad of ["", "not a url", "://nope"]) {
      expect(rehostActionLink(bad)).toBe(bad);
    }
  });
});
