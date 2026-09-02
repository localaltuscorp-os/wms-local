import { describe, it, expect, vi } from "vitest";

// resend.ts does `import "server-only"`, which throws when loaded outside
// an RSC. Vitest needs a no-op (same mock as tests/unit/cron-digest.test.ts).
vi.mock("server-only", () => ({}));

// resend.ts imports `@/lib/db`, which loads `lib/env.ts` and parses real
// env vars (DATABASE_URL, etc.) at module load. `digestSubject` is a pure
// function and never touches the DB, so stub the module to a bare object so
// the import resolves without env. (Same approach other unit tests take.)
vi.mock("@/lib/db", () => ({ db: {} }));

import { digestSubject } from "@/lib/email/resend";

describe("digestSubject", () => {
  it("all-clear when zero", () => {
    expect(digestSubject(0)).toMatch(/all clear|caught up/i);
  });
  it("singular", () => {
    expect(digestSubject(1)).toBe("You have 1 pending task — Altus Corp Dashboard");
  });
  it("plural", () => {
    expect(digestSubject(5)).toBe("You have 5 pending tasks — Altus Corp Dashboard");
  });
});
