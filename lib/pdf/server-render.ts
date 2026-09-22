import "server-only";
import type { ReactElement } from "react";

/**
 * RENDER A REACT ELEMENT TO STATIC HTML, ON THE SERVER.
 *
 * ── WHY THIS IS ITS OWN FILE, AND WHY IT MUST STAY ONE ─────────────────────
 * It exists to keep `react-dom/server` away from JSX.
 *
 * Next 16 refuses to build a module that BOTH contains JSX / imports components
 * AND imports `react-dom/server`:
 *
 *   x You're importing a component that imports react-dom/server. To fix it,
 *     render or return the content directly as a Server Component instead for
 *     perf and security.
 *
 * That is a sensible rule — such a module could be pulled into the client graph —
 * but rendering a component to HTML inside a ROUTE HANDLER is a legitimate need,
 * and the split is what makes it legal: this file does ONE thing (call the
 * renderer) and imports no components; the callers own the JSX.
 *
 * Putting the import back next to a `<Component />` will break `next build` at
 * the "Creating an optimized production build" step, not at typecheck or test
 * time. That is how this was found: it built locally, passed 2900 tests, and
 * failed only on Vercel.
 */
export async function renderReactToHtml(node: ReactElement): Promise<string> {
  // A DYNAMIC import, deliberately. A static `import { renderToStaticMarkup }
  // from "react-dom/server"` anywhere in this module's graph fails `next build`
  // with "You're importing a component that imports react-dom/server" — the
  // check walks the whole chain from the route handler and refuses, whether or
  // not this file contains any JSX itself. Loading it at call time keeps it out
  // of that static graph, which is the only reason this works.
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(node);
}
