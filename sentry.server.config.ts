import * as Sentry from "@sentry/nextjs";

// Server-side Sentry (ADR-07, free plan: errors only). No DSN in code —
// SENTRY_DSN comes from env; without it the SDK is a silent no-op, so local
// builds and deploys without Sentry stay green. tracesSampleRate 0 keeps this
// to error events (no performance-tracing spend).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
});
