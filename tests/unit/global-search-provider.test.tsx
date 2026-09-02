// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Providers } from "@/components/providers";

// GlobalSearch pulls in a server action + the router; mock both so the test
// isolates the one thing that broke prod: useQuery needing a QueryClient.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/(app)/search/actions", () => ({
  globalSearchAction: vi.fn(async () => ({
    tasks: [], clients: [], projects: [], people: [], outstanding: [], documents: [],
  })),
}));

import { GlobalSearch } from "@/components/header/global-search";

describe("GlobalSearch (header, always rendered)", () => {
  it("renders inside the app Providers without throwing (the prod fix)", () => {
    expect(() =>
      render(
        <Providers>
          <GlobalSearch />
        </Providers>,
      ),
    ).not.toThrow();
  });

  it("regression guard: throws 'No QueryClient' when no provider is in scope", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<GlobalSearch />)).toThrow(/QueryClient/);
    spy.mockRestore();
  });
});
