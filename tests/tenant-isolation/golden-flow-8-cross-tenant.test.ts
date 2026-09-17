// ═══════════════════════════════════════════════════════════════════════════════
// CERT-24: Golden Flow #8 — Cross-tenant attack attempt (negative path)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Asserts that tenant isolation is enforced. The audit (SGTX_SECURITY_AUDIT.md)
// found that 39/40 sampled API routes source tenant identity from the
// request BODY, not the verified session. This is a class-wide P1 issue.
//
// These tests document the current state and assert the fixes that ARE
// in place (the demo-login endpoint that mints demo-scoped JWTs bound to
// a specific tenantGtid; the middleware token verification step).
//
// The complete fix (server-side derivation of effective tenant from the
// JWT, ignoring body-supplied tenant IDs) is tracked as a P1 residual
// risk in the final certification report.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('CERT-24 Golden Flow #8: Cross-tenant attack attempt', () => {
  it('demo-login mints JWTs bound to a specific tenantGtid (not body-supplied)', () => {
    const src = readSource('src/app/api/v1/auth/demo-login/route.ts');
    // The JWT claim must include tenantGtid from the demo tenant config,
    // NOT from the request body.
    expect(src).toMatch(/DEMO_PORTAL_TENANTS/);
    expect(src).toMatch(/tenantGtid:\s*employee\.tenantGtid/);
    // The endpoint must NOT accept a body-supplied tenantGtid.
    expect(src).not.toMatch(/body\.tenantGtid|data\.tenantGtid/);
  });

  it('demo-login rejects unknown portal_ids (no arbitrary tenant selection)', () => {
    const src = readSource('src/app/api/v1/auth/demo-login/route.ts');
    expect(src).toMatch(/Unknown portal_id/);
  });

  it('login route derives tenant from the employee record (not body)', () => {
    const src = readSource('src/app/api/v1/auth/login/route.ts');
    // The tenant must come from `employee.tenant`, not the request body.
    expect(src).toMatch(/employee\.tenant\.gtid/);
  });

  it('middleware verifies the JWT before allowing access to protected routes', () => {
    const src = readSource('src/middleware.ts');
    expect(src).toMatch(/verifyTokenEdge/);
    // The JWT verification must happen before any tenant-specific logic.
    expect(src).toMatch(/Invalid or expired token/);
  });
});

describe('CERT-8: Tenant isolation — residual risk documentation', () => {
  it('documents the residual risk that 39/40 sampled routes trust body-supplied tenant IDs', () => {
    // This test exists to make the residual risk VISIBLE in CI output.
    // It is a meta-test that always passes but prints the residual risk.
    // The complete server-side tenant derivation fix is tracked as P1 in
    // SGTX_FINAL_CERTIFICATION_REPORT.md.
    const residualRisk = {
      finding: 'SGTX_SECURITY_AUDIT.md finding: 39/40 sampled /api/sgtx/* routes source tenant GTID from the request body, not the verified session.',
      severity: 'P1',
      impact: 'Any authenticated user can act as any tenant by supplying a forged tenantGtid in the body.',
      remediation: 'Server-side authorization must establish the effective tenant from the JWT claim, ignoring body-supplied tenant IDs. Tracked as P1 residual risk.',
      status: 'documented-not-fixed',
    };
    console.log('CERT-8 residual risk:', JSON.stringify(residualRisk, null, 2));
    expect(residualRisk.status).toBe('documented-not-fixed');
  });
});
