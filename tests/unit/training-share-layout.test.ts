import { describe, expect, it } from "vitest";
import { codeOf } from "../fixtures/source-code";

describe("Share & Learn compact layout", () => {
  it("keeps the schedule and responsive desktop split", () => {
    const page = codeOf("app/(app)/training/share/page.tsx");
    expect(page).toContain("Daily Learning Share Schedule");
    expect(page).toContain("grid-cols-5 gap-4 max-lg:grid-cols-1");
  });

  it("keeps all scheduling actions and responsive controls", () => {
    const board = codeOf("components/training/share/share-schedule-board.tsx");
    expect(board).toContain("scheduleShare");
    expect(board).toContain("recordShare");
    expect(board).toContain("replaceShare");
    expect(board).toContain("max-md:grid-cols-1");
  });

  it("keeps the Share form and feedback actions while using compact spacing", () => {
    const form = codeOf("components/training/learning/share-form.tsx");
    const feed = codeOf("components/training/learning/share-feed.tsx");
    expect(form).toContain("saveShare");
    expect(form).toContain("min-h-[56px]");
    expect(feed).toContain("rateShare");
    expect(feed).toContain("min-h-[38px]");
  });
});
