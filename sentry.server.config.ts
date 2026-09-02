/**
 * Phase 0.2 — Sentry server runtime init.
 *
 * Dormant until `NEXT_PUBLIC_SENTRY_DSN` is set in the environment. With
 * the env var unset the SDK no-ops cleanly (no network calls, no
 * overhead), so this file is safe to commit and ship before the Sentry
 * project exists.
 *
 * Set both NEXT_PUBLIC_SENTRY_DSN (used on client + server) and the
 * sample rates below in Vercel → Project Settings → Environment Variables
 * to turn it on for Production. See docs/HARDENING_PLAN.md Phase 0.2.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    // Capture 20% of perf traces — enough to spot regressions without
    // blowing through the free quota on a busy day.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.2"),
    // Stay quiet in dev unless we explicitly want noise (set
    // SENTRY_ENABLE_DEV=true to forward).
    enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLE_DEV === "true",
    // No PII unless we ask for it; postgres-js errors sometimes embed
    // query parameters we'd rather not ship to a third party.
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  });
}
