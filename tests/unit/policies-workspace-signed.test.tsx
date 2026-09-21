// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The "Firm policies" cards carry the VIEWER'S OWN signing state: a Signed
 * badge, a per-policy download of the archived copy they signed, and a
 * "Download all" in the section head. It is covered here because the state
 * cannot be reached from the dev login — the local dev user has signed nothing,
 * so /policies only ever renders the unsigned half in the browser.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/policies/actions", () => ({
  uploadPolicy: async () => ({ ok: true }),
  deletePolicy: async () => ({ ok: true }),
}));
vi.mock("@/lib/toast", () => ({ fireToast: () => {} }));

const { PoliciesWorkspace } = await import("@/components/hr/policies/policies-workspace");

const CARDS = [
  { key: "posh-policy", title: "POSH", blurb: "b", badge: "PO", status: "ready" as const, signedAt: "2026-09-01T10:00:00.000Z", outdated: false },
  { key: "exit-policy", title: "Exit", blurb: "b", badge: "EX", status: "ready" as const, signedAt: null, outdated: false },
  { key: "clash", title: "Clash", blurb: "b", badge: "IC", status: "ready" as const, signedAt: "2026-08-01T10:00:00.000Z", outdated: true },
];

afterEach(cleanup);

describe("PoliciesWorkspace firm-policy cards", () => {
  it("badges a signed policy and offers its archived copy", () => {
    render(<PoliciesWorkspace groups={[]} isAdmin={false} cards={CARDS} />);
    expect(screen.getByText(/Signed ·/)).toBeTruthy();
    const dl = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => Boolean(h?.startsWith("/api/hr/policies/download?")));
    expect(dl).toContain("/api/hr/policies/download?key=posh-policy");
    // The unsigned policy offers no download — there is no signed copy to give.
    expect(dl).not.toContain("/api/hr/policies/download?key=exit-policy");
  });

  it("counts only current signatures, and asks for a re-sign on an old one", () => {
    render(<PoliciesWorkspace groups={[]} isAdmin={false} cards={CARDS} />);
    // 3 ready cards, one signed-and-current → "1/3 signed".
    expect(screen.getByText("1/3 signed")).toBeTruthy();
    expect(screen.getByText(/New version · sign again/)).toBeTruthy();
  });

  it("shows Download all only when something has been signed", () => {
    const { container } = render(<PoliciesWorkspace groups={[]} isAdmin={false} cards={CARDS} />);
    expect(container.querySelector('a[href="/api/hr/policies/download-all"]')).toBeTruthy();
    cleanup();
    const none = CARDS.map((c) => ({ ...c, signedAt: null, outdated: false }));
    const { container: c2 } = render(<PoliciesWorkspace groups={[]} isAdmin={false} cards={none} />);
    expect(c2.querySelector('a[href="/api/hr/policies/download-all"]')).toBeNull();
  });
});
