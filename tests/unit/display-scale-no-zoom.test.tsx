// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { DisplayScaleProvider } from "@/components/layout/display-scale-provider";
import { DISPLAY_SCALE_KEY } from "@/lib/display-scale";

/**
 * Regression guard for the display-scale popover-anchoring bug.
 *
 * The display-scale feature used to apply a page-wide CSS `zoom` to
 * <html>. A non-unity `zoom` breaks the coordinate math Radix/floating-ui
 * uses to position portaled panels (dropdowns, popovers, tooltips), so every
 * menu in the app flew off toward a corner on any wide monitor (auto-fit →
 * zoom 1.33). The fix removes the geometric zoom entirely.
 *
 * This test fails on the old provider (it set zoom = 1.33 here) and passes
 * once the provider stops touching `zoom`.
 */
describe("DisplayScaleProvider does not apply a geometric zoom", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    // A wide viewport is exactly where auto-fit produced zoom 1.33.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    localStorage.setItem(DISPLAY_SCALE_KEY, "auto");
    document.documentElement.style.zoom = "";
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
    localStorage.clear();
    document.documentElement.style.zoom = "";
  });

  it("leaves <html> zoom unset on a wide viewport (auto-fit)", () => {
    act(() => {
      render(<DisplayScaleProvider />);
    });
    const zoom = document.documentElement.style.zoom;
    // Must be falsy or an explicit "1"/"normal" — never a scaling factor.
    expect(zoom === "" || zoom === "1" || zoom === "normal").toBe(true);
  });

  it("ignores a manual 'largest' preference too", () => {
    localStorage.setItem(DISPLAY_SCALE_KEY, "largest");
    act(() => {
      render(<DisplayScaleProvider />);
    });
    const zoom = document.documentElement.style.zoom;
    expect(zoom === "" || zoom === "1" || zoom === "normal").toBe(true);
  });
});
