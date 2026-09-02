import { describe, expect, it } from "vitest";
import { rangeFromHhmm, endHhmm } from "@/lib/goals/plan-time";

describe("start/end range (rule 7)", () => {
  it("accepts a normal block and stores its length", () => {
    expect(rangeFromHhmm("18:20", "19:05")).toMatchObject({ ok: true, startMin: 1100, durationMin: 45 });
  });
  it("rejects an end BEFORE the start", () => {
    const r = rangeFromHhmm("18:20", "17:00");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/after the start/i);
  });
  it("rejects a zero-length block", () => {
    expect(rangeFromHhmm("18:20", "18:20").ok).toBe(false);
  });
  it("allows a start with no end", () => {
    expect(rangeFromHhmm("18:20", "")).toMatchObject({ ok: true, startMin: 1100, durationMin: null });
  });
  it("allows no time at all — Anytime", () => {
    expect(rangeFromHhmm("", "")).toMatchObject({ ok: true, startMin: null, durationMin: null });
  });
  it("refuses an end with no start", () => {
    expect(rangeFromHhmm("", "19:00").ok).toBe(false);
  });
  it("renders the end back for the input", () => {
    expect(endHhmm(1100, 45)).toBe("19:05");
    expect(endHhmm(1100, null)).toBe("");
  });
});
