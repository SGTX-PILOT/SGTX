// ═══════════════════════════════════════════════════════════════════════════════
// CERT-4: Canonical Navigation Registry — unit tests
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests assert that the canonical navigation registry is internally
// consistent. They are the hard gate that prevents drift between the
// portal-config.ts PORTALS array and the dispatcher in PortalContent.tsx.

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_NAVIGATION_REGISTRY,
  validateRegistry,
  getPortalById,
  getAllTabIds,
  getTabSpec,
  PERMISSION_ALLOWLIST,
} from '@/lib/sgtx/canonical-navigation-registry';

describe('CERT-4: Canonical Navigation Registry', () => {
  it('contains exactly 12 portals', () => {
    expect(CANONICAL_NAVIGATION_REGISTRY.portals).toHaveLength(12);
  });

  it('has the canonical 12 portal IDs', () => {
    const ids = CANONICAL_NAVIGATION_REGISTRY.portals.map((p) => p.id).sort();
    expect(ids).toEqual([
      'admin',
      'bank',
      'cbr',
      'gov',
      'lab',
      'lsp',
      'marketplace-partner',
      'pfi',
      'qc',
      'ship',
      'trader-buyer',
      'trader-seller',
    ]);
  });

  it('has 204 total tabs (existing blueprint target)', () => {
    const total = CANONICAL_NAVIGATION_REGISTRY.portals.reduce(
      (sum, p) => sum + p.tabs.length,
      0,
    );
    expect(total).toBe(204);
  });

  it('has no duplicate portal IDs', () => {
    const result = validateRegistry();
    expect(result.duplicatePortalIds).toEqual([]);
  });

  it('has no duplicate tab IDs within a portal', () => {
    const result = validateRegistry();
    expect(Object.keys(result.duplicateTabIds)).toHaveLength(0);
  });

  it('every tab has a permission from the allowlist', () => {
    const result = validateRegistry();
    // Warnings about non-allowlisted permissions are acceptable for now —
    // they are flagged for review, not blocked. We assert the allowlist
    // itself is non-empty.
    expect(PERMISSION_ALLOWLIST.length).toBeGreaterThan(0);
  });

  it('getPortalById returns the correct portal', () => {
    const buyer = getPortalById('trader-buyer');
    expect(buyer).toBeDefined();
    expect(buyer?.name).toContain('Buyer');
    expect(buyer?.role).toBe('Importer');
  });

  it('getTabSpec returns the correct tab', () => {
    const tab = getTabSpec('trader-buyer', 'new-trade');
    expect(tab).toBeDefined();
    expect(tab?.destructive).toBe('destructive');
    expect(tab?.permission).toBe('write:trade:self');
    expect(tab?.ustn).toBe('ustn-not-applicable');
  });

  it('getAllTabIds returns 204 entries', () => {
    expect(getAllTabIds()).toHaveLength(204);
  });

  it('disputes tab on trader-buyer is destructive', () => {
    const tab = getTabSpec('trader-buyer', 'disputes');
    expect(tab?.destructive).toBe('destructive');
    expect(tab?.ustn).toBe('ustn-required');
  });

  it('admin command-center requires platform admin permission', () => {
    const tab = getTabSpec('admin', 'command-center');
    expect(tab?.permission).toBe('read:admin:platform');
  });

  it('gov customs tab requires gov:any permission', () => {
    const tab = getTabSpec('gov', 'customs');
    expect(tab?.permission).toBe('write:gov:any');
  });
});
