// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";

import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";

const START = "2026-09-10T10:00:00.000Z";

function Clock() {
  const secs = useElapsedSeconds(START);
  return <span data-testid="clock">{600 + secs}</span>;
}

describe("useElapsedSeconds — hydration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the banked total on the server, with no elapsed time guessed", () => {
    // Ten minutes into the session. The SERVER must still print 600, because
    // whatever it prints is stale before the browser sees it.
    vi.setSystemTime(new Date("2026-09-10T10:10:00.000Z"));
    expect(renderToString(<Clock />)).toContain(">600<");
  });

  it("hydrates without a mismatch even when the clock has moved on", async () => {
    vi.setSystemTime(new Date("2026-09-10T10:00:30.000Z"));
    const html = renderToString(<Clock />);

    // Half a minute passes between the server rendering the page and the
    // browser hydrating it — the real gap that used to throw "Hydration
    // failed: 00:02:58 vs 00:03:01" and tear down the whole task detail.
    vi.setSystemTime(new Date("2026-09-10T10:01:00.000Z"));

    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);

    const recoverable: string[] = [];
    await act(async () => {
      hydrateRoot(host, <Clock />, {
        onRecoverableError: (err) => recoverable.push(String(err)),
      });
    });

    expect(recoverable.filter((e) => /hydrat/i.test(e))).toEqual([]);

    // And once hydrated it catches up on its own, on the next tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(host.querySelector("[data-testid=clock]")?.textContent).toBe(String(600 + 61));
  });

  it("is inert without a start stamp", () => {
    vi.setSystemTime(new Date(START));
    function Idle() {
      return <span>{useElapsedSeconds(null)}</span>;
    }
    expect(renderToString(<Idle />)).toContain(">0<");
  });
});
