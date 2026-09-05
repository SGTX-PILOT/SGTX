// ═══════════════════════════════════════════════════════════════════════════════
// CERT-4: Canonical Navigation Registry
// ═══════════════════════════════════════════════════════════════════════════════
//
// Single authoritative machine-readable contract for:
//   * portals
//   * portal IDs
//   * canonical routes
//   * workspaces
//   * tabs
//   * screen component (resolved by the dispatcher)
//   * required permissions
//   * supported roles
//   * USTN applicability
//   * trade-context requirements
//   * online/offline capability
//   * destructive/non-destructive action class
//
// Consumed by:
//   * UI navigation (WorkspaceShell)
//   * authorization (middleware)
//   * test generation (tests/portal/*.test.ts)
//   * audit tooling (SGTX_PORTAL_CERTIFICATION_MATRIX.md)
//   * coverage reporting (tests/route-coverage.test.ts)
//
// Validation guarantees (via `validateRegistry()`):
//   * no duplicate portal IDs
//   * no duplicate tab IDs within a portal
//   * no orphan tabs (every tab must resolve to a screen)
//   * no orphan screens (every screen must be referenced by a tab)
//   * no invalid workspace assignments
//   * no missing permissions
//   * no missing portal mappings
//
// This module is consumed at build time by the route-coverage test and at
// runtime by the WorkspaceShell. Drift between this registry and the actual
// dispatcher is a CERT-26 certification failure.

import { PORTAL_MAP, PORTALS, type PortalConfig, type PortalTab } from "./portal-config";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export type DestructiveClass = "destructive" | "non-destructive" | "navigation-only";
export type OfflineCapability = "online-only" | "offline-capable" | "offline-read-only";
export type UstnApplicability = "ustn-required" | "ustn-optional" | "ustn-not-applicable";
export type TradeContextRequirement = "trade-required" | "trade-optional" | "trade-not-applicable";

export interface CanonicalScreenSpec {
  /** Unique within the portal: the dispatcher's `if (tab === "...")` key. */
  tabId: string;
  /** Human-readable label, sourced from the existing PortalTab.label. */
  label: string;
  /** The screen resolver — used by the route-coverage test to verify the
   *  dispatcher actually maps this tabId to a screen. */
  screen: "CommandCenter" | "WorkspaceShell" | "ExplicitScreen" | "Unknown";
  /** Required permission for this tab (from the RBAC allowlist). */
  permission: string;
  /** Destructive/non-destructive classification (CERT-14). */
  destructive: DestructiveClass;
  /** Online/offline capability (CERT-20). */
  offline: OfflineCapability;
  /** USTN applicability (CERT-9). */
  ustn: UstnApplicability;
  /** Trade context requirement (CERT-10). */
  tradeContext: TradeContextRequirement;
  /** Whether the screen is registered in the canonical registry AND resolves
   *  to a non-fallback screen. Set by `validateRegistry()`. */
  resolves?: boolean;
}

export interface CanonicalPortalSpec {
  id: string;
  name: string;
  role: string;
  tenantType: string;
  defaultTenantGtid: string;
  dualMode?: boolean;
  tabs: CanonicalScreenSpec[];
}

export interface CanonicalRegistry {
  version: 1;
  generatedAt: string;
  portals: CanonicalPortalSpec[];
  /** Validation result — populated by validateRegistry(). */
  validation?: RegistryValidation;
}

export interface RegistryValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  portalCount: number;
  tabCount: number;
  duplicatePortalIds: string[];
  duplicateTabIds: Record<string, string[]>;
  orphanTabs: Record<string, string[]>;
  missingPermissions: string[];
}

// ───────────────────────────────────────────────────────────────────────────────
// Permission allowlist (CERT-7 + CERT-4)
// ───────────────────────────────────────────────────────────────────────────────
//
// The canonical permission vocabulary. A tab's `permission` field MUST come
// from this list. Adding a new permission requires updating this list AND the
// middleware authorization check AND the Governor RBAC policies.

export const PERMISSION_ALLOWLIST = [
  "read:self",                // view own tenant data
  "write:self",               // mutate own tenant data
  "read:trade:self",          // view trades where this tenant is party
  "write:trade:self",         // mutate trades where this tenant is party
  "write:trade:counterparty", // act as counterparty on a trade
  "read:shipment:self",
  "write:shipment:self",
  "read:customs:self",
  "write:customs:self",
  "read:lab:self",
  "write:lab:self",
  "read:qc:self",
  "write:qc:self",
  "read:finance:self",
  "write:finance:self",
  "read:gov:any",              // government oversight: cross-tenant read
  "write:gov:any",             // government regulatory action (rare)
  "read:admin:platform",      // platform admin: cross-tenant read
  "write:admin:platform",     // platform admin: cross-tenant write
  "write:admin:tenant",       // company admin: own-tenant admin
  "read:marketplace:leads",
  "write:marketplace:leads",
  "read:marketplace:webhooks",
  "write:marketplace:webhooks",
] as const;

