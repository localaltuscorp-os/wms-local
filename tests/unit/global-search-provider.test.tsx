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

  // GlobalSearch used to call `useQuery`, so rendering it outside a
  // QueryClientProvider threw in prod — the old guard here asserted that throw.
  // It now drives `globalSearchAction` directly with local state and holds no
  // React Query dependency, so the invariant worth pinning is the inverse: the
  // header search must render standalone, with no provider in scope.
  it("renders with no QueryClient provider in scope (no React Query dependency)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<GlobalSearch />)).not.toThrow();
    spy.mockRestore();
  });
});
