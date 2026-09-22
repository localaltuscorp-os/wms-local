import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { InvoiceView, type SheetImg } from "@/components/billing/invoice-view";
import type { InvoiceViewModel } from "@/lib/billing/view-model";
import { launchBrowser } from "@/lib/pdf/chromium";

/**
 * THE INVOICE SHEET — THE ON-SCREEN TEMPLATE, AS A FILE.
 *
 * Manan, 2026-09-19: "when I download the template, why does it not download
 * exactly my template?" The download used to be DRAWN a second time by pdfkit
 * (lib/billing/invoice-pdf.ts), so it only resembled the sheet on screen. This
 * renders the sheet on screen — <InvoiceView>, styled by the `.billing-a4` /
 * `.inv-*` block of app/globals.css, itself a port of the reference
 * public/billing/invoice-template.html — in headless Chromium, and prints it.
 * The PDF you download, the PDF attached to the email and the picture in the
 * email body are all that one sheet.
 *
 * Chromium comes from the HR-letter renderer (installed Chrome locally,
 * @sparticuz/chromium on Vercel). Callers keep pdfkit as the fallback, so a
 * machine with no Chromium still produces a document.
 */

/** The invoice sheet's CSS, cut from app/globals.css (screen + its print block). */
function sheetCss(): string {
  const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

  const bannerAt = css.indexOf("THE TAX INVOICE SHEET");
  const start = css.lastIndexOf("/*", bannerAt);
  const end = css.indexOf("/* Outstanding dashboard print", bannerAt);
  const screen = start >= 0 && end > start ? css.slice(start, end) : "";

  // "BILLING — print one document and nothing else" — its @media print block.
  let print = "";
  const pAt = css.indexOf("BILLING — print one document");
  if (pAt >= 0) {
    const open = css.indexOf("@media print {", pAt);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        print = css.slice(open, i + 1);
        break;
      }
    }
  }

  // Tailwind's preflight is part of every page in the app, so the sheet's CSS
  // silently depends on it — box-sizing above all (without it the 210mm sheet
  // grows by its own padding). The parts the sheet relies on:
  const preflight = `
    *,::before,::after{box-sizing:border-box;border:0 solid;margin:0;padding:0}
    img,svg{display:block;max-width:100%;height:auto}
    table{border-collapse:collapse;text-indent:0;border-color:inherit}
    h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
  `;
  // The utility classes InvoiceView itself uses (grep className in the view).
  const utilities = String.raw`
    .shrink-0{flex-shrink:0}.block{display:block}.contents{display:contents}
    .whitespace-pre-line{white-space:pre-line}.text-center{text-align:center}
    .font-bold{font-weight:700}.font-extrabold{font-weight:800}
    .text-\[9\.5pt\]{font-size:9.5pt}.tracking-\[0\.04em\]{letter-spacing:.04em}
    .max-h-full{max-height:100%}.w-full{width:100%}.w-auto{width:auto}.h-auto{height:auto}
    .object-contain{object-fit:contain}
  `;
  return preflight + "\n" + screen + "\n" + print + "\n" + utilities;
}

/** "/logos/x.jpg" → a data: URI read from public/, so the page needs no server. */
function inlinePublic(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("/")) return url;
  const file = path.join(process.cwd(), "public", url.replace(/^\/+/, "").split("?")[0]!);
  if (!existsSync(file)) return url;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

async function sheetHtml(vm: InvoiceViewModel): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const withImages: InvoiceViewModel = {
    ...vm,
    seller: {
      ...vm.seller,
      logoUrl: inlinePublic(vm.seller.logoUrl),
      signatureImageUrl: inlinePublic(vm.seller.signatureImageUrl),
    },
  };
  // Plain <img>, every public/ file inlined as data: — the page is rendered
  // from a string, with no server behind it to fetch "/logos/…" from.
  const Img: SheetImg = ({ src, alt, width, height, className }) =>
    createElement("img", { src: inlinePublic(src) ?? src, alt, width, height, className });
  const markup = renderToStaticMarkup(createElement(InvoiceView, { vm: withImages, Img }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    ${sheetCss()}
  </style></head><body>${markup}</body></html>`;
}

/** The sheet as an A4 PDF, and page one of it as a PNG — one browser launch. */
export async function renderInvoiceSheet(
  vm: InvoiceViewModel,
  want: { pdf?: boolean; png?: boolean } = { pdf: true, png: true },
): Promise<{ pdf?: Buffer; png?: Buffer }> {
  const html = await sheetHtml(vm);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // 96dpi A4 width, scaled 2x so the picture in the email is crisp.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load" });
    const out: { pdf?: Buffer; png?: Buffer } = {};
    if (want.pdf) {
      out.pdf = Buffer.from(
        await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }),
      );
    }
    if (want.png) {
      // The sheet's own box, clipped exactly — no page background around it.
      const box = await page.$eval(".billing-a4", (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      const shot = await page.screenshot({ type: "png", clip: box, captureBeyondViewport: true });
      out.png = Buffer.from(shot);
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}
