// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// Server actions and the punch helper — imported at module scope by DayReview,
// so they have to be stubbed or the DB/env comes with them into jsdom.
vi.mock("@/app/(app)/goals/plan/actions", () => ({
  closeMyDay: vi.fn(async () => ({ ok: true })),
  reopenPlan: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/attendance/auto-punch", () => ({ autoPunch: vi.fn(async () => {}) }));
vi.mock("@/lib/toast", () => ({ fireToast: vi.fn() }));

import { DayReview } from "@/components/goals/plan/day-review";
import type { PlanItem } from "@/components/goals/plan/types";

const ITEM: PlanItem = {
  id: "p1",
  title: "Ship the duplicate dialog",
  subtitle: null,
  origin: "standalone",
  kind: "task",
  done: false,
};

const DAY = "2026-09-10";

/* The row renders its action set more than once (a wide and a narrow variant),
   so every query here is explicit about WHICH copy it means rather than
   assuming one. `nth` counts duplicate buttons in DOM order. */
const dupButtons = () => screen.getAllByRole("button", { name: /^duplicate$/i });
const openDup = (nth = 0) => fireEvent.click(dupButtons()[nth]!);
const dialog = () => screen.getByRole("dialog", { name: /duplicate this commitment/i });
const confirm = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Duplicate" }));
const cancel = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
const dialogCount = () => screen.queryAllByRole("dialog", { name: /duplicate this commitment/i }).length;

function setup(over: Partial<React.ComponentProps<typeof DayReview>> = {}) {
  const props = {
    // "closeout" is the end-of-day list — the screen with a row per
    // commitment and the decision buttons. "active" is the "Your Day Is
    // Planned" splash and has no rows at all.
    phase: "closeout" as const,
    items: [ITEM],
    dayYmd: DAY,
    onBackToPlan: vi.fn(),
    onToCloseout: vi.fn(),
    onAdjust: vi.fn(),
    onClosed: vi.fn(),
    onReopened: vi.fn(),
    onToggleDone: vi.fn(),
    onPending: vi.fn(),
    onTransfer: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onAddCommitment: vi.fn(),
    busyId: null,
    ...over,
  };
  render(<DayReview {...props} />);
  return props;
}

describe("Day review row — duplicate and dismiss", () => {
  afterEach(cleanup);

  it("asks which day before duplicating, instead of copying onto today", () => {
    const p = setup();
    openDup();
    expect(dialog()).toBeTruthy();
    // Nothing is copied until the dialog is confirmed.
    expect(p.onDuplicate).not.toHaveBeenCalled();
  });

  it("opens the picker on the day being reviewed", () => {
    setup();
    openDup();
    const date = within(dialog()).getByLabelText("Day to copy this onto") as HTMLInputElement;
    expect(date.value).toBe(DAY);
  });

  it("duplicates onto the chosen day", () => {
    const p = setup();
    openDup();
    fireEvent.change(within(dialog()).getByLabelText("Day to copy this onto"), {
      target: { value: "2026-09-17" },
    });
    confirm();
    expect(p.onDuplicate).toHaveBeenCalledWith(ITEM, "2026-09-17");
  });

  it("copies nothing when the dialog is cancelled", () => {
    const p = setup();
    openDup();
    fireEvent.change(within(dialog()).getByLabelText("Day to copy this onto"), {
      target: { value: "2026-09-17" },
    });
    cancel();
    expect(p.onDuplicate).not.toHaveBeenCalled();
    expect(dialogCount()).toBe(0);
  });

  it("sends the × to Unfinished, and says so", () => {
    const p = setup();
    const x = screen.getAllByRole("button", { name: `Move ${ITEM.title} to Unfinished` })[0]!;
    expect(x.getAttribute("title")).toMatch(/unfinished/i);
    // It must NOT still advertise the Recycle Bin — that was the old meaning.
    expect(x.getAttribute("title")).not.toMatch(/recycle/i);
    fireEvent.click(x);
    expect(p.onRemove).toHaveBeenCalledWith(ITEM);
  });

  it("keeps one dialog for the whole list, not one per row", () => {
    // It portals to <body>; one per row would be N identical overlays.
    setup({ items: [ITEM, { ...ITEM, id: "p2", title: "Second" }] });
    expect(dialogCount()).toBe(0);
    openDup(dupButtons().length - 1);
    expect(dialogCount()).toBe(1);
  });

  it("duplicates the row whose button was pressed", () => {
    const second = { ...ITEM, id: "p2", title: "Second" };
    const p = setup({ items: [ITEM, second] });
    // The LAST duplicate button belongs to the last row, whichever variant it is.
    openDup(dupButtons().length - 1);
    confirm();
    expect(p.onDuplicate).toHaveBeenCalledWith(second, DAY);
  });
});