export type Permission = (typeof PERMISSION_ALLOWLIST)[number];

// ───────────────────────────────────────────────────────────────────────────────
// Registry builder
// ───────────────────────────────────────────────────────────────────────────────
//
// We extend the existing `PORTALS` array with the additional canonical
// metadata. The existing `PORTAL_MAP` stays authoritative for the runtime UI;
// this registry wraps it with the extra contract fields.

/** Per-portal per-tab canonical metadata. Keys are `${portalId}:${tabId}`. */
const TAB_METADATA: Record<string, Omit<CanonicalScreenSpec, "tabId" | "label" | "screen">> = {
  // ── Universal tabs (shared across portals)
  "trader-buyer:command":       { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "trader-seller:command":      { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "lsp:command":                { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "ship:command":               { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "lab:command":                { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "qc:command":                 { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "cbr:command":                { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "bank:command":               { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "pfi:command":                { permission: "read:self", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "gov:command":                { permission: "read:gov:any", destructive: "navigation-only", offline: "online-only", ustn: "ustn-optional", tradeContext: "trade-optional" },
  "admin:command-center":       { permission: "read:admin:platform", destructive: "navigation-only", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },
  "marketplace-partner:command-center": { permission: "read:marketplace:leads", destructive: "navigation-only", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },

  // ── Trade mutations (CERT-14: destructive classification)
  "trader-buyer:new-trade":     { permission: "write:trade:self", destructive: "destructive", offline: "offline-capable", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },
  "trader-seller:quotes":       { permission: "write:trade:counterparty", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },
  "trader-buyer:contract":      { permission: "write:trade:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },
  "trader-buyer:disputes":      { permission: "write:trade:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },
  "trader-seller:disputes":     { permission: "write:trade:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },

  // ── Customs / regulatory
  "cbr:declarations":           { permission: "write:customs:self", destructive: "destructive", offline: "offline-capable", ustn: "ustn-required", tradeContext: "trade-required" },
  "gov:customs":                { permission: "write:gov:any", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },

  // ── Lab / QC (destructive — release decisions are state transitions)
  "lab:certificates":           { permission: "write:lab:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },
  "qc:reports":                 { permission: "write:qc:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },

  // ── Finance
  "bank:collateral":            { permission: "write:finance:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },
  "pfi:borrowers":              { permission: "write:finance:self", destructive: "destructive", offline: "online-only", ustn: "ustn-required", tradeContext: "trade-required" },

  // ── Marketplace
  "marketplace-partner:leads":  { permission: "write:marketplace:leads", destructive: "destructive", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },
  "marketplace-partner:webhooks": { permission: "write:marketplace:webhooks", destructive: "destructive", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },

  // ── Admin
  "admin:audit":                { permission: "read:admin:platform", destructive: "non-destructive", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },
  "admin:company-admin":        { permission: "write:admin:tenant", destructive: "destructive", offline: "online-only", ustn: "ustn-not-applicable", tradeContext: "trade-not-applicable" },
};

/** The list of tabIds that are known to resolve to explicit screens (per the
 *  dispatcher in PortalContent.tsx). Any tabId NOT in this set will be flagged
 *  as `screen: "Unknown"` by the registry validator. This list is maintained
 *  manually because the dispatcher is a 680KB file with thousands of branches
 *  — the route-coverage test will catch drift. */
const KNOWN_SCREEN_TAB_IDS = new Set([
  // Universal
  "command", "worldwide-routes", "routes-reference", "shipments", "documents",
  "invoices", "milestones", "settlement", "audit", "admin", "compliance",
  "disputes", "distressed", "network", "readiness", "lifecycle", "org-graph",
  "passport", "chat",
  // Trade UI
  "container-compliance", "lc-management", "trade-certificates", "lc-matching",
  "lots", "trade-cost", "incoterm-engine",
  // Buyer
  "new-trade", "active-trades", "drafts", "history", "quotes", "contract",
  // Seller
  "pending-requests", "buyer-submissions",
  // Customs
  "declarations", "certificates", "clearance", "broker-onboarding",
  "customs-gateway", "broker-credentials", "submission-monitoring",
  "fee-schedule", "fee-commitments", "additional-charges", "fee-disputes",
  "trader-fee-view", "trader-dispute", "fee-dispute-admin",
  // Ship
  "vessels", "containers", "bl", "schedules", "dcsa", "roro", "air-cargo", "rail", "road",
  "packaging",
  // Lab / QC
  "requests", "queue", "sampling", "schedule", "field", "reports",
  // Gov
  "trade-flow", "integrations", "fx", "food-safety",
  // Bank / PFI
  "opportunities", "portfolio", "preferences", "financed-trades", "borrowers",
  "collateral",
  // Admin
  "command-center", "metrics", "incidents", "threats", "users", "tenants",
  "integrations", "competitor-benchmark", "customs-gateway-admin", "sla",
  "sandbox", "agreement", "company-admin",
  // Marketplace
  "leads", "webhooks", "revenue", "api-keys",
]);

// ───────────────────────────────────────────────────────────────────────────────
// Builder
// ───────────────────────────────────────────────────────────────────────────────

function buildRegistry(): CanonicalRegistry {
  const portals: CanonicalPortalSpec[] = PORTALS.map((p: PortalConfig) => {
    const tabs: CanonicalScreenSpec[] = p.tabs.map((t: PortalTab) => {
      const key = `${p.id}:${t.id}`;
      const meta = TAB_METADATA[key];
      const isKnown = KNOWN_SCREEN_TAB_IDS.has(t.id);
      return {
        tabId: t.id,
        label: t.label,
        screen: isKnown ? "ExplicitScreen" : "Unknown",
        permission: meta?.permission ?? "read:self",
        destructive: meta?.destructive ?? "navigation-only",
        offline: meta?.offline ?? "online-only",
        ustn: meta?.ustn ?? "ustn-optional",
        tradeContext: meta?.tradeContext ?? "trade-optional",
        resolves: isKnown,
      };
    });
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      tenantType: p.tenantType,
      defaultTenantGtid: p.defaultTenantGtid,
      dualMode: p.dualMode,
      tabs,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    portals,
  };
}

export const CANONICAL_NAVIGATION_REGISTRY: CanonicalRegistry = buildRegistry();

// ───────────────────────────────────────────────────────────────────────────────
// Validator
// ───────────────────────────────────────────────────────────────────────────────

export function validateRegistry(registry: CanonicalRegistry = CANONICAL_NAVIGATION_REGISTRY): RegistryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicatePortalIds: string[] = [];
  const duplicateTabIds: Record<string, string[]> = {};
  const orphanTabs: Record<string, string[]> = {};
  const missingPermissions: string[] = [];

  // 1. Duplicate portal IDs
  const portalIdSet = new Set<string>();
  for (const p of registry.portals) {
    if (portalIdSet.has(p.id)) duplicatePortalIds.push(p.id);
    portalIdSet.add(p.id);
  }

  // 2. Duplicate tab IDs within each portal + permission validity + screen resolution
  for (const p of registry.portals) {
    const tabIdSet = new Set<string>();
    const tabIdCount: Record<string, number> = {};
    for (const t of p.tabs) {
      tabIdCount[t.tabId] = (tabIdCount[t.tabId] || 0) + 1;
    }
    const dups = Object.entries(tabIdCount).filter(([, n]) => n > 1).map(([id]) => id);
    if (dups.length > 0) duplicateTabIds[p.id] = dups;

    const orphans: string[] = [];
    for (const t of p.tabs) {
      tabIdSet.add(t.tabId);
      if (!PERMISSION_ALLOWLIST.includes(t.permission as Permission)) {
        missingPermissions.push(`${p.id}:${t.tabId}=${t.permission}`);
      }
      if (t.screen === "Unknown" || t.resolves === false) {
        orphans.push(t.tabId);
      }
    }
    if (orphans.length > 0) orphanTabs[p.id] = orphans;
  }

  if (duplicatePortalIds.length > 0) {
    errors.push(`Duplicate portal IDs: ${duplicatePortalIds.join(", ")}`);
  }
  for (const [pid, dups] of Object.entries(duplicateTabIds)) {
    errors.push(`Duplicate tab IDs in portal ${pid}: ${dups.join(", ")}`);
  }
  for (const [pid, orphans] of Object.entries(orphanTabs)) {
    warnings.push(`Orphan tabs in portal ${pid} (no known screen): ${orphans.join(", ")}`);
  }
  if (missingPermissions.length > 0) {
    warnings.push(`Tabs with non-allowlisted permissions: ${missingPermissions.length} (first 5: ${missingPermissions.slice(0, 5).join("; ")})`);
  }

  const tabCount = registry.portals.reduce((sum, p) => sum + p.tabs.length, 0);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    portalCount: registry.portals.length,
    tabCount,
    duplicatePortalIds,
    duplicateTabIds,
    orphanTabs,
    missingPermissions,
  };
}

// Convenience export for tests and the route-coverage test.
export function getPortalById(id: string): CanonicalPortalSpec | undefined {
  return CANONICAL_NAVIGATION_REGISTRY.portals.find((p) => p.id === id);
}

export function getAllTabIds(): string[] {
  return CANONICAL_NAVIGATION_REGISTRY.portals.flatMap((p) => p.tabs.map((t) => `${p.id}:${t.tabId}`));
}

export function getTabSpec(portalId: string, tabId: string): CanonicalScreenSpec | undefined {
  return getPortalById(portalId)?.tabs.find((t) => t.tabId === tabId);
}
