import { describe, it, expect } from "vitest";
import {
  JD_MAX_FILES_PER_KIND,
  buildJdAttachmentRows,
  checkJdFile,
  employeeIdFromJdPath,
  jdAcceptAttr,
  type JdUploadRef,
} from "@/lib/jd/attachments";

/**
 * SOP files on a JD (2026-09-18): three boxes, several files each. The rules
 * run in the picker AND on the server, so both refuse the same files.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const JD = "33333333-3333-4333-8333-333333333333";
const path = (who: string, name: string, n = 1) =>
  `jd/${who}/0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${name}`;

describe("checkJdFile — each box takes its own kind of file", () => {
  it("takes video in Video and documents in Guidelines / Templates", () => {
    expect(checkJdFile("video", { name: "How to pack.mp4", size: 5_000_000 })).toEqual({ ok: true });
    expect(checkJdFile("guidelines", { name: "SOP.pdf", size: 200_000 })).toEqual({ ok: true });
    expect(checkJdFile("template", { name: "Count sheet.xlsx", size: 40_000 })).toEqual({ ok: true });
  });

  it("refuses the wrong kind, an empty file and one over 25 MB", () => {
    expect(checkJdFile("video", { name: "SOP.pdf", size: 1000 }).ok).toBe(false);
    expect(checkJdFile("template", { name: "clip.mp4", size: 1000 }).ok).toBe(false);
    expect(checkJdFile("guidelines", { name: "notes.pdf", size: 0 }).ok).toBe(false);
    expect(checkJdFile("guidelines", { name: "big.pdf", size: 26 * 1024 * 1024 }).ok).toBe(false);
    expect(checkJdFile("guidelines", { name: "script.exe", size: 1000 }).ok).toBe(false);
  });

  it("offers the picker only the box's own types", () => {
    expect(jdAcceptAttr("video")).toContain(".mp4");
    expect(jdAcceptAttr("video")).not.toContain(".pdf");
    expect(jdAcceptAttr("template")).toContain(".xlsx");
  });
});

describe("employeeIdFromJdPath — the ownership check", () => {
  it("reads the uploader from a path the server minted", () => {
    expect(employeeIdFromJdPath(path(ME, "SOP.pdf"))).toBe(ME);
  });
  it("rejects anything else", () => {
    expect(employeeIdFromJdPath(`reimbursements/${ME}/x/SOP.pdf`)).toBeNull();
    expect(employeeIdFromJdPath(`jd/${ME}/../../etc/passwd`)).toBeNull();
    expect(employeeIdFromJdPath("jd/not-a-uuid/x/SOP.pdf")).toBeNull();
  });
});

describe("buildJdAttachmentRows", () => {
  const ref = (over: Partial<JdUploadRef> = {}): JdUploadRef => ({
    kind: "guidelines",
    path: path(ME, "SOP.pdf"),
    fileName: "SOP.pdf",
    size: 1234,
    ...over,
  });

  it("turns the caller's own uploads into rows, one per file, duplicates once", () => {
    const res = buildJdAttachmentRows(
      [ref(), ref(), ref({ kind: "video", path: path(ME, "demo.mp4", 2), fileName: "demo.mp4" })],
      ME,
      JD,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ jdId: JD, kind: "guidelines", fileName: "SOP.pdf", mime: "application/pdf", uploadedById: ME });
    expect(res.rows[1]).toMatchObject({ kind: "video", mime: "video/mp4" });
  });

  it("refuses somebody else's upload", () => {
    expect(buildJdAttachmentRows([ref({ path: path(OTHER, "SOP.pdf") })], ME, JD)).toEqual({ ok: false, error: "Invalid upload." });
  });

  it("refuses more than the box holds", () => {
    const many = Array.from({ length: JD_MAX_FILES_PER_KIND + 1 }, (_, i) =>
      ref({ path: `jd/${ME}/${String(i).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa/f${i}.pdf`, fileName: `f${i}.pdf` }),
    );
    const res = buildJdAttachmentRows(many, ME, JD);
    expect(res.ok).toBe(false);
  });
});
