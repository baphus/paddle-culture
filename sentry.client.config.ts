import * as Sentry from "@sentry/nextjs";

// Client-side Sentry (ADR-07, free plan: errors only). NEXT_PUBLIC_SENTRY_DSN
// from env; absent DSN = silent no-op. No session replay (free-plan spend).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
