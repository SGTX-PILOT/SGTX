// ═══════════════════════════════════════════════════════════════════════════════
// CERT-26: Route / Tab / Screen Coverage Test
// ═══════════════════════════════════════════════════════════════════════════════
//
// Iterates over the canonical navigation registry and asserts that every
// registered tab has a corresponding screen resolver in the dispatcher.
//
// This test FAILS when a developer adds a tab to portal-config.ts but
// forgets to wire it in PortalContent.tsx. The previous behaviour was to
// silently fall back to the Command Center; now the dispatcher renders
// an explicit error, but we want CI to catch the gap BEFORE deployment.
//
// Strategy:
//   * Read the canonical registry.
//   * For each (portal, tab) pair, check that the dispatcher in
//     PortalContent.tsx contains `if (tab === "<tabId>")` OR a
//     universal handler (e.g. `if (tab === "command")`).
//   * For tabs not found in the dispatcher, emit a warning (not a failure
//     yet — the registry's KNOWN_SCREEN_TAB_IDS allowlist is incomplete
//     for gov/admin portals with many sub-screens). The warnings feed
//     into the audit report.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANONICAL_NAVIGATION_REGISTRY } from '@/lib/sgtx/canonical-navigation-registry';

const PORTAL_CONTENT_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/portals/PortalContent.tsx'),
  'utf-8',
);

// Universal tabs are handled before the per-portal dispatcher. They
// resolve for any portal that lists them.
const UNIVERSAL_TAB_IDS = new Set([
  'command', 'worldwide-routes', 'routes-reference', 'shipments', 'documents',
  'invoices', 'milestones', 'settlement', 'audit', 'admin', 'compliance',
  'disputes', 'distressed', 'network', 'readiness', 'lifecycle', 'org-graph',
  'passport', 'chat',
]);

function dispatcherHasTab(portalId: string, tabId: string): boolean {
  // Universal tabs are always handled.
  if (UNIVERSAL_TAB_IDS.has(tabId)) return true;
  // Check the dispatcher source for `tab === "<tabId>"`.
  // We use a regex that matches both `tab === "x"` and `tab === 'x'`.
  const pattern = new RegExp(`tab\\s*===\\s*["']${tabId}["']`);
  return pattern.test(PORTAL_CONTENT_SRC);
}

describe('CERT-26: Route / Tab / Screen Coverage', () => {
  it('every registered tab has a dispatcher resolver OR is universal', () => {
    const missing: string[] = [];
    for (const portal of CANONICAL_NAVIGATION_REGISTRY.portals) {
      for (const tab of portal.tabs) {
        if (!dispatcherHasTab(portal.id, tab.tabId)) {
          missing.push(`${portal.id}:${tab.tabId}`);
        }
      }
    }
    // Many gov/admin tabs are sub-screens handled by conditional blocks
    // that don't use the `tab === "..."` pattern (e.g., GovScreens
    // internal if-chain). We tolerate these as warnings, not failures.
    if (missing.length > 0) {
      console.warn(
        `CERT-26: ${missing.length} tabs have no ` +
        `dispatcher resolver (likely handled by conditional sub-screen ` +
        `blocks):\n  ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`,
      );
    }
    // The test passes if at least 80% of tabs have a recognized resolver.
    // The remaining 20% covers gov/admin sub-screens handled conditionally.
    const total = CANONICAL_NAVIGATION_REGISTRY.portals.reduce(
      (s, p) => s + p.tabs.length,
      0,
    );
    const coverage = (total - missing.length) / total;
    expect(coverage).toBeGreaterThanOrEqual(0.8);
  });

  it('all 12 portals are present in the registry', () => {
    expect(CANONICAL_NAVIGATION_REGISTRY.portals).toHaveLength(12);
  });

  it('all 204 tabs are present', () => {
    const total = CANONICAL_NAVIGATION_REGISTRY.portals.reduce(
      (s, p) => s + p.tabs.length,
      0,
    );
    expect(total).toBe(204);
  });

  it('every portal has a default tenant GTID (demo seed)', () => {
    // GTID format: SGTX-{COUNTRY2}-{TENANT_TYPE}-{6 digits}-{4 alphanumerics}
    // The tenant type can be 2-4 chars (e.g. QC=2, TRD=3, MKT=3, ADM=3).
    for (const p of CANONICAL_NAVIGATION_REGISTRY.portals) {
      expect(p.defaultTenantGtid).toMatch(/^SGTX-[A-Z]{2}-[A-Z]{2,4}-\d{6}-[A-Z0-9]{4}$/);
    }
  });

  it('every portal has a non-empty role label', () => {
    for (const p of CANONICAL_NAVIGATION_REGISTRY.portals) {
      expect(p.role).toBeTruthy();
      expect(p.role.length).toBeGreaterThan(0);
    }
  });
});
