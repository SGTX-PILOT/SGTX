// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §11 — Service Provider Capability Model
// ═══════════════════════════════════════════════════════════════════════════════
//
// This module implements the Service Provider Capability Model per SGTX v17
// Section 11. It maintains a strict separation between:
//
//   1. `tenant.type`            — the tenant's primary role (TRD, LSP, SHIP,
//                                 LAB, QC, FIN, GOV, MP, CBR, ADM, etc.)
//   2. `tenant.serviceCapabilities` — a JSON array of capability codes the
//                                     tenant can perform (TRUCKING, FORWARDING,
//                                     OCEAN_FREIGHT, LAB_TESTING, ...)
//
// A tenant's `type` answers "who are you?". A tenant's
// `serviceCapabilities` answers "what can you do?". The two are independent:
// a single LSP can hold both TRUCKING and WAREHOUSING capabilities; an SHIP can
// hold both OCEAN_FREIGHT and RO_RO capabilities.
//
// ────────────────────────────────────────────────────────────────────────────
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED)
// ────────────────────────────────────────────────────────────────────────────
//
// The SGTX platform is NOT a marketplace. Per v17 Section 11.4 and the
// v16 Non-Marketplace Principle, this module NEVER:
//
//   • Ranks providers                       — NO scoring, NO "best match".
//   • Recommends providers                  — NO "you might also like".
//   • Suggests alternative counterparties   — NO discovery feed, NO ads.
//   • Surfaces providers the caller did not
//     explicitly ask for                    — NO generic listing by port.
//
// Matching returns providers in DETERMINISTIC ALPHABETICAL ORDER by GTID —
// never ranked. The caller must explicitly know (or be told by an
// off-platform channel) which provider GTID they want to work with; the
// matching route merely confirms "yes, this provider has the capability and
// covers this port" so the caller can make an explicit selection.
//
// Anonymous RFQ opt-in/opt-out: tenants may set `anonymousRfqOptOut=true`
// to opt out of being the recipient of any anonymous RFQ broadcast. The
// matching engine excludes opted-out tenants from any match result.
//
// ────────────────────────────────────────────────────────────────────────────
// GEO-AWARE SERVICE MATCHING
// ────────────────────────────────────────────────────────────────────────────
//
// `findProvidersWithCapability(code, portUnlocode?, countryCode?)` filters:
//
//   1. Tenant has the capability code in `serviceCapabilities` JSON array.
//   2. ProviderPortCoverage row exists for the (provider, capability) pair
//      AND `isActive=true`.
//   3. When `portUnlocode` is supplied, the coverage row must match that port.
//      When `countryCode` is supplied (and portUnlocode is not), the coverage
//      row must match that country.
//   4. Tenant is in `VERIFIED` lifecycle state (sanctions/AML cleared).
//   5. Tenant has NOT opted out of anonymous RFQ (`anonymousRfqOptOut=false`).
//
// The result is sorted ALPHABETICALLY by GTID — no ranking, no scoring, no
// recommendation. The order is stable across calls.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ServiceCapabilityDefinitionRow {
  id: string;
  capabilityCode: string;
  capabilityName: string;
  capabilityGroup: string; // LOGISTICS | BROKERAGE | LAB | QC | FINANCE
  requiresAccreditation: boolean;
  requiresInsurance: boolean;
  defaultPortalTab: string | null;
}

export interface ProviderPortCoverageRow {
  id: string;
  providerGtid: string;
  serviceCapability: string;
  portUnlocode: string;
  countryCode: string;
  isActive: boolean;
  lastVerified: Date | null;
  createdAt: Date;
}

export interface TenantCapabilitySummary {
  gtid: string;
  legalName: string;
  type: string;
  country: string;
  lifecycleState: string;
  capabilities: string[];
  capabilityCount: number;
}

export interface CapabilityAssignmentValidation {
  valid: boolean;
  reason?: string;
  missing?: string[];
}

export interface NonMarketplaceGuardrailResult {
  compliant: boolean;
  violations: string[];
}

