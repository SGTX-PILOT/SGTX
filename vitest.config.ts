import { defineConfig } from 'vitest/config';
import path from 'node:path';

// CERT-24: Vitest configuration for the SGTX testing stack.
//
// Test hierarchy (per CERT-24):
//   tests/unit/              — pure-function unit tests
//   tests/integration/       — DB + service integration tests
//   tests/security/          — security-specific tests
//   tests/authorization/     — authorization negative-path tests (CERT-19)
//   tests/tenant-isolation/  — tenant isolation tests (CERT-8 golden flow #8)
//   tests/lifecycle/         — lifecycle transition tests
//   tests/ustn/              — USTN continuity tests (CERT-9)
//   tests/portal/            — per-portal coverage tests (CERT-25)
//   tests/e2e/               — end-to-end golden flows
//   tests/regression/        — regression tests
//   tests/route-coverage/   — CERT-26 route/tab/screen coverage

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/authorization/**/*.test.ts',
      'tests/tenant-isolation/**/*.test.ts',
      'tests/lifecycle/**/*.test.ts',
      'tests/ustn/**/*.test.ts',
      'tests/portal/**/*.test.ts',
      'tests/route-coverage/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
      'tests/regression/**/*.test.ts',
    ],
    exclude: ['node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/lib/sgtx/**/*.ts', 'src/app/api/sgtx/**/route.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'scripts/**'],
    },
  },
});
