import { defineConfig, devices } from "@playwright/test";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 6: Playwright E2E config.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Tests the cockpit rebuild's golden flows:
//   - Create trade wizard (6 steps)
//   - Role perspective renders
//   - Deep-link refresh (URL is source of truth)
//   - RTL render (Arabic)
//
// These tests run against the local dev server (port 3000). They require
// the demo-login endpoint to be available (non-production). The tests use
// the demo-login API to mint demo-scoped JWTs and then exercise the UI.

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false, // sequential — the dev server can't handle parallel browsers
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
