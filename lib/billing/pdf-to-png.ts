import "server-only";

import path from "node:path";

/**
 * PAGE ONE OF A PDF, AS A PNG.
 *
 * Used to put the invoice itself — the exact PDF template, logo, red band and
 * all — into the body of the email as a picture (Manan, 2026-09-19: "in the
 * message I want the whole template image"). Rendering the real PDF rather
 * than re-drawing it in HTML is the point: the picture in the email and the
 * attached file cannot differ, because one is made from the other.
 *
 * pdfjs-dist + @napi-rs/canvas, both loaded lazily and kept out of the bundle
 * (serverExternalPackages), so only the routes that send an invoice pay for
 * them. pdfkit's Helvetica is a standard font that is referenced, not
 * embedded, so pdfjs is pointed at its own standard-font data to draw text.
 */
export async function pdfFirstPageToPng(pdf: Buffer | Uint8Array, scale = 2): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  // A plain forward-slash PATH with a trailing slash — not a file:// URL, which
  // percent-encodes the space in "wms project" and then fails to load.
  const fontDir =
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts").split(path.sep).join("/") + "/";
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl: fontDir,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    // A white page, not a transparent one — mail clients in dark mode would
    // otherwise show the invoice's black text on their dark background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx as never,
      canvas: canvas as never,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await doc.cleanup();
    await loadingTask.destroy();
  }
}