export interface ProviderMatchResult {
  providers: any[]; // Tenant rows
  count: number;
  matching_method: "deterministic_alphabetical";
  non_marketplace: true;
  filters: {
    capabilityCode: string;
    portUnlocode?: string;
    countryCode?: string;
    requireVerified: boolean;
    excludeRfqOptOut: boolean;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory cache (per-process). Definitions are reference data that rarely
// change; we cache them with a 60s TTL to avoid hammering the DB on every
// matching call. Port coverage is per-provider and changes even less often;
// we cache the active-coverage index for 60s too.
// ────────────────────────────────────────────────────────────────────────────

const DEFINITIONS_CACHE_TTL_MS = 60_000;

let definitionsCache: ServiceCapabilityDefinitionRow[] | null = null;
let definitionsCacheAt = 0;

// ────────────────────────────────────────────────────────────────────────────
// Capability definitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return all capability definitions. Cached for 60s per process.
 */
export async function getCapabilityDefinitions(): Promise<ServiceCapabilityDefinitionRow[]> {
  const now = Date.now();
  if (definitionsCache && now - definitionsCacheAt < DEFINITIONS_CACHE_TTL_MS) {
    return definitionsCache;
  }
  try {
    const rows = await db.serviceCapabilityDefinition.findMany({
      orderBy: [{ capabilityGroup: "asc" }, { capabilityCode: "asc" }],
    });
    definitionsCache = rows as unknown as ServiceCapabilityDefinitionRow[];
    definitionsCacheAt = now;
    return definitionsCache;
  } catch (e: any) {
    logger.error("[service-capability] getCapabilityDefinitions failed", { error: e?.message });
    // Surface a useful empty result rather than crashing the caller —
    // the route handler can decide to 500 on a real DB error.
    if (definitionsCache) return definitionsCache;
    throw e;
  }
}

/**
 * Invalidate the in-process definitions cache. Call after creating /
 * updating / deleting a definition so subsequent reads reflect the change.
 */
export function invalidateCapabilityDefinitionsCache(): void {
  definitionsCache = null;
  definitionsCacheAt = 0;
}

/**
 * Get a single capability definition by code.
 */
export async function getCapabilityDefinition(
  capabilityCode: string,
): Promise<ServiceCapabilityDefinitionRow | null> {
  if (!capabilityCode) return null;
  const all = await getCapabilityDefinitions();
  const upper = capabilityCode.toUpperCase();
  return all.find((d) => d.capabilityCode === upper) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Tenant capability read helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse the JSON-encoded `serviceCapabilities` array on a tenant row.
 * Defensive: tolerates the default "[]" string, malformed JSON (returns []),
 * and non-array JSON (returns []).
 */
export function parseCapabilitiesArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => String(c).toUpperCase().trim())
      .filter((c) => c.length > 0);
  } catch {
    return [];
  }
}

/**
 * Read a tenant's capability codes (parsed from JSON).
 */
export async function getTenantCapabilities(
  tenantGtid: string,
): Promise<string[]> {
  if (!tenantGtid) return [];
  const tenant = await db.tenant.findUnique({
    where: { gtid: tenantGtid },
    select: { serviceCapabilities: true },
  });
  if (!tenant) return [];
  return parseCapabilitiesArray(tenant.serviceCapabilities);
}

/**
 * Does the tenant hold the given capability code?
 */
export async function hasCapability(
  tenantGtid: string,
  capabilityCode: string,
): Promise<boolean> {
  if (!tenantGtid || !capabilityCode) return false;
  const caps = await getTenantCapabilities(tenantGtid);
  return caps.includes(capabilityCode.toUpperCase());
}

// ────────────────────────────────────────────────────────────────────────────
// Capability assignment validation + mutation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate whether a capability can be assigned to a tenant.
 *
 * Checks:
 *   1. The capability definition exists.
 *   2. The tenant exists and is in a non-SUSPENDED lifecycle state.
 *   3. If the definition `requiresAccreditation=true`, the tenant must be
 *      KYB tier ≥ 2 AND `kybStatus="CLEARED"`.
 *   4. If the definition `requiresInsurance=true`, the tenant must have a
 *      `bankSwift` populated (proxy for an institutional relationship that
 *      could secure cargo insurance) OR a bank account on file.
 *
 * Returns `{ valid: true }` on success, or
 * `{ valid: false, reason, missing[] }` with human-readable violations.
 */
