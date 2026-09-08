import { describe, it, expect } from "vitest";
import { isPdf, isPreviewable, previewContentType } from "@/lib/storage/previewable";

/**
 * The allow-list that decides inline-vs-download. It is a security boundary as
 * much as a UX one: anything it says is previewable gets served with a
 * Content-Type this app chose and rendered by the browser on our own origin.
 */
describe("previewContentType", () => {
  it("serves a PDF and images inline", () => {
    expect(previewContentType("report.pdf")).toBe("application/pdf");
    expect(previewContentType("photo.PNG")).toBe("image/png");
    expect(previewContentType("scan.jpeg")).toBe("image/jpeg");
  });

  it("serves text-ish files as text/plain, never as their own type", () => {
    // text/csv and text/markdown are both types a browser may hand to a
    // helper or render; text/plain is the one that certainly does not.
    expect(previewContentType("rows.csv")).toBe("text/plain; charset=utf-8");
    expect(previewContentType("notes.md")).toBe("text/plain; charset=utf-8");
  });

  it("refuses everything scriptable, so it downloads instead", () => {
    // .html and .svg are already refused at upload; this is the second gate,
    // and it must hold on its own if the first one ever changes.
    for (const name of ["page.html", "page.htm", "icon.svg", "app.js", "run.exe", "a.xhtml"]) {
      expect(previewContentType(name)).toBeNull();
      expect(isPreviewable(name)).toBe(false);
    }
  });

  it("refuses office formats a browser cannot render", () => {
    for (const name of ["book.xlsx", "doc.docx", "deck.pptx", "archive.zip"]) {
      expect(isPreviewable(name)).toBe(false);
    }
  });

  it("is not fooled by a preview extension earlier in the name", () => {
    // The LAST extension is the one the browser acts on.
    expect(previewContentType("invoice.pdf.exe")).toBeNull();
    expect(previewContentType("report.pdf.html")).toBeNull();
  });

  it("handles names with no extension, and paths", () => {
    expect(previewContentType("README")).toBeNull();
    expect(previewContentType("")).toBeNull();
    expect(previewContentType("project-node-attachments/abc/file.pdf")).toBe("application/pdf");
  });
});

describe("isPdf", () => {
  it("is true only for a real .pdf ending", () => {
    expect(isPdf("a.pdf")).toBe(true);
    expect(isPdf("A.PDF")).toBe(true);
    expect(isPdf("a.pdf.exe")).toBe(false);
    expect(isPdf("a.png")).toBe(false);
  });
});
