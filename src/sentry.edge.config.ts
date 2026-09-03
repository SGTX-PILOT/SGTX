// SGTX Sentry Edge Configuration — Free Tier Error Monitoring
// ============================================================================
// Edge runtime Sentry initialization for middleware.
// ============================================================================

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || "";

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production" && !!SENTRY_DSN,
  ignoreErrors: ["NEXT_NOT_FOUND", "NEXT_REDIRECT"],
});
