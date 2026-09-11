// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// The two server-action modules ReviewTable imports. Mocked not just to stub
// the calls but to keep `lib/db` (and its env schema) out of a jsdom run —
// importing them for real fails on missing Supabase vars before a single
// assertion runs.
vi.mock("@/app/(app)/goals/review/actions", () => ({
  submitReview: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(app)/goals/cascade/actions", () => ({
  setGoalCategory: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/toast", () => ({ fireToast: vi.fn() }));

import { ReviewTable } from "@/components/goals/review/review-table";

const ITEM = {
  kind: "goal" as const,
  level: "yearly" as const,
  id: "g1",
  title: "Close 12 deals",
  area: "Revenue",
  category: "Target",
  code: "2026",
  periodLabel: "FY 2026-27",
  pctDone: 0,
  acceptPct: null,
  reviewNotes: null,
  targetQty: 12,
  actualQty: 0,
  targetAmount: null,
  actualAmount: null,
  team: null,
  approvable: true,
  initiatedByMe: true,
};

function setup(over: Partial<typeof ITEM> = {}) {
  render(
    <ReviewTable
      items={[{ ...ITEM, ...over }]}
      canWrite
      canReview
      typeOptions={["Target"]}
      customTypes={[]}
    />,
  );
}
const selfBox = () => screen.getByLabelText("Self percent done") as HTMLInputElement;
const approvedBox = () => screen.getByLabelText("Approved percent") as HTMLInputElement;

describe("Review — percent fields", () => {
  afterEach(cleanup);

  it("shows exactly 100 when 100 is typed into a field showing 0", () => {
    setup();
    const box = selfBox();
    expect(box.value).toBe("0");
    // Focusing selects the contents, so typing replaces rather than prepends —
    // which is what a real user does and what produced "0100" before.
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "100" } });
    expect(box.value).toBe("100");
    expect(box.value).not.toBe("0100");
  });

  it("never leaves a leading zero in front of what was typed", () => {
    setup();
    const box = selfBox();
    // The exact keystroke sequence from the bug report: 1, 0, 0 appended to the
    // standing "0". The field must not end up as "0100".
    fireEvent.change(box, { target: { value: "01" } });
    fireEvent.change(box, { target: { value: "010" } });
    fireEvent.change(box, { target: { value: "0100" } });
    fireEvent.blur(box);
    expect(box.value).toBe("100");
  });

  it("can be cleared, instead of snapping back to 0 mid-edit", () => {
    setup({ pctDone: 40 });
    const box = selfBox();
    fireEvent.change(box, { target: { value: "" } });
    // `|| 0` used to refill the box the instant it was emptied, which is why
    // the leading zero could never be deleted.
    expect(box.value).toBe("");
    fireEvent.change(box, { target: { value: "75" } });
    expect(box.value).toBe("75");
  });

  it("clamps over-100 entries on blur", () => {
    setup();
    const box = selfBox();
    fireEvent.change(box, { target: { value: "999" } });
    fireEvent.blur(box);
    expect(box.value).toBe("100");
  });

  it("ignores letters and symbols", () => {
    setup();
    const box = selfBox();
    fireEvent.change(box, { target: { value: "9e9" } });
    expect(box.value).toBe("99");
    fireEvent.change(box, { target: { value: "-5" } });
    expect(box.value).toBe("5");
  });

  it("caps input at three digits", () => {
    setup();
    const box = selfBox();
    fireEvent.change(box, { target: { value: "12345" } });
    expect(box.value).toBe("123");
    fireEvent.blur(box);
    expect(box.value).toBe("100");
  });

  it("applies the same behaviour to Approved %", () => {
    setup();
    const box = approvedBox();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "0100" } });
    fireEvent.blur(box);
    expect(box.value).toBe("100");
  });

  it("shows the approver a real input, not static text, on an approvable row", () => {
    setup();
    expect(approvedBox().tagName).toBe("INPUT");
    expect(approvedBox().disabled).toBe(false);
  });

  it("says self-completed only where the tier has no approval step", () => {
    setup({ approvable: false });
    expect(screen.queryByLabelText("Approved percent")).toBeNull();
    expect(screen.getByText("self-completed")).toBeTruthy();
  });
});
