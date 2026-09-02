import { describe, it, expect } from "vitest";
import { normalizeQuery, scoreHit, rankHits } from "@/lib/search/rank";

describe("normalizeQuery", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeQuery("  foo   bar ").q).toBe("foo bar");
  });
  it("detects a bare number as an exact task number", () => {
    expect(normalizeQuery("1042").asNumber).toBe(1042);
  });
  it("detects a #-prefixed number", () => {
    expect(normalizeQuery("#1042").asNumber).toBe(1042);
  });
  it("non-numeric query has null asNumber", () => {
    expect(normalizeQuery("acme").asNumber).toBeNull();
  });
  it("escapes ILIKE wildcards in the like pattern", () => {
    expect(normalizeQuery("50%").like).toBe("%50\\%%");
  });
});

describe("scoreHit", () => {
  it("exact id match outranks any fuzzy/substring score", () => {
    const exact = scoreHit({ similarity: 0, ilikeHit: false, exactId: true, recencyMs: 0 });
    const fuzzy = scoreHit({ similarity: 0.99, ilikeHit: true, exactId: false, recencyMs: 0 });
    expect(exact).toBeGreaterThan(fuzzy);
  });
  it("substring (ilike) hit outranks fuzzy-only with equal similarity", () => {
    const sub = scoreHit({ similarity: 0.4, ilikeHit: true, exactId: false, recencyMs: 0 });
    const fuz = scoreHit({ similarity: 0.4, ilikeHit: false, exactId: false, recencyMs: 0 });
    expect(sub).toBeGreaterThan(fuz);
  });
  it("uses the larger of similarity and ftsRank", () => {
    const a = scoreHit({ similarity: 0.2, ftsRank: 0.8, ilikeHit: false, exactId: false, recencyMs: 0 });
    const b = scoreHit({ similarity: 0.2, ftsRank: 0.1, ilikeHit: false, exactId: false, recencyMs: 0 });
    expect(a).toBeGreaterThan(b);
  });
});

describe("rankHits", () => {
  const mk = (signals: Parameters<typeof scoreHit>[0], id: string) => ({ id, signals });

  it("always orders active above archived, regardless of score", () => {
    const archivedStrong = mk({ similarity: 0.99, ilikeHit: true, exactId: false, archived: true, recencyMs: 0 }, "arch");
    const activeWeak = mk({ similarity: 0.1, ilikeHit: false, exactId: false, recencyMs: 0 }, "act");
    const out = rankHits([archivedStrong, activeWeak]);
    expect(out.map((h) => h.id)).toEqual(["act", "arch"]);
  });

  it("orders active above inactive people", () => {
    const inactive = mk({ similarity: 0.9, ilikeHit: true, exactId: false, inactive: true, recencyMs: 0 }, "in");
    const active = mk({ similarity: 0.5, ilikeHit: true, exactId: false, recencyMs: 0 }, "ac");
    expect(rankHits([inactive, active]).map((h) => h.id)).toEqual(["ac", "in"]);
  });

  it("within the same tier, higher score wins", () => {
    const lo = mk({ similarity: 0.3, ilikeHit: false, exactId: false, recencyMs: 0 }, "lo");
    const hi = mk({ similarity: 0.8, ilikeHit: true, exactId: false, recencyMs: 0 }, "hi");
    expect(rankHits([lo, hi]).map((h) => h.id)).toEqual(["hi", "lo"]);
  });

  it("breaks score ties by recency (newer first)", () => {
    const old = mk({ similarity: 0.5, ilikeHit: true, exactId: false, recencyMs: 100 }, "old");
    const neu = mk({ similarity: 0.5, ilikeHit: true, exactId: false, recencyMs: 200 }, "new");
    expect(rankHits([old, neu]).map((h) => h.id)).toEqual(["new", "old"]);
  });
});
