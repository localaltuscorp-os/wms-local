import { describe, expect, it } from "vitest";
import {
  WORK_SAMPLES_MAX,
  describeWorkSamples,
  isWorkSamplePath,
  normaliseWorkLink,
  parseWorkSamples,
  serialiseWorkSamples,
  workFileProblem,
  workSamplesUnder,
} from "@/lib/hr/candidate/work-samples";
import { intakeResponses } from "@/lib/hr/candidate/intake-responses";

const U = "0b6c7f2e-8d4a-4a53-9f7e-2c1d3e4f5a6b";
const OTHER = "11111111-2222-4333-8444-555555555555";

describe("normaliseWorkLink", () => {
  it("adds https to a bare host", () => {
    expect(normaliseWorkLink("github.com/rudra")).toBe("https://github.com/rudra");
  });
  it("keeps http(s) links", () => {
    expect(normaliseWorkLink(" https://behance.net/x ")).toBe("https://behance.net/x");
  });
  it("refuses other schemes and non-links", () => {
    expect(normaliseWorkLink("javascript:alert(1)")).toBeNull();
    expect(normaliseWorkLink("mailto:a@b.com")).toBeNull();
    expect(normaliseWorkLink("portfolio")).toBeNull();
    expect(normaliseWorkLink("")).toBeNull();
  });
});

describe("parseWorkSamples", () => {
  it("round-trips links and files", () => {
    const items = [
      { kind: "link" as const, url: "https://github.com/a" },
      { kind: "file" as const, path: `candidate-intake/work/${U}/cv.pdf`, name: "cv.pdf", size: 1200, mime: "application/pdf" },
    ];
    expect(parseWorkSamples(serialiseWorkSamples(items))).toEqual(items);
  });
  it("drops malformed input without throwing", () => {
    expect(parseWorkSamples("not json")).toEqual([]);
    expect(parseWorkSamples('{"kind":"link"}')).toEqual([]);
    expect(parseWorkSamples('[{"kind":"link","url":"javascript:x"},{"kind":"file"}]')).toEqual([]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: "link", url: `https://x.com/${i}` }));
    expect(parseWorkSamples(JSON.stringify(many))).toHaveLength(WORK_SAMPLES_MAX);
  });
  it("serialises an empty list to an empty answer", () => {
    expect(serialiseWorkSamples([])).toBe("");
  });
});

describe("workSamplesUnder (candidate ownership)", () => {
  it("keeps links and own files, drops foreign files", () => {
    const raw = JSON.stringify([
      { kind: "link", url: "https://a.com" },
      { kind: "file", path: `candidate-intake/${U}/work-${OTHER}/mine.pdf`, name: "mine.pdf", size: 1, mime: null },
      { kind: "file", path: `candidate-intake/${OTHER}/work-${U}/theirs.pdf`, name: "theirs.pdf", size: 1, mime: null },
    ]);
    const kept = parseWorkSamples(workSamplesUnder(raw, `candidate-intake/${U}/`));
    expect(kept.map((s) => (s.kind === "link" ? s.url : s.name))).toEqual(["https://a.com/", "mine.pdf"]);
  });
});

describe("isWorkSamplePath", () => {
  it("accepts the two minted shapes", () => {
    expect(isWorkSamplePath(`candidate-intake/work/${U}/cv.pdf`)).toBe(true);
    expect(isWorkSamplePath(`candidate-intake/${U}/work-${OTHER}/My_Work.docx`)).toBe(true);
  });
  it("refuses photos, other folders and traversal", () => {
    expect(isWorkSamplePath(`candidate-intake/photo/${U}.jpg`)).toBe(false);
    expect(isWorkSamplePath(`dossier/onboarding/${U}/x.pdf`)).toBe(false);
    expect(isWorkSamplePath(`candidate-intake/work/${U}/../x.pdf`)).toBe(false);
  });
});

describe("workFileProblem", () => {
  it("allows documents and images", () => {
    expect(workFileProblem({ name: "cv.pdf", mime: "application/pdf", size: 1000 })).toBeNull();
    expect(workFileProblem({ name: "shot.png", mime: "image/png", size: 1000 })).toBeNull();
  });
  it("blocks executables, pages and oversize files", () => {
    expect(workFileProblem({ name: "run.exe", size: 10 })).toMatch(/not allowed/);
    expect(workFileProblem({ name: "x.svg", mime: "image/svg+xml", size: 10 })).toMatch(/not allowed/);
    expect(workFileProblem({ name: "big.pdf", size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });
});

describe("HR forms index", () => {
  it("lists work samples under Personal Details", () => {
    const raw = JSON.stringify([
      { kind: "link", url: "https://github.com/a" },
      { kind: "file", path: `candidate-intake/work/${U}/cv.pdf`, name: "cv.pdf", size: 1, mime: null },
    ]);
    expect(describeWorkSamples(raw)).toBe("https://github.com/a\ncv.pdf (file)");
    const row = intakeResponses({ "personal.workSamples": raw }).find((r) => r.question === "Work samples & links");
    expect(row?.answer).toBe("https://github.com/a\ncv.pdf (file)");
  });
  it("adds nothing when there are none", () => {
    expect(intakeResponses({}).some((r) => r.question === "Work samples & links")).toBe(false);
  });
});
