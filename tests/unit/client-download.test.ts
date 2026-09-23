// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadTemplateFile } from "@/lib/templates/client-download";

/**
 * THE DOWNLOAD BUTTON IN THE BROWSER.
 *
 * Every "Download Template" used to be a plain anchor (or a programmatic
 * `a.click()`), and both fail in the same silent way: a refused request still
 * "navigates", and the person ends up with a page of HTML named `.xlsx` — or
 * nothing at all, with no error shown. These tests pin the behaviour that
 * replaced it: a real fetch, a refusal reported as an error, and a file written
 * only when the server actually sent one.
 */

/** The click the helper performs, captured instead of navigating. */
const clicks: { href: string; download: string; inDocument: boolean }[] = [];

beforeEach(() => {
  clicks.length = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag) as HTMLElement;
    if (tag === "a") {
      const anchor = el as HTMLAnchorElement;
      anchor.click = () => {
        clicks.push({
          href: anchor.href,
          download: anchor.download,
          // A detached anchor is ignored by some browsers, which is one of the
          // silent failures this helper exists to avoid.
          inDocument: document.body.contains(anchor),
        });
      };
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function respond(init: {
  status?: number;
  contentType?: string;
  disposition?: string;
  body?: Blob;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      headers: new Headers({
        "content-type": init.contentType ?? "",
        ...(init.disposition ? { "content-disposition": init.disposition } : {}),
      }),
      blob: async () => init.body ?? new Blob([new Uint8Array([0x50, 0x4b, 1, 2, 3])]),
    })),
  );
}

describe("downloadTemplateFile", () => {
  it("writes the file the server sent, under the server's filename", async () => {
    respond({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: 'attachment; filename="Altus-Tasks-Template.xlsx"',
    });

    const res = await downloadTemplateFile("/api/templates/tasks");

    expect(res.ok).toBe(true);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe("Altus-Tasks-Template.xlsx");
    expect(clicks[0]!.inDocument).toBe(true);
  });

  it("falls back to the caller's filename when the header is missing", async () => {
    respond({ contentType: "application/octet-stream" });
    await downloadTemplateFile("/api/templates/tasks", "Fallback.xlsx");
    expect(clicks[0]!.download).toBe("Fallback.xlsx");
  });

  it("REFUSES to save an HTML page as a spreadsheet", async () => {
    // 200 + HTML: the sign-in page, an error page. This is the bug.
    respond({ contentType: "text/html; charset=utf-8" });

    const res = await downloadTemplateFile("/api/templates/tasks");

    expect(res.ok).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it("reports a refused request instead of downloading nothing quietly", async () => {
    respond({ status: 403, contentType: "text/html" });

    const res = await downloadTemplateFile("/api/templates/tasks");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/access/i);
    expect(clicks).toHaveLength(0);
  });

  it("reports an unregistered template key", async () => {
    respond({ status: 404, contentType: "text/plain" });
    const res = await downloadTemplateFile("/api/templates/nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Upload Master/);
  });

  it("reports an empty body rather than writing a zero-byte file", async () => {
    respond({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: new Blob([]),
    });
    const res = await downloadTemplateFile("/api/templates/tasks");
    expect(res.ok).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const res = await downloadTemplateFile("/api/templates/tasks");
    expect(res.ok).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it("asks for the current file, never a cached one", async () => {
    respond({ contentType: "text/csv" });
    await downloadTemplateFile("/api/templates/weekly_goals_bulk_import");
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("/api/templates/weekly_goals_bulk_import");
    expect(call[1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });
});
