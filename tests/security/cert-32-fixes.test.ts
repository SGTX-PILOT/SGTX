// ═══════════════════════════════════════════════════════════════════════════════
// CERT-7 / CERT-19 / CERT-32: Security negative-path tests
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests assert that the security fixes from CERT-32 hold:
//
//   1. The universal "sgtx-demo" backdoor password is no longer accepted.
//   2. The dev-mode middleware auth bypass is no longer present.
//   3. No hardcoded Turso JWT literal exists in the production runtime
//      database clients (db.ts, db-fresh.ts, prisma.config.ts).
//
// These are static-analysis tests — they grep the source code for the
// patterns that should NOT be there. They fail the build if a regression
// re-introduces a P0 security issue.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('CERT-32 P0 FIX: Universal "sgtx-demo" backdoor removed', () => {
  it('login route no longer accepts "sgtx-demo" as a fallback password', () => {
    const src = readSource('src/app/api/v1/auth/login/route.ts');
    // The backdoor was: `if (password === "sgtx-demo") { valid = true; ... }`
    expect(src).not.toMatch(/password\s*===\s*["']sgtx-demo["']/);
    // The replacement code must explicitly reject employees without a
    // passwordHash.
    expect(src).toMatch(/if\s*\(!employee\.passwordHash\)/);
    expect(src).toMatch(/Invalid email or password/);
  });

  it('hashPassword is no longer imported by the login route (no auto-hash backdoor)', () => {
    const src = readSource('src/app/api/v1/auth/login/route.ts');
    expect(src).not.toMatch(/hashPassword/);
  });
});

describe('CERT-32 P0 FIX: Dev-mode middleware auth bypass removed', () => {
  it('middleware no longer allows unauthenticated requests in non-prod', () => {
    const src = readSource('src/middleware.ts');
    // The bypass was: `if (isProd) { return 401 } ... return response` for
    // missing tokens. We now always return 401.
    // We check for the actual `response.headers.set("X-Auth-Warning"...)` call —
    // the comment in the file mentions the header name as documentation, which
    // is fine; only the actual code call must be gone.
    expect(src).not.toMatch(/response\.headers\.set\(["']X-Auth-Warning["']/);
    // The new code must always reject a missing token.
    expect(src).toMatch(/if\s*\(!token\)\s*{[\s\S]*?Authentication required[\s\S]*?}/);
  });
});

describe('CERT-32 P0 FIX: No hardcoded Turso JWT in production runtime', () => {
  it('src/lib/db.ts has no Turso JWT literal', () => {
    const src = readSource('src/lib/db.ts');
    // The JWT literal pattern (the actual credential value) must be gone.
    expect(src).not.toMatch(/eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9/);
    // The variable declaration `TURSO_TOKEN_FALLBACK = ...` must be gone.
    // (Comments mentioning the name are acceptable as documentation.)
    expect(src).not.toMatch(/(?:const|let|var)\s+TURSO_TOKEN_FALLBACK/);
  });

  it('src/lib/db-fresh.ts has no Turso JWT literal', () => {
    const src = readSource('src/lib/db-fresh.ts');
    expect(src).not.toMatch(/eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9/);
    expect(src).not.toMatch(/(?:const|let|var)\s+TURSO_TOKEN_FALLBACK/);
  });

  it('prisma.config.ts has no Turso JWT literal', () => {
    const src = readSource('prisma.config.ts');
    expect(src).not.toMatch(/eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9/);
    expect(src).not.toMatch(/(?:const|let|var)\s+TURSO_TOKEN_FALLBACK/);
  });

  it('db.ts throws an explicit error if no DB config is present in production', () => {
    const src = readSource('src/lib/db.ts');
    expect(src).toMatch(/No database configuration in production/);
  });
});

describe('CERT-32: Demo login endpoint is dev-only', () => {
  it('demo-login route rejects production requests', () => {
    const src = readSource('src/app/api/v1/auth/demo-login/route.ts');
    expect(src).toMatch(/NODE_ENV.*===.*["']production["']/);
    expect(src).toMatch(/status:\s*404/);
  });

  it('demo-login route mints demo-scoped JWTs (not full-scope)', () => {
    const src = readSource('src/app/api/v1/auth/demo-login/route.ts');
    expect(src).toMatch(/scope:\s*\[["']demo["']\]/);
  });
});

describe('CERT-3: Silent PortalContent fallback removed', () => {
  it('PortalContent.tsx no longer has the silent CommandCenter fallback', () => {
    const src = readSource('src/components/portals/PortalContent.tsx');
    // The previous fallback was a bare `return <CommandCenter portal={portal} data={data} />;`
    // at the end of the function. The new code returns a
    // <PortalTabResolutionError> instead.
    expect(src).toMatch(/PortalTabResolutionError/);
    // The old silent fallback line should no longer be present as the
    // terminal return of the function. (It's still referenced elsewhere
    // for legitimate uses, so we check for the specific pattern.)
    expect(src).not.toMatch(/\/\/ Fallback\s*\n\s*return\s*<CommandCenter\s+portal=\{portal\}\s+data=\{data\}\s*\/>/);
  });
});

describe('CERT-13: File Dispute workflow is wired', () => {
  it('PortalContent.tsx imports FileDisputeModal', () => {
    const src = readSource('src/components/portals/PortalContent.tsx');
    expect(src).toMatch(/from\s+["']@\/components\/sgtx\/dispute-screens["']/);
    expect(src).toMatch(/FileDisputeModal/);
  });

  it('dispute-screens.tsx exports FileDisputeModal', () => {
    const src = readSource('src/components/sgtx/dispute-screens.tsx');
    expect(src).toMatch(/export\s+function\s+FileDisputeModal/);
  });

  it('FileDisputeModal POSTs to /api/sgtx/disputes/file', () => {
    const src = readSource('src/components/sgtx/dispute-screens.tsx');
    expect(src).toMatch(/\/api\/sgtx\/disputes\/file/);
  });
});