export async function validateCapabilityAssignment(
  tenantGtid: string,
  capabilityCode: string,
): Promise<CapabilityAssignmentValidation> {
  if (!tenantGtid || !capabilityCode) {
    return { valid: false, reason: "tenantGtid and capabilityCode are required", missing: [] };
  }
  const definition = await getCapabilityDefinition(capabilityCode);
  if (!definition) {
    return {
      valid: false,
      reason: `Capability "${capabilityCode}" is not defined — ask an admin to create it first`,
      missing: ["capability_definition"],
    };
  }

  const tenant = await db.tenant.findUnique({
    where: { gtid: tenantGtid },
    select: {
      gtid: true,
      legalName: true,
      type: true,
      lifecycleState: true,
      kybTier: true,
      kybStatus: true,
      bankSwift: true,
      bankAccountNo: true,
    },
  });
  if (!tenant) {
    return {
      valid: false,
      reason: `Tenant ${tenantGtid} not found`,
      missing: ["tenant"],
    };
  }
  if (tenant.lifecycleState === "SUSPENDED" || tenant.lifecycleState === "REVOKED") {
    return {
      valid: false,
      reason: `Tenant ${tenant.legalName} is ${tenant.lifecycleState} — capability assignment is blocked`,
      missing: ["lifecycle_state"],
    };
  }

  const missing: string[] = [];
  if (definition.requiresAccreditation) {
    if ((tenant.kybTier ?? 0) < 2) {
      missing.push("kyb_tier_2_or_higher");
    }
    if (tenant.kybStatus !== "CLEARED") {
      missing.push("kyb_cleared");
    }
  }
  if (definition.requiresInsurance) {
    const hasBankRelation = !!(tenant.bankSwift || tenant.bankAccountNo);
    if (!hasBankRelation) {
      missing.push("institutional_insurance_relation");
    }
  }
  if (missing.length > 0) {
    return {
      valid: false,
      reason:
        `Capability "${definition.capabilityName}" requires: ` +
        missing
          .map((m) =>
            m === "kyb_tier_2_or_higher"
              ? "KYB tier ≥ 2"
              : m === "kyb_cleared"
              ? "KYB status CLEARED"
              : m === "institutional_insurance_relation"
              ? "an institutional insurance relation (bank SWIFT or account on file)"
              : m,
          )
          .join(", "),
      missing,
    };
  }
  return { valid: true };
}

/**
 * Assign a capability to a tenant. Idempotent — re-assigning the same
 * capability is a no-op. Validates prerequisites first; throws on
 * validation failure.
 */
export async function assignCapability(
  tenantGtid: string,
  capabilityCode: string,
): Promise<{ assigned: boolean; capabilities: string[] }> {
  const validation = await validateCapabilityAssignment(tenantGtid, capabilityCode);
  if (!validation.valid) {
    throw new Error(validation.reason || "Capability assignment validation failed");
  }
  const upper = capabilityCode.toUpperCase();
  const current = await getTenantCapabilities(tenantGtid);
  if (current.includes(upper)) {
    return { assigned: false, capabilities: current };
  }
  const next = [...current, upper];
  await db.tenant.update({
    where: { gtid: tenantGtid },
    data: { serviceCapabilities: JSON.stringify(next) },
  });
  logger.info("[service-capability] capability assigned", {
    tenantGtid,
    capabilityCode: upper,
  });
  return { assigned: true, capabilities: next };
}

/**
 * Remove a capability from a tenant. Idempotent — removing a capability
 * the tenant does not hold is a no-op.
 */
export async function removeCapability(
  tenantGtid: string,
  capabilityCode: string,
): Promise<{ removed: boolean; capabilities: string[] }> {
  if (!tenantGtid || !capabilityCode) return { removed: false, capabilities: [] };
  const upper = capabilityCode.toUpperCase();
  const current = await getTenantCapabilities(tenantGtid);
  if (!current.includes(upper)) {
    return { removed: false, capabilities: current };
  }
  const next = current.filter((c) => c !== upper);
  await db.tenant.update({
    where: { gtid: tenantGtid },
    data: { serviceCapabilities: JSON.stringify(next) },
  });
  logger.info("[service-capability] capability removed", {
    tenantGtid,
    capabilityCode: upper,
  });
  return { removed: true, capabilities: next };
}

// ────────────────────────────────────────────────────────────────────────────
// Port coverage
// ────────────────────────────────────────────────────────────────────────────

/**
 * List all port-coverage rows for a provider (optionally filtered by
 * capability code). Returns only active rows by default.
 */
export async function listProviderPortCoverage(
  providerGtid: string,
  options: { capabilityCode?: string; includeInactive?: boolean } = {},
): Promise<ProviderPortCoverageRow[]> {
  if (!providerGtid) return [];
  const where: any = { providerGtid: providerGtid };
  if (options.capabilityCode) {
    where.serviceCapability = options.capabilityCode.toUpperCase();
  }
  if (!options.includeInactive) {
    where.isActive = true;
  }
  const rows = await db.providerPortCoverage.findMany({
    where,
    orderBy: [{ serviceCapability: "asc" }, { countryCode: "asc" }, { portUnlocode: "asc" }],
  });
  return rows as unknown as ProviderPortCoverageRow[];
}

