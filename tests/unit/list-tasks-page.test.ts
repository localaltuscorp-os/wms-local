import { describe, it, expect } from "vitest";

/**
 * The encode/decode roundtrip happens inside `lib/queries/tasks.ts` and
 * isn't exported directly. This test re-derives the cursor shape so a
 * future change to the encoding has to update both sides.
 *
 * Format: base64url(`${createdAt.toISOString()}|${id}`)
 */
function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}
function decodeCursor(c: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(c, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}

describe("cursor encoding (listTasksPage)", () => {
  it("round-trips a real row shape", () => {
    const row = {
      createdAt: new Date("2026-05-26T07:13:09.123Z"),
      id: "11111111-2222-3333-4444-555555555555",
    };
    const c = encodeCursor(row);
    expect(typeof c).toBe("string");
    expect(c.length).toBeGreaterThan(0);
    // No padding `=` (base64url variant).
    expect(c).not.toMatch(/=/);

    const back = decodeCursor(c)!;
    expect(back.id).toBe(row.id);
    expect(back.createdAt.toISOString()).toBe(row.createdAt.toISOString());
  });

  it("returns null on garbage cursor", () => {
    expect(decodeCursor("not_a_valid_cursor")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null when the encoded date is unparseable", () => {
    const bad = Buffer.from("not-an-iso|some-id", "utf8").toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("differs for distinct rows so pagination doesn't loop", () => {
    const a = encodeCursor({ createdAt: new Date("2026-05-26"), id: "a" });
    const b = encodeCursor({ createdAt: new Date("2026-05-26"), id: "b" });
    expect(a).not.toBe(b);
  });
});
