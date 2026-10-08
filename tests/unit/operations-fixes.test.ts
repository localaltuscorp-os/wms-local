import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Operations audit fixes", () => {
  it("guards every feedback manager mutation on the server", () => {
    const actions = source("app/(app)/training/feedback/actions.ts");
    for (const name of ["escalateFeedback", "resolveFeedback", "addFeedbackService", "deleteFeedbackService"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("\nexport async function", actions.indexOf(`export async function ${name}`) + 1));
      expect(body, name).toContain("requireFeedbackManager()");
    }
  });

  it("keeps bulk calendar imports inside one transaction", () => {
    const actions = source("app/(app)/events/actions.ts");
    const body = actions.slice(actions.indexOf("export async function importExecBlocks"), actions.indexOf("/* ── Listing", actions.indexOf("export async function importExecBlocks")));
    expect(body).toContain("await db.transaction(async (tx)");
    expect(body).toContain("await tx.insert(execCalendarEvents)");
  });

  it("keeps recurring routine and materialized rows in one transaction", () => {
    const actions = source("app/(app)/events/actions.ts");
    const body = actions.slice(actions.indexOf("export async function stampRecurringEvent"), actions.indexOf("/* ── Importing", actions.indexOf("export async function stampRecurringEvent")));
    expect(body).toContain("await db.transaction(async (tx)");
    expect(body).toContain("stampDays(tx, me");
  });

  it("feeds active DD Master batch values into Hand-holding", () => {
    const page = source("app/(app)/people-allocation/page.tsx");
    const screen = source("components/people-allocation/allocation-screen.tsx");
    expect(page).toContain('listActiveDdOptions("batch_number")');
    expect(page).toContain("ddBatchOptions={ddBatchOptions}");
    expect(screen).toContain("ddBatchOptions.map");
  });
});
