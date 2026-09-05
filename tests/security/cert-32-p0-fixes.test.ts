// ═══════════════════════════════════════════════════════════════════════════════
// CERT-32 P0 FIXES (F-05, F-06): Admin impersonation + WASM module reload
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests assert that the 2 remaining P0 blockers from
// SGTX_FINAL_CERTIFICATION_REPORT.md are now fixed:
//
//   F-05: admin/tenant/impersonate route accepts body-supplied adminGtid
//   F-06: governor/modules/[name]/reload defaults multisigApproved=true
//
// Both are static-analysis tests (they grep the source code for the
// patterns that should NOT be there, plus the patterns that SHOULD be
// there). A full integration test would spin up the Next.js server and
// exercise the endpoints, but that requires a seeded test DB and is
// tracked as a future enhancement (CERT-24 golden flow #7).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('CERT-32 P0 FIX F-05: Admin impersonation route is hardened', () => {
  it('route verifies the session JWT (no unauthenticated access)', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/verifyTokenEdge/);
    expect(src).toMatch(/Authentication required/);
  });

  it('route enforces RBAC (PLATFORM_ADMIN role required)', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/PLATFORM_ADMIN/);
    expect(src).toMatch(/Forbidden/);
  });

  it('route derives adminGtid from the JWT, NOT the request body', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    // The adminGtid must come from payload.tenantGtid, not from the body.
    expect(src).toMatch(/payload.*\.tenantGtid/);
    // The body destructuring must NOT include adminGtid.
    expect(src).not.toMatch(/\{\s*targetTenantGtid,\s*adminGtid,/);
    // The audit record must use the verified adminGtid.
    expect(src).toMatch(/actorGtid:\s*adminGtid/);
  });

  it('route verifies the admin tenant exists in the DB (defense-in-depth)', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/db\.tenant\.findUnique/);
    expect(src).toMatch(/Admin tenant not found/);
  });

  it('route verifies the target tenant exists (404 if not)', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/Target tenant not found/);
  });

  it('route prevents self-impersonation', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/Cannot impersonate your own tenant/);
  });

  it('route logs denial attempts for non-admin roles', () => {
    const src = readSource('src/app/api/sgtx/admin/tenant/impersonate/route.ts');
    expect(src).toMatch(/IMPERSONATION_DENIED/);
  });
});

describe('CERT-32 P0 FIX F-06: WASM module reload is fail-closed', () => {
  it('route verifies the session JWT', () => {
    const src = readSource('src/app/api/sgtx/governor/modules/[name]/reload/route.ts');
    expect(src).toMatch(/verifyTokenEdge/);
    expect(src).toMatch(/Authentication required/);
  });

  it('route enforces RBAC (PLATFORM_ADMIN role required)', () => {
    const src = readSource('src/app/api/sgtx/governor/modules/[name]/reload/route.ts');
    expect(src).toMatch(/PLATFORM_ADMIN/);
    expect(src).toMatch(/Forbidden/);
  });

  it('multisigApproved defaults to FALSE (fail-closed)', () => {
    const src = readSource('src/app/api/sgtx/governor/modules/[name]/reload/route.ts');
    // The new code: `multisigApproved = body?.multisigApproved === true`
    // (strict equality — defaults to false).
    expect(src).toMatch(/multisigApproved\s*=\s*body\?\.multisigApproved\s*===\s*true/);
    // The old pattern (active code, not comments) must be GONE. We
    // strip comments before checking — the comment in the source that
    // documents the old code is fine.
    const stripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/multisigApproved\s*!==\s*false/);
  });

  it('multisigProof is required (≥10 chars)', () => {
    const src = readSource('src/app/api/sgtx/governor/modules/[name]/reload/route.ts');
    expect(src).toMatch(/multisigProof/);
    expect(src).toMatch(/multisigProof\.length\s*<\s*10/);
  });

  it('route audits the reload with the verified admin GTID', () => {
    const src = readSource('src/app/api/sgtx/governor/modules/[name]/reload/route.ts');
    expect(src).toMatch(/reloadedBy/);
    expect(src).toMatch(/adminGtid/);
  });
});

describe('CERT-32: Shared auth-edge module exists', () => {
  it('verifyTokenEdge is exported from src/lib/v1/auth-edge.ts', () => {
    const src = readSource('src/lib/v1/auth-edge.ts');
    expect(src).toMatch(/export\s+async\s+function\s+verifyTokenEdge/);
  });

  it('auth-edge module has no Prisma/DB import (edge-compatible)', () => {
    const src = readSource('src/lib/v1/auth-edge.ts');
    expect(src).not.toMatch(/from\s+['"]@prisma\/client['"]/);
    expect(src).not.toMatch(/from\s+['"]@\/lib\/db['"]/);
  });
});
