import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};

// Sourcemap upload only when a Sentry auth token is present (CI/prod with
// Sentry provisioned). Otherwise the config passes through untouched, so
// builds without Sentry stay green and free of upload failures.
const withSentry = process.env.SENTRY_AUTH_TOKEN
  ? (config: NextConfig) =>
      withSentryConfig(config, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        silent: true,
      })
  : (config: NextConfig) => config;

export default withSentry(nextConfig);
