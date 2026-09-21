import "server-only";

import path from "node:path";
import { existsSync } from "node:fs";

/**
 * HEADLESS-CHROMIUM PDF RENDERING — the shared launcher and print step.
 *
 * ── WHY THIS EXISTS AS ITS OWN MODULE ──────────────────────────────────────
 * It was extracted from `lib/hr/letters/render-rich.ts`, which had the only copy.
 * A policy document needs the same two things — an environment-aware browser and
 * a hardened print call — and a SECOND copy of a security control is how the
 * second copy drifts. There is now exactly one place that decides which
 * sub-resources a rendered document is allowed to load.
 *
 * ── WHO USES IT ────────────────────────────────────────────────────────────
 *   · `lib/hr/letters/render-rich.ts` — "Edit freely" letters (TipTap HTML).
 *   · `lib/hr/policies/policy-pdf.ts` — policy bodies + their acknowledgements.
 *
 * Both build their own HTML document and hand it here. This module deliberately
 * knows nothing about letterheads, letters or policies: it takes a complete
 * document and returns bytes.
 *
 * ── COST, STATED PLAINLY ───────────────────────────────────────────────────
 * Chromium is heavy: `@sparticuz/chromium` is ~200 MB of binaries, attributed to
 * every route that can reach this module. Both callers import it LAZILY
 * (`await import`) and it is listed in `serverExternalPackages`, so the binary
 * tree never enters a route or client graph — but a FUNCTION that can render a
 * PDF does carry it. Adding a third caller is a real deployment-size decision,
 * not a free one.
 */

/** Candidate Windows Chrome / Edge executables for the dev fallback. */
function windowsChromeCandidates(): string[] {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] || "";
  const list = [
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
    local ? path.join(local, "Google", "Chrome", "Application", "chrome.exe") : "",
    path.join(pf, "Google", "Chrome Beta", "Application", "chrome.exe"),
    path.join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return list.filter(Boolean);
}

/**
 * Launch a headless browser appropriate to the runtime. Throws on failure.
 *
 * `puppeteer-core` and `@sparticuz/chromium` are imported LAZILY (`await import`)
 * so their large binary trees stay out of every module graph that merely imports
 * this file.
 */
export async function launchBrowser(): Promise<any> {
  const puppeteer = await import("puppeteer-core");
  const onVercel = !!process.env.VERCEL || process.env.NODE_ENV === "production";

  if (onVercel) {
    const chromium = (await import("@sparticuz/chromium")).default as any;
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    } as any);
  }

  // Local dev — prefer the installed Chrome via the "chrome" channel.
  try {
    return await puppeteer.launch({ channel: "chrome", headless: true } as any);
  } catch {
    // Fall back to a discovered Windows Chrome / Edge binary.
    for (const candidate of windowsChromeCandidates()) {
      if (existsSync(candidate)) {
        return puppeteer.launch({ executablePath: candidate, headless: true } as any);
      }
    }
    throw new Error(
      "No Chrome/Chromium found for PDF rendering. Install Google Chrome (dev) " +
        "or ensure @sparticuz/chromium is deployed (production).",
    );
  }
}

/** The host whose sub-resources a rendered document may load, if configured. */
function allowedResourceHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
}

/**
 * Print a COMPLETE HTML document to PDF.
 *
 * ── SSRF / EXFILTRATION HARDENING ──────────────────────────────────────────
 * The document can contain user-authored HTML (a "Edit freely" letter body, a
 * CMS-authored policy). Without this, headless Chromium would execute any
 * injected `<script>` and fetch any sub-resource from the SERVER's network
 * position — SSRF to internal hosts and cloud metadata, `file://` reads, and
 * beaconing out. So:
 *
 *   1. JavaScript is DISABLED entirely. A printed document needs none.
 *   2. Every request is intercepted: only `data:` URIs (our inlined letterhead,
 *      fonts and images) and the Supabase signed-URL host are allowed. Anything
 *      else — any other http/https host, `file:`, `blob:`, internal IPs — is
 *      aborted, so a document that tries to phone home simply renders without it.
 *
 * `waitUntil: "load"` rather than `networkidle0`: with interception in place only
 * allowlisted resources load at all, and `load` avoids hanging on the aborts.
 */
export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const [one] = await renderHtmlBatchToPdf([html]);
  return one!;
}

/** Print one document on an already-open browser. */
async function printHtml(browser: any, html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    const supabaseHost = allowedResourceHost();
    await page.setRequestInterception(true);
    page.on("request", (r: any) => {
      const url: string = r.url();
      if (url.startsWith("data:")) return void r.continue();
      try {
        const host = new URL(url).host;
        if (supabaseHost && host === supabaseHost) return void r.continue();
      } catch {
        /* unparseable → block */
      }
      return void r.abort();
    });

    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Print SEVERAL documents, launching the browser ONCE.
 *
 * Launching Chromium is the dominant cost (seconds); printing a further document
 * on an already-open browser is a few hundred milliseconds. A caller that needs N
 * PDFs in one response — "download every signed policy" — would otherwise pay the
 * launch cost N times and very plausibly exceed its function timeout, so this
 * exists as a first-class entry rather than a loop around the single-document one.
 *
 * Sequential by design: the pages share one browser and running them concurrently
 * buys little while making a failure harder to attribute to a document.
 *
 * The same SSRF hardening applies to every document — see `printHtml`.
 */
export async function renderHtmlBatchToPdf(htmls: readonly string[]): Promise<Uint8Array[]> {
  if (htmls.length === 0) return [];

  let browser: any = null;
  try {
    browser = await launchBrowser();
    const out: Uint8Array[] = [];
    for (const html of htmls) out.push(await printHtml(browser, html));
    return out;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore close errors — the PDFs are already in memory */
      }
    }
  }
}
