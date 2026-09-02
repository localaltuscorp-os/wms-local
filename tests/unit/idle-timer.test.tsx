// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { IdleTimer } from "@/components/auth/idle-timer";

describe("IdleTimer", () => {
  let onTimeout: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    onTimeout = vi.fn<() => void>();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("fires onTimeout after timeoutMs of no activity", () => {
    render(<IdleTimer timeoutMs={10_000} onTimeout={onTimeout} warningMs={2_000} />);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets on user activity", () => {
    render(<IdleTimer timeoutMs={10_000} onTimeout={onTimeout} warningMs={2_000} />);
    act(() => { vi.advanceTimersByTime(9_000); });
    // The component throttles resets to once per second. We need to bypass that
    // for this test — advance real time before the fireEvent so the throttle gate opens.
    fireEvent.keyDown(document, { key: "a" });
    act(() => { vi.advanceTimersByTime(9_000); });
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("shows warning at timeoutMs - warningMs", () => {
    const { queryByText } = render(
      <IdleTimer timeoutMs={10_000} onTimeout={onTimeout} warningMs={2_000} />,
    );
    expect(queryByText(/Stay signed in/i)).toBeNull();
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(queryByText(/Stay signed in/i)).not.toBeNull();
  });

  it("clears warning + resets when 'Stay signed in' clicked", () => {
    const { getByText, queryByText } = render(
      <IdleTimer timeoutMs={10_000} onTimeout={onTimeout} warningMs={2_000} />,
    );
    act(() => { vi.advanceTimersByTime(8_000); });
    fireEvent.click(getByText(/Stay signed in/i));
    expect(queryByText(/Stay signed in/i)).toBeNull();
    act(() => { vi.advanceTimersByTime(9_000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("cleans up listeners on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(
      <IdleTimer timeoutMs={10_000} onTimeout={onTimeout} warningMs={2_000} />,
    );
    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });
});
