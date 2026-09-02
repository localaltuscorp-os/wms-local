/**
 * Phase 0.2 — Sentry edge runtime init.
 *
 * Same gate as `sentry.server.config.ts`: dormant when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset. The edge runtime is mostly used
 * by `middleware.ts`; if that ever throws we want it in Sentry too.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.2"),
    enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLE_DEV === "true",
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  });
}
