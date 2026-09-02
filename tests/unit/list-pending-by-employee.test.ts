import { describe, it, expect, vi } from "vitest";

// lib/queries/overdue.ts does `import "server-only"`, which throws when
// loaded outside an RSC. Vitest needs a no-op (same as cron-digest.test.ts).
vi.mock("server-only", () => ({}));

// It also imports `@/lib/db`, which validates env at module load. The pure
// shaper under test never touches the db, so a stub is enough to import it.
vi.mock("@/lib/db", () => ({ db: {}, employees: {}, tasks: {} }));

import { shapePendingRows, type PendingQueryRow } from "@/lib/queries/overdue";

const NOW = new Date("2026-06-01T10:00:00Z");

function qrow(p: Partial<PendingQueryRow>): PendingQueryRow {
  return {
    id: "t1", shortId: null, title: "T", subject: "Subj",
    dueAt: new Date("2026-06-10T00:00:00Z"), doerId: "d1", doerName: "Dev",
    ...p,
  };
}

describe("shapePendingRows", () => {
  it("groups by doer", () => {
    const m = shapePendingRows(
      [qrow({ id: "a", doerId: "d1" }), qrow({ id: "b", doerId: "d1" }), qrow({ id: "c", doerId: "d2" })],
      NOW,
    );
    expect(m.get("d1")!.length).toBe(2);
    expect(m.get("d2")!.length).toBe(1);
  });

  it("flags isOverdue only when dueAt < now and computes daysOverdue", () => {
    const m = shapePendingRows(
      [
        qrow({ id: "past", dueAt: new Date("2026-05-29T00:00:00Z") }),
        qrow({ id: "future", dueAt: new Date("2026-06-10T00:00:00Z") }),
        qrow({ id: "nodue", dueAt: null }),
      ],
      NOW,
    );
    const tasks = m.get("d1")!;
    const past = tasks.find((t) => t.id === "past")!;
    const future = tasks.find((t) => t.id === "future")!;
    const nodue = tasks.find((t) => t.id === "nodue")!;
    expect(past.isOverdue).toBe(true);
    expect(past.daysOverdue).toBeGreaterThanOrEqual(3);
    expect(future.isOverdue).toBe(false);
    expect(future.daysOverdue).toBe(0);
    expect(nodue.isOverdue).toBe(false);
  });

  it("falls back to title when subject is empty", () => {
    const m = shapePendingRows([qrow({ subject: "", title: "Fallback" })], NOW);
    expect(m.get("d1")![0]!.subject).toBe("Fallback");
  });

  it("sorts overdue-first, then by dueAt asc, nulls last", () => {
    const m = shapePendingRows(
      [
        qrow({ id: "future", dueAt: new Date("2026-06-10T00:00:00Z") }),
        qrow({ id: "nodue", dueAt: null }),
        qrow({ id: "overdue", dueAt: new Date("2026-05-20T00:00:00Z") }),
      ],
      NOW,
    );
    expect(m.get("d1")!.map((t) => t.id)).toEqual(["overdue", "future", "nodue"]);
  });
});
