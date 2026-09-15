// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/* The button reads the live path to decide whether it exists at all, so the
   pathname is the only thing this test needs to drive. */
let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { BulkAddQuickAction } from "@/components/header/bulk-add-quick-action";

/** Routes that belong to the WMS room — the bulk uploader's home. */
const WMS_ROUTES = ["/dashboard", "/tasks", "/tasks/kanban", "/my-day", "/projects"];

/** One route from each of the other rooms. Bulk-importing rows here would mean
 *  importing TASKS into a module that has none, so the control must be absent —
 *  not disabled, not a no-op: absent. */
const OTHER_ROUTES = ["/hr", "/accounts", "/goals", "/attendance", "/outstanding", "/hub"];

describe("BulkAddQuickAction — WMS only", () => {
  beforeEach(() => {
    pathname = "/dashboard";
  });
  // No global setup file registers RTL's auto-cleanup, so each `it.each` case
  // would otherwise stack another button into the same document and every
  // lookup after the first would find several.
  afterEach(cleanup);

  it.each(WMS_ROUTES)("renders the Bulk Add button on %s", (route) => {
    pathname = route;
    render(<BulkAddQuickAction />);
    expect(screen.getByRole("button", { name: /bulk add tasks/i })).toBeTruthy();
  });

  it.each(OTHER_ROUTES)("renders nothing on %s", (route) => {
    pathname = route;
    const { container } = render(<BulkAddQuickAction />);
    expect(container.innerHTML).toBe("");
  });

  it("does not open its dialog until the button is clicked", () => {
    pathname = "/tasks";
    render(<BulkAddQuickAction />);
    // The uploader is lazy — nothing of the window exists on a cold render, so
    // every page in WMS pays for an icon and a path check, not the importer.
    expect(screen.queryByText(/Download Template/i)).toBeNull();
  });
});
