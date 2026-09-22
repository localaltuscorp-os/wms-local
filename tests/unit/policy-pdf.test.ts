import { describe, it, expect, vi } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * THE FULL POLICY PDF — the body text, not just the acknowledgement.
 *
 * The bug this fixes: "download the policy" handed people
 * `document_signatures.signed_pdf_path`, which is the ACKNOWLEDGEMENT — consent,
 * identity, signature. It never contained the policy's text. So the download was
 * a receipt for a document you could not read.
 *
 * The fix renders the SAME component the reader page shows, through Chromium, so
 * the download cannot diverge from the screen. The parts worth testing are the
 * two bits of glue that make a React component printable standalone: inlining the
 * root-relative asset paths, and naming the fonts.
 */

const { inlinePublicAssets } = await import("@/lib/hr/policies/policy-pdf");

describe("root-relative assets are inlined before printing", () => {
  it("rewrites an <img src> to a data URI", async () => {
    // Chromium's request allowlist permits only `data:` and the Supabase host, so
    // a path like this would be ABORTED and the letterhead would print blank.
    const html = await inlinePublicAssets(
      `<div><img class="alh-art" src="/letterhead/altus-header.png" alt=""></div>`,
    );
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('src="/letterhead/');
  });

  it("rewrites url(/…) inside an inline style too", async () => {
    // The letterhead positions some of its art through style attributes.
    const html = await inlinePublicAssets(
      `<div style="background-image:url(/letterhead/altus-footer.png)"></div>`,
    );
    expect(html).toContain("url(\"data:image/png;base64,");
  });

  it("leaves a reference it cannot resolve EXACTLY as it was", async () => {
    // Blanking it would emit an empty src and lose the information that a file
    // was expected; leaving it means the request is blocked exactly as before,
    // and the missing asset is still visible in the markup.
    const original = `<img src="/does/not/exist-9f3a.png">`;
    expect(await inlinePublicAssets(original)).toBe(original);
  });

  it("does not touch absolute, data or relative URLs", async () => {
    const html =
      `<img src="https://example.com/x.png"><img src="data:image/png;base64,AAA">` +
      `<img src="relative.png">`;
    expect(await inlinePublicAssets(html)).toBe(html);
  });

  it("refuses to escape the public directory", async () => {
    // A `..` in a path must not become a read of the server's filesystem — the
    // documents this runs on include CMS-authored markup.
    const original = `<img src="/../../package.json">`;
    expect(await inlinePublicAssets(original)).toBe(original);
  });
});

describe("the download routes carry the body, not just the signature", () => {
  const single = codeOf("app/api/hr/policies/download/route.ts");
  const all = codeOf("app/api/hr/policies/download-all/route.ts");

  it("the single-policy route renders the published text", () => {
    expect(single).toMatch(/loadPublishedPolicy/);
    expect(single).toMatch(/renderPolicyPdf/);
  });

  it("and REFUSES to degrade to the acknowledgement alone", () => {
    // Quietly returning the receipt is the exact bug this fixes — the person
    // would have no way to tell they did not get the policy.
    expect(single).toMatch(/body render failed/);
    expect(single).toMatch(/status: 503/);
    // The acknowledgement is fetched server-side now, not redirected to: a
    // redirect cannot merge two PDFs.
    expect(single).not.toMatch(/createSignedUrl/);
  });

  it("the packet route renders every body on ONE browser launch", () => {
    // A launch per policy would put a multi-second charge on each document and
    // plausibly blow the function timeout on a long service record.
    expect(all).toMatch(/renderPolicyPdfs/);
    expect(all).not.toMatch(/renderPolicyPdf\(/);
  });

  it("and reports how many policies came through without their text", () => {
    // Failing the whole packet would deny somebody twenty working policies
    // because one was broken; silently shipping a receipt-only packet would hide
    // it. A count in a header does neither.
    expect(all).toMatch(/X-Policies-Without-Text/);
  });
});

describe("one renderer for the screen and the download", () => {
  it("uses the SAME component the reader page uses", () => {
    // A second, pdfkit-shaped implementation would have to be kept in step with
    // this one forever, and a legal document that renders differently from the
    // version people signed is worse than no export at all.
    const src = codeOf("lib/hr/policies/policy-pdf.tsx");
    expect(src).toMatch(/renderToStaticMarkup/);
    expect(src).toMatch(/PolicyDocument/);
  });

  it("there is exactly ONE Chromium launch implementation", () => {
    // The request interception in lib/pdf/chromium.ts is a security control, and
    // two copies of a security control is how the second copy drifts.
    const letters = codeOf("lib/hr/letters/render-rich.ts");
    expect(letters).not.toMatch(/puppeteer\.launch/);
    expect(letters).not.toMatch(/setRequestInterception/);
    expect(letters).toMatch(/renderHtmlToPdf/);
  });
});
