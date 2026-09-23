/**
 * THE BROWSER HALF OF "DOWNLOAD TEMPLATE".
 *
 * ── WHY NOT JUST AN ANCHOR ─────────────────────────────────────────────────
 * A plain `<a href>` is what most of these buttons used, and it fails in the one
 * way that is hardest to notice: when the request is refused (an expired
 * session, a permission change, a route that 500s) the browser still "navigates"
 * — and the person gets a tab of HTML saved as `template.xlsx`, or nothing at
 * all, with no error anywhere. The same is true of the programmatic
 * `document.createElement("a").click()` pattern, which some browsers ignore
 * outright unless the anchor is in the document.
 *
 * So the download is FETCHED first. A refusal, a redirect to a sign-in page, or
 * any non-spreadsheet body becomes a returned error the caller can show, and a
 * real file is only ever written when the server actually sent one. There is no
 * silent fallback: if the current template cannot be fetched, the person is told
 * rather than handed an older or empty file.
 */

export type TemplateDownloadOutcome =
  | { ok: true; fileName: string }
  | { ok: false; error: string };

/** Content types a template download is allowed to be. */
function isFileContentType(ct: string): boolean {
  const t = ct.toLowerCase();
  return (
    t.includes("spreadsheetml") ||
    t.includes("ms-excel") ||
    t.includes("text/csv") ||
    t.includes("application/octet-stream") ||
    t.includes("application/zip")
  );
}

function fileNameFrom(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/**
 * Fetch a template and hand it to the browser's downloader.
 *
 * `url` is normally built by `templateHref()` (lib/templates/keys.ts); the
 * fallback name is only used if the server's `content-disposition` is missing.
 */
export async function downloadTemplateFile(
  url: string,
  fallbackName = "template.xlsx",
): Promise<TemplateDownloadOutcome> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
    };
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "You do not have access to this template. Sign in again, or ask an admin.",
      };
    }
    if (res.status === 404) {
      return { ok: false, error: "That template is not registered in Upload Master." };
    }
    return { ok: false, error: `The server refused the download (HTTP ${res.status}).` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!isFileContentType(contentType)) {
    // A refused request that still returned 200 — a sign-in page, an error page.
    // Writing that to disk as .xlsx is the bug this function exists to stop.
    return {
      ok: false,
      error: "The server returned a web page instead of a file. Sign in again and retry.",
    };
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    return { ok: false, error: "The template came back empty. Ask an admin to re-upload it." };
  }

  const fileName = fileNameFrom(res.headers.get("content-disposition")) ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  // Attached before clicking — a detached anchor is ignored by some browsers.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick so the browser has taken the blob.
  window.setTimeout(() => URL.revokeObjectURL(href), 0);

  return { ok: true, fileName };
}