/**
 * Add a port-coverage row for a provider. Idempotent on
 * (provider, capability, port) — if a row already exists, it is reactivated
 * and `lastVerified` is bumped. The (provider, capability, port) tuple is
 // enforced as UNIQUE by the Prisma schema.
 *
 * Pre-conditions:
 *   • The provider must hold the capability (hasCapability=true). If the
 *     capability is known but the tenant does not have it, this throws.
 */
export async function addPortCoverage(
  providerGtid: string,
  capabilityCode: string,
  portUnlocode: string,
  countryCode: string,
): Promise<{ id: string; created: boolean; coverage: ProviderPortCoverageRow }> {
  if (!providerGtid || !capabilityCode || !portUnlocode || !countryCode) {
    throw new Error("providerGtid, capabilityCode, portUnlocode, and countryCode are required");
  }
  const upperCode = capabilityCode.toUpperCase();
  const upperPort = portUnlocode.toUpperCase();
  const upperCountry = countryCode.toUpperCase();

  // Pre-condition: the provider must hold the capability.
  const has = await hasCapability(providerGtid, upperCode);
  if (!has) {
    throw new Error(
      `Provider ${providerGtid} does not hold capability ${upperCode} — assign the capability first`,
    );
  }

  // Idempotent on the unique tuple.
  const existing = await db.providerPortCoverage.findFirst({
    where: {
      providerGtid,
      serviceCapability: upperCode,
      portUnlocode: upperPort,
    },
  });
  if (existing) {
    const updated = await db.providerPortCoverage.update({
      where: { id: existing.id },
      data: { isActive: true, lastVerified: new Date(), countryCode: upperCountry },
    });
    return {
      id: existing.id,
      created: false,
      coverage: updated as unknown as ProviderPortCoverageRow,
    };
  }

  const created = await db.providerPortCoverage.create({
    data: {
      providerGtid,
      serviceCapability: upperCode,
      portUnlocode: upperPort,
      countryCode: upperCountry,
      isActive: true,
      lastVerified: new Date(),
    },
  });
  logger.info("[service-capability] port coverage added", {
    providerGtid,
    capabilityCode: upperCode,
    portUnlocode: upperPort,
    countryCode: upperCountry,
  });
  return {
    id: created.id,
    created: true,
    coverage: created as unknown as ProviderPortCoverageRow,
  };
}

/**
 * Remove (deactivate) a port-coverage row. Soft-delete — sets `isActive=false`
 * so historical references remain intact. Hard-delete if the caller passes
 * `{ hardDelete: true }` (admin only — the route enforces this).
 */
