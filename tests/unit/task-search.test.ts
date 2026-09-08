import { describe, it, expect } from "vitest";
import { taskMatchesQuery } from "@/lib/tasks/task-search";

/** The row the bug report was filed against: a title the reader could see on
 *  screen, typed back into the search box, matching nothing. */
const row = {
  taskNo: 1042,
  title: "Screenshot sent on WMS group",
  description: "Shared the dashboard screenshot in the WMS WhatsApp group.",
  subject: "Reporting",
  client: "Altus",
  doerName: "Manan Vasa",
};

const match = (q: string) =>
  taskMatchesQuery(q, row.taskNo, row.title, row.description, row.subject, row.client, row.doerName);

describe("taskMatchesQuery", () => {
  it("matches the exact title phrase", () => {
    expect(match("screenshot sent on wms group")).toBe(true);
  });

  it("matches regardless of word order", () => {
    expect(match("wms screenshot")).toBe(true);
  });

  it("survives doubled and trailing whitespace", () => {
    expect(match("screenshot  sent   on wms group ")).toBe(true);
  });

  it("matches across two different fields", () => {
    // "altus" is the client, "screenshot" the title — no single-field phrase
    // match can find this row.
    expect(match("altus screenshot")).toBe(true);
  });

  it("matches text that only appears in the description", () => {
    expect(match("whatsapp")).toBe(true);
  });

  it("matches the task number with and without the hash", () => {
    expect(match("#1042")).toBe(true);
    expect(match("1042")).toBe(true);
  });

  it("ANDs tokens — more words narrow, never widen", () => {
    expect(match("screenshot invoice")).toBe(false);
  });

  it("rejects a query no field contains", () => {
    expect(match("purchase order")).toBe(false);
  });

  it("treats an empty or whitespace-only query as matching everything", () => {
    expect(match("")).toBe(true);
    expect(match("   ")).toBe(true);
  });

  it("skips null fields rather than throwing", () => {
    expect(taskMatchesQuery("acme", null, null, undefined, "Acme Ltd")).toBe(true);
    expect(taskMatchesQuery("acme", null, null, undefined, null)).toBe(false);
  });
});
