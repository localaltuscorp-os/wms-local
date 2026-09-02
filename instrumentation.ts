/**
 * Phase 0.2 — Sentry server-side bootstrap hook (Next.js convention).
 *
 * Next looks for this file at the project root and calls `register()`
 * before the server starts handling requests. We branch on the runtime
 * tag so the right config file loads (Node for serverless functions,
 * Edge for the middleware).
 *
 * Dormant if `NEXT_PUBLIC_SENTRY_DSN` is unset — the imported config
 * files self-skip on missing DSN, so this is always safe to leave in
 * the build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Forwards uncaught request errors to Sentry. The Sentry SDK exposes
 * the implementation as `captureRequestError`, BUT only from the Node
 * build — the edge build of `@sentry/nextjs` doesn't ship that export.
 * Next loads this file in both runtimes, so a static re-export fails
 * on the edge bundle. We resolve the helper lazily, return early when
 * it isn't available (edge), and let Sentry's runtime global hooks
 * pick up uncaught throws there.
 */
export async function onRequestError(
  err: unknown,
  req: Parameters<typeof import("@sentry/nextjs").captureRequestError>[1],
  ctx: Parameters<typeof import("@sentry/nextjs").captureRequestError>[2],
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, req, ctx);
}