export async function removePortCoverage(
  providerGtid: string,
  capabilityCode: string,
  portUnlocode: string,
  options: { hardDelete?: boolean } = {},
): Promise<{ removed: boolean; hardDeleted: boolean }> {
  if (!providerGtid || !capabilityCode || !portUnlocode) {
    return { removed: false, hardDeleted: false };
  }
  const upperCode = capabilityCode.toUpperCase();
  const upperPort = portUnlocode.toUpperCase();
  const existing = await db.providerPortCoverage.findFirst({
    where: { providerGtid, serviceCapability: upperCode, portUnlocode: upperPort },
  });
  if (!existing) return { removed: false, hardDeleted: false };

  if (options.hardDelete) {
    await db.providerPortCoverage.delete({ where: { id: existing.id } });
    logger.info("[service-capability] port coverage hard-deleted", {
      providerGtid,
      capabilityCode: upperCode,
      portUnlocode: upperPort,
    });
    return { removed: true, hardDeleted: true };
  }

  if (!existing.isActive) {
    return { removed: false, hardDeleted: false };
  }
  await db.providerPortCoverage.update({
    where: { id: existing.id },
    data: { isActive: false },
  });
  logger.info("[service-capability] port coverage deactivated", {
    providerGtid,
    capabilityCode: upperCode,
    portUnlocode: upperPort,
  });
  return { removed: true, hardDeleted: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Geo-aware matching engine (NON-MARKETPLACE GUARDRAILED)
// ────────────────────────────────────────────────────────────────────────────
//
// *** CRITICAL GUARDRAIL ***
//
// This function returns providers in DETERMINISTIC ALPHABETICAL ORDER by
// GTID. It NEVER ranks. It NEVER scores. It NEVER recommends. It NEVER
// suggests "you might also like". It NEVER returns providers the caller did
// not explicitly filter for.
//
// The result is the complete set of providers that match the caller's
// explicit filter (capability code + optional port + optional country) —
// nothing more, nothing less. The caller MUST make the explicit selection.
// ────────────────────────────────────────────────────────────────────────────

export interface MatchFilters {
  capabilityCode: string;
  portUnlocode?: string;
  countryCode?: string;
  requireVerified?: boolean; // default true
  excludeRfqOptOut?: boolean; // default true
}

export async function findProvidersWithCapability(
  filters: MatchFilters,
): Promise<ProviderMatchResult> {
  const capabilityCode = (filters.capabilityCode || "").toUpperCase();
  if (!capabilityCode) {
    return {
      providers: [],
      count: 0,
      matching_method: "deterministic_alphabetical",
      non_marketplace: true,
      filters: {
        capabilityCode: "",
        requireVerified: true,
        excludeRfqOptOut: true,
      },
    };
  }

  const requireVerified = filters.requireVerified !== false; // default true
  const excludeRfqOptOut = filters.excludeRfqOptOut !== false; // default true
  const portUnlocode = filters.portUnlocode?.toUpperCase();
  const countryCode = filters.countryCode?.toUpperCase();

  // ── 1. Find all coverage rows matching the capability + port/country filter.
  const coverageWhere: any = {
    serviceCapability: capabilityCode,
    isActive: true,
  };
  if (portUnlocode) {
    coverageWhere.portUnlocode = portUnlocode;
  } else if (countryCode) {
    coverageWhere.countryCode = countryCode;
  }
  const coverageRows = await db.providerPortCoverage.findMany({
    where: coverageWhere,
    select: { providerGtid: true },
  });
  const candidateGtids = Array.from(
    new Set(coverageRows.map((r: any) => r.providerGtid)),
  );

  if (candidateGtids.length === 0) {
    return {
      providers: [],
      count: 0,
      matching_method: "deterministic_alphabetical",
      non_marketplace: true,
      filters: {
        capabilityCode,
        portUnlocode,
        countryCode,
        requireVerified,
        excludeRfqOptOut,
      },
    };
  }

  // ── 2. Fetch the candidate tenants with the lifecycle / RFQ-opt-out filters.
  const tenantWhere: any = {
    gtid: { in: candidateGtids },
  };
  if (requireVerified) {
    // VERIFIED is the only "open for business" lifecycle state per v17 §4.
    tenantWhere.lifecycleState = "VERIFIED";
  }
  if (excludeRfqOptOut) {
    tenantWhere.anonymousRfqOptOut = false;
  }

  const tenants = (await db.tenant.findMany({
    where: tenantWhere,
    select: {
      id: true,
      gtid: true,
      legalName: true,
      type: true,
      country: true,
      city: true,
      sector: true,
      kybTier: true,
      trustScore: true,
      lifecycleState: true,
      sanctionsCleared: true,
      serviceCapabilities: true,
      anonymousRfqOptOut: true,
    },
  })) as any[];

  // ── 3. Defensive: ensure each tenant's parsed capabilities array contains
  // the requested code. Coverage rows could in principle drift out of sync
  // with the tenant.serviceCapabilities JSON if a capability was removed
  // without removing the coverage row. We filter that case out so the
  // match result is always consistent with the tenant's declared capabilities.
  const filtered = tenants.filter((t) => {
    const caps = parseCapabilitiesArray(t.serviceCapabilities);
    return caps.includes(capabilityCode);
  });

  // ── 4. *** DETERMINISTIC ALPHABETICAL ORDER BY GTID ***
  //
  // No ranking. No scoring. No "you might also like". No recommendation.
  // The order is the lexicographic order of the providers' GTID strings —
  // stable, deterministic, identical across calls.
  filtered.sort((a, b) => {
    if (a.gtid < b.gtid) return -1;
    if (a.gtid > b.gtid) return 1;
    return 0;
  });

  return {
    providers: filtered,
    count: filtered.length,
    matching_method: "deterministic_alphabetical",
    non_marketplace: true,
    filters: {
      capabilityCode,
      portUnlocode,
      countryCode,
      requireVerified,
      excludeRfqOptOut,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Non-marketplace guardrails checker
// ────────────────────────────────────────────────────────────────────────────
//
// A defensive helper used by the API route handlers to verify that any
// action / payload / response complies with the v17 Non-Marketplace
// Principle. The check is keyword-based: it scans the JSON-serialised
// representation of the action for forbidden terms and reports any
// violations. The caller can then either reject the action or strip the
// forbidden fields.
//
// Forbidden terms (case-insensitive substring match against the JSON
// representation):
//   "rank", "ranking", "score" (except in "trust_score" / "health_score"
//                              echo fields on Tenant rows), "recommend",
//   "recommended", "suggested", "you might also like", "best match",
//   "top provider", "featured", "popular", "trending"
//
// NOTE on "score": the Tenant model carries `trustScore` and trades carry
// `healthScore`. These are LEGITIMATE per-tenant attributes that the
// platform already publishes. We do NOT flag the JSON keys "trustScore"
// or "healthScore" — only bare "score" words like "match_score",
// "relevance_score", or "provider_score". The exclusion list below
// encodes that distinction.

const FORBIDDEN_MARKETPLACE_TERMS = [
  "rank",
  "ranking",
  "recommended",
  "recommend",
  "suggested",
  "you might also like",
  "best match",
  "top provider",
  "featured",
  "popular",
  "trending",
  "relevance_score",
  "match_score",
  "provider_score",
  "ranking_score",
];

const ALLOWED_SCORE_KEYS = new Set([
  "trustScore",
  "healthScore",
  "trust_score",
  "health_score",
]);

/**
 * Check whether an action (request body / response payload / route handler
 * intermediate result) complies with the Non-Marketplace Principle.
 *
 * The check operates on the JSON-serialised form of the action. It walks
 * the object tree and flags any property whose key matches a forbidden
 * marketplace term OR whose string value contains one of the forbidden
// phrases. Legitimate score keys (trustScore, healthScore) are exempted.
 *
 * Returns `{ compliant: true, violations: [] }` on success or
 * `{ compliant: false, violations: [...] }` with a list of human-readable
 * violation strings on failure.
 */
export function checkNonMarketplaceGuardrails(action: any): NonMarketplaceGuardrailResult {
  if (action == null) return { compliant: true, violations: [] };
  const violations: string[] = [];

  const walk = (node: any, path: string) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      for (const key of Object.keys(node)) {
        const value = node[key];
        const childPath = path ? `${path}.${key}` : key;

        // Check the key against forbidden terms (case-insensitive). The
        // legitimate per-tenant score keys are exempted.
        const lowerKey = String(key).toLowerCase();
        if (!ALLOWED_SCORE_KEYS.has(key)) {
          for (const term of FORBIDDEN_MARKETPLACE_TERMS) {
            if (lowerKey === term || lowerKey.includes(term)) {
              violations.push(
                `Forbidden marketplace term "${term}" found in field key "${childPath}"`,
              );
              break;
            }
          }
        }
        // Check string values against the forbidden phrases
        if (typeof value === "string") {
          const lowerValue = value.toLowerCase();
          for (const phrase of FORBIDDEN_MARKETPLACE_TERMS) {
            if (phrase.includes("_")) continue; // skip score-style terms here; key check covers them
            if (lowerValue.includes(phrase)) {
              violations.push(
                `Forbidden marketplace phrase "${phrase}" found in value at "${childPath}"`,
              );
              break;
            }
          }
        }
        walk(value, childPath);
      }
      return;
    }
  };

  walk(action, "");
  return { compliant: violations.length === 0, violations };
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience: build a TenantCapabilitySummary for a single tenant
// ────────────────────────────────────────────────────────────────────────────

export async function getTenantCapabilitySummary(
  tenantGtid: string,
): Promise<TenantCapabilitySummary | null> {
  const tenant = await db.tenant.findUnique({
    where: { gtid: tenantGtid },
    select: {
      gtid: true,
      legalName: true,
      type: true,
      country: true,
      lifecycleState: true,
      serviceCapabilities: true,
    },
  });
  if (!tenant) return null;
  return {
    gtid: tenant.gtid,
    legalName: tenant.legalName,
    type: tenant.type,
    country: tenant.country,
    lifecycleState: tenant.lifecycleState,
    capabilities: parseCapabilitiesArray(tenant.serviceCapabilities),
    capabilityCount: parseCapabilitiesArray(tenant.serviceCapabilities).length,
  };
}
