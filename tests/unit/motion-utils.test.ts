// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTouchDevice } from "@/lib/motion-utils";

describe("useTouchDevice", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((q: string) => ({
        matches: q === "(pointer: coarse)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it("returns true when pointer is coarse", () => {
    const { result } = renderHook(() => useTouchDevice());
    expect(result.current).toBe(true);
  });
});
