/**
 * Phase 0.2 — Sentry browser runtime init.
 *
 * Dormant until `NEXT_PUBLIC_SENTRY_DSN` is set. Replay is OFF by default
 * (session replay is a privacy + bundle-size trade-off; flip
 * SENTRY_ENABLE_REPLAY=true if Hetesh + Manan are explicitly OK with
 * recording user interactions).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.2"),
    enabled: process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === "true",
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    integrations:
      process.env.NEXT_PUBLIC_SENTRY_ENABLE_REPLAY === "true"
        ? [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })]
        : [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_SENTRY_ENABLE_REPLAY === "true" ? 1.0 : 0,
  });
}
