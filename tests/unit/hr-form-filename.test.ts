import { describe, expect, it } from "vitest";
import { submissionFilename, contentDispositionAttachment } from "@/lib/hr/forms/filename";

/**
 * The result goes straight into a `Content-Disposition` header. A header value
 * cannot contain a newline, and the original strip class (`[^\w\s.-]`) kept
 * them, because `\s` matches `\n` and `\r` — so any stored name with a stray
 * line break returned a 500 instead of a PDF.
 */
describe("submissionFilename", () => {
  it("builds the ordinary name", () => {
    expect(submissionFilename("Exit Interview", "Jane Doe")).toBe("Exit Interview - Jane Doe.pdf");
  });

  it("strips newlines rather than preserving them as whitespace", () => {
    const out = submissionFilename("Exit Interview", "Jane\nDoe");
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toBe("Exit Interview - Jane Doe.pdf");
  });

  it("strips carriage returns and tabs too", () => {
    const out = submissionFilename("Exit\tInterview", "Jane\r\nDoe");
    expect(out).not.toMatch(/[\r\n\t]/);
    expect(out).toBe("Exit Interview - Jane Doe.pdf");
  });

  it("never yields a path separator", () => {
    const out = submissionFilename("../../etc", "pass/wd");
    expect(out).not.toContain("/");
    expect(out).not.toContain("\\");
  });

  it("never starts with a dot, which would be a hidden file or a path segment", () => {
    expect(submissionFilename("..", "..")).not.toMatch(/^\./);
    expect(submissionFilename(".hidden", "Jane")).toBe("hidden - Jane.pdf");
  });

  it("drops quotes, which would terminate the header value early", () => {
    const out = submissionFilename('Exit "Interview"', "Jane Doe");
    expect(out).not.toContain('"');
  });

  it("collapses runs of whitespace into one space", () => {
    expect(submissionFilename("Exit    Interview", "Jane   Doe")).toBe("Exit Interview - Jane Doe.pdf");
  });

  it("omits the separator when one side cleans away to nothing", () => {
    // Not `Exit Interview - .pdf`.
    expect(submissionFilename("Exit Interview", "///")).toBe("Exit Interview.pdf");
  });

  it("falls back when both sides clean away to nothing", () => {
    // Not the bare `-.pdf` a naive join produces.
    expect(submissionFilename("..", "//")).toBe("filled-form.pdf");
  });

  it("keeps names written in a non-Latin script", () => {
    // The reason the strip class is a deny-list: an allow-list of \w deleted
    // these entirely, and an employee downloaded `Exit Interview - .pdf`.
    expect(submissionFilename("Exit Interview", "जेन डो")).toBe("Exit Interview - जेन डो.pdf");
    expect(submissionFilename("Exit Interview", "José Álvarez")).toBe("Exit Interview - José Álvarez.pdf");
  });

  it("keeps the extension exactly once", () => {
    expect(submissionFilename("Report.pdf", "Jane")).toBe("Report.pdf - Jane.pdf");
  });
});

describe("contentDispositionAttachment", () => {
  it("emits both an ASCII fallback and a UTF-8 filename*", () => {
    const header = contentDispositionAttachment("Exit Interview - जेन.pdf");
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
  });

  it("keeps the ASCII fallback free of non-ASCII bytes, without leaving separator debris", () => {
    const header = contentDispositionAttachment("Exit Interview - जेन डो.pdf");
    const ascii = /filename="([^"]*)"/.exec(header)?.[1] ?? "";
    expect(ascii).toMatch(/^[\x20-\x7e]*$/);
    // Not `Exit Interview -  .pdf` — the dangling separator goes with the name.
    expect(ascii).toBe("Exit Interview.pdf");
  });

  it("round-trips the real name through filename*", () => {
    const name = "Exit Interview - जेन डो.pdf";
    const header = contentDispositionAttachment(name);
    const encoded = header.split("filename*=UTF-8''")[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(name);
  });

  it("never lets a newline or a quote into the header", () => {
    const header = contentDispositionAttachment('bad"name\n.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    // The only quotes are the two delimiting the fallback.
    expect(header.split('"').length - 1).toBe(2);
  });

  it("falls back when the name is entirely non-ASCII", () => {
    const header = contentDispositionAttachment("जेन.pdf");
    expect(header).toContain('filename="filled-form.pdf"');
  });
});
