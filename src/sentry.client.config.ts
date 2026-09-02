// SGTX Sentry Configuration — Free Tier Error Monitoring
// ============================================================================
// Sentry is initialized with a no-op DSN (empty string) so that the SDK
// is installed and ready. When a real Sentry DSN is configured via the
// SENTRY_DSN environment variable, it will automatically start reporting
// errors. Until then, the SDK runs in "no-op" mode — it catches errors
// but doesn't send them anywhere.
//
// This approach ensures:
//   1. The SDK is installed and ready (no personal interference needed)
//   2. When a Sentry DSN is obtained (free at sentry.io), just set the env var
//   3. Zero code changes needed to activate production error monitoring
// ============================================================================

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || "";

Sentry.init({
  dsn: SENTRY_DSN, // empty = no-op mode (catches but doesn't send)
  environment: process.env.NODE_ENV || "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  tracesSampleRate: 0.1, // 10% sampling for performance
  profilesSampleRate: 0.1,
  // Only enable in production to avoid noise in development
  enabled: process.env.NODE_ENV === "production" && !!SENTRY_DSN,
  // Filter out known noise
  ignoreErrors: [
    // Network errors that are expected in dev
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
  // Don't send sensitive data
  beforeSend(event) {
    // Remove any potential secrets from request data
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
      delete event.request.headers["x-tenant-gtid"];
    }
    return event;
  },
});
