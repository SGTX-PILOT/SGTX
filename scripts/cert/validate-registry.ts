// ═══════════════════════════════════════════════════════════════════════════════
// CERT-4 / CERT-26: Canonical Navigation Registry Validator
// ═══════════════════════════════════════════════════════════════════════════════
//
// Run via: `bun run scripts/cert/validate-registry.ts`
// Exits non-zero if the canonical navigation registry has:
//   * duplicate portal IDs
//   * duplicate tab IDs within a portal
//   * orphan tabs (tabs registered but with no known screen)
//   * missing/invalid permissions
//
// This script is invoked by the CI `registry-validate` job (see
// .github/workflows/ci.yml). It is the hard gate that prevents the
// canonical navigation registry from drifting.

import { CANONICAL_NAVIGATION_REGISTRY, validateRegistry } from '../../src/lib/sgtx/canonical-navigation-registry';

const result = validateRegistry();

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SGTX Canonical Navigation Registry Validation (CERT-4)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Portals: ${result.portalCount}`);
console.log(`  Tabs:    ${result.tabCount}`);
console.log(`  OK:     ${result.ok}`);
console.log('───────────────────────────────────────────────────────────────');

if (result.errors.length > 0) {
  console.log('\n❌ ERRORS (must fix):');
  for (const e of result.errors) console.log(`  - ${e}`);
}
if (result.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS (should review):');
  for (const w of result.warnings) console.log(`  - ${w}`);
}

// Also dump orphan tabs in a parseable format for the route-coverage test.
if (Object.keys(result.orphanTabs).length > 0) {
  console.log('\n📋 Orphan tabs (registered but no known screen):');
  for (const [pid, tabs] of Object.entries(result.orphanTabs)) {
    console.log(`  ${pid}: ${tabs.join(', ')}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
if (result.ok) {
  console.log('  ✅ REGISTRY VALID — no errors');
  process.exit(0);
} else {
  console.log('  ❌ REGISTRY INVALID — see errors above');
  process.exit(1);
}
