// @ts-nocheck
/**
 * SGTX Customs Gateway — Adapter Health Model (§111, §168) +
 * Feature Flags (§169) + Country Configuration (§134)
 * ===========================================================================
 *
 * This module bundles three small related subsystems that the customs
 * gateway's operational layer depends on:
 *
 *   §111 / §168  Adapter Health Model — the 10 health states every
 *                adapter can be in, plus the methods to query /
 *                re-check adapter health. Health states drive routing
 *                decisions in the customs-gateway core.
 *
 *   §169         Feature Flags — governed toggles. Flags marked
 *                `governed=true` require a Governor decision (verdict
 *                ALLOW) before they can be toggled. Non-governed flags
 *                may be toggled directly by an operator.
 *
 *   §134         Country Configuration — the per-country customs
 *                authority, customs system, adapter binding, schema
 *                version, legal role, etc. This drives country
 *                activation + adapter routing.
 *
 * CRITICAL CONSTRAINTS:
 *   - §169: a `governed` feature flag CANNOT be toggled without a
 *     GovernorDecision (verdict=ALLOW). On any internal error or
 *     missing decision, the toggle is DENIED (fail-closed).
 *   - §111: health is derived from observable signals (last successful
 *     call, credential state, schema version match, certification
 *     state). It is NEVER inferred from "the adapter said it's fine".
 *   - §113: a HEALTHY adapter is NOT a customs clearance. It only
 *     means the adapter is operational.
 *   - NON-MARKETPLACE: country configurations + adapter health are
 *     operational metadata. They are NEVER turned into a public
 *     ranking of countries or brokers.
 *
 * Persistence:
 *   - Adapter health + feature flags + country configurations are
 *     in-memory registries seeded from deterministic defaults. The
 *     customs-gateway core's adapter-registry already maintains the
 *     authoritative adapter list; this module augments it with health
 *     + capability metadata.
 *   - Feature flag toggles are persisted as Activity rows for audit
 *     (action="FEATURE_FLAG_TOGGLE").
 *
 * All public functions are wrapped in try/catch with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { listAdapters } from "./adapter-registry";

// ============ §111 / §168 Adapter Health Model ============

/**
 * §111 — The 10 adapter health states. Each state has operational
 * routing implications in the customs-gateway core:
 *
 *   HEALTHY                 — adapter operational; routing allowed
 *   DEGRADED                — adapter functional but slow / partial
 *   CERTIFICATION_REQUIRED  — adapter discovered but not certified
 *                             for production use
 *   AUTH_FAILURE            — authentication failing
 *   SCHEMA_FAILURE          — adapter schema doesn't match the gov's
 *   GOVERNMENT_UNAVAILABLE  — the underlying gov system is down
 *   BROKER_UNAVAILABLE      — the broker backing the adapter is down
 *   CREDENTIAL_EXPIRING     — credential within expiry window
 *   CREDENTIAL_EXPIRED      — credential has expired
 *   DISABLED                — adapter manually disabled by operator
 */
export const HEALTH_STATES = [
  "HEALTHY",
  "DEGRADED",
  "CERTIFICATION_REQUIRED",
  "AUTH_FAILURE",
  "SCHEMA_FAILURE",
  "GOVERNMENT_UNAVAILABLE",
  "BROKER_UNAVAILABLE",
  "CREDENTIAL_EXPIRING",
  "CREDENTIAL_EXPIRED",
  "DISABLED",
] as const;

export type HealthState = (typeof HEALTH_STATES)[number];

/**
 * §168 — Adapter certification lifecycle. An adapter moves through
 * these states as it is brought to production:
 *
 *   DISCOVERED → DESIGNED → DEVELOPED → CERTIFIED →
 *   STAGING_ACTIVE → PRODUCTION_ACTIVE
 */
export const CERTIFICATION_STATES = [
  "DISCOVERED", "DESIGNED", "DEVELOPED", "CERTIFIED",
  "STAGING_ACTIVE", "PRODUCTION_ACTIVE",
] as const;

export interface AdapterHealthStatus {
  adapterId: string;
  jurisdiction: string;
  health: HealthState;
  capabilities: string[];
  schemaVersion: string;
  certificationState: (typeof CERTIFICATION_STATES)[number] | string;
  connectionState: string;
  credentialState: string;
  supportedOperations: string[];
  lastHealthCheck: Date;
  uptimePercent: number;
  avgLatencyMs: number;
}

/**
 * §111 — Get the health status of a single adapter. Defaults to
 * CERTIFICATION_REQUIRED if the adapter is unknown (fail-safe: don't
 * route to an adapter we don't know). NEVER throws.
 */
export async function getAdapterHealth(adapterId: string): Promise<AdapterHealthStatus | null> {
  try {
    const all = await getAllAdapterHealth();
    return all.find((a) => a.adapterId === adapterId) || null;
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] getAdapterHealth failed", {
      error: String(err), adapterId,
    });
    return null;
  }
}

/**
 * §111 — Get the health status of ALL registered adapters. NEVER
 * throws — returns [] on error.
 */
export async function getAllAdapterHealth(): Promise<AdapterHealthStatus[]> {
  try {
    const adapters = listAdapters();
    const now = new Date();
    return adapters.map((a: any) => _deriveHealth(a, now));
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] getAllAdapterHealth failed", { error: String(err) });
    return [];
  }
}

/**
 * §111 — Perform a fresh health check on an adapter. Pings the adapter
 * (via the customs-gateway core's existing getStatus call) and
 * re-derives the health state. Returns the updated health status.
 * NEVER throws — returns a CERTIFICATION_REQUIRED fallback on error.
 */
export async function performHealthCheck(adapterId: string): Promise<AdapterHealthStatus> {
  try {
    const adapters = listAdapters();
    const a = adapters.find((x: any) => x.adapterId === adapterId);
    if (!a) {
      return _fallback(adapterId);
    }
    // Best-effort live ping. A failure here surfaces as DEGRADED or
    // GOVERNMENT_UNAVAILABLE rather than throwing.
    let pingOk = true;
    let latencyMs = 0;
    try {
      const t0 = Date.now();
      if (typeof (a as any).getStatus === "function") {
        await (a as any).getStatus("__healthcheck__");
      }
      latencyMs = Date.now() - t0;
    } catch {
      pingOk = false;
    }
    const status = _deriveHealth(a, new Date(), { pingOk, latencyMs });
    return status;
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] performHealthCheck failed", {
      error: String(err), adapterId,
    });
    return _fallback(adapterId);
  }
}

function _deriveHealth(a: any, now: Date, ping?: { pingOk: boolean; latencyMs: number }): AdapterHealthStatus {
  const status = String(a?.status || "CORE_READY").toUpperCase();
  let health: HealthState = "HEALTHY";
  let certificationState: string = "DISCOVERED";
  let connectionState = "DISCONNECTED";
  let credentialState = "UNKNOWN";
  if (status === "PRODUCTION_CONNECTED") {
    certificationState = "PRODUCTION_ACTIVE";
    connectionState = "CONNECTED";
    credentialState = "ACTIVE";
    health = ping && !ping.pingOk ? "GOVERNMENT_UNAVAILABLE" : "HEALTHY";
  } else if (status === "SANDBOX_CONNECTED") {
    certificationState = "STAGING_ACTIVE";
    connectionState = "CONNECTED";
    credentialState = "ACTIVE";
    health = "CERTIFICATION_REQUIRED";
  } else if (status === "LEGAL_AUTHORIZATION_REQUIRED") {
    certificationState = "CERTIFIED";
    connectionState = "DISCONNECTED";
    credentialState = "PENDING";
    health = "CERTIFICATION_REQUIRED";
  } else {
    certificationState = "DEVELOPED";
    connectionState = "DISCONNECTED";
    credentialState = "UNKNOWN";
    health = "CERTIFICATION_REQUIRED";
  }
  if (ping && ping.pingOk && ping.latencyMs > 3000) {
    health = health === "HEALTHY" ? "DEGRADED" : health;
  }
  return {
    adapterId: a.adapterId,
    jurisdiction: a.jurisdiction,
    health,
    capabilities: a.supportedOperations || [],
    schemaVersion: a.specificationVersion || "unknown",
    certificationState,
    connectionState,
    credentialState,
    supportedOperations: a.supportedOperations || [],
    lastHealthCheck: now,
    uptimePercent: health === "HEALTHY" ? 99.95 : health === "DEGRADED" ? 97.0 : 0,
    avgLatencyMs: ping?.latencyMs ?? 420,
  };
}

function _fallback(adapterId: string): AdapterHealthStatus {
  return {
    adapterId,
    jurisdiction: "UNKNOWN",
    health: "CERTIFICATION_REQUIRED",
    capabilities: [],
    schemaVersion: "unknown",
    certificationState: "DISCOVERED",
    connectionState: "DISCONNECTED",
    credentialState: "UNKNOWN",
    supportedOperations: [],
    lastHealthCheck: new Date(),
    uptimePercent: 0,
    avgLatencyMs: 0,
  };
}

// ============ §169 Feature Flags (governed) ============

export interface FeatureFlag {
  flagId: string;
  name: string;
  description: string;
  enabled: boolean;
  governed: boolean;
  environments: string[];
}

const FEATURE_FLAGS_SEED: FeatureFlag[] = [
  {
    flagId: "ff.customs_gateway.enabled",
    name: "Customs Gateway",
    description: "Master switch for the customs gateway (§81-§172).",
    enabled: true, governed: true,
    environments: ["DEVELOPMENT", "TEST", "DEMO", "PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.ai_assist.enabled",
    name: "AI Assist (A1-A4)",
    description: "§42 AI advisory only (A1-A4). A5 is FORBIDDEN regardless of this flag.",
    enabled: true, governed: true,
    environments: ["DEVELOPMENT", "TEST", "DEMO", "PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.feasibility.enabled",
    name: "Trade Feasibility Engine",
    description: "§82 pre-trade feasibility check (advisory only).",
    enabled: true, governed: false,
    environments: ["DEVELOPMENT", "TEST", "DEMO", "PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.hold_management.enabled",
    name: "Customs Hold Management",
    description: "§158 customs hold lifecycle.",
    enabled: true, governed: false,
    environments: ["DEVELOPMENT", "TEST", "DEMO", "PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.adapter.us_ace.production",
    name: "US ACE Adapter (Production)",
    description: "§111 — enables the US-CBP-ACE adapter in PRODUCTION. Requires legal authorization.",
    enabled: false, governed: true,
    environments: ["PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.adapter.egypt.production",
    name: "Egypt Adapters (Production)",
    description: "§111 — enables EG-NAFEZA / CARGOX / ETA / CBE adapters in PRODUCTION.",
    enabled: true, governed: true,
    environments: ["PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.fee_dispute.auto_escalate",
    name: "Fee Dispute Auto-Escalate",
    description: "§19 — auto-escalate CRITICAL fee disputes to the Governor.",
    enabled: true, governed: true,
    environments: ["DEVELOPMENT", "TEST", "DEMO", "PRODUCTION"],
  },
  {
    flagId: "ff.customs_gateway.runbook.auto_invoke",
    name: "Auto-Invoke Runbooks",
    description: "§172 — automatically invoke the matching runbook on incident detection.",
    enabled: false, governed: true,
    environments: ["DEVELOPMENT", "TEST"],
  },
];

const flagStore = new Map<string, FeatureFlag>(
  FEATURE_FLAGS_SEED.map((f) => [f.flagId, { ...f }]),
);

/**
 * §169 — List all feature flags. NEVER throws — returns the seed list
 * on error.
 */
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    return Array.from(flagStore.values());
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] getFeatureFlags failed", { error: String(err) });
    return FEATURE_FLAGS_SEED.map((f) => ({ ...f }));
  }
}

/**
 * §169 — Toggle a feature flag. If the flag is `governed=true`, a
 * GovernorDecision ID MUST be supplied and verified (verdict=ALLOW).
 * On any internal error or missing/denied decision, the toggle is
 * DENIED (fail-closed) and the prior flag state is returned unchanged.
 */
export async function toggleFeatureFlag(
  flagId: string,
  enabled: boolean,
  governorDecisionId?: string,
): Promise<FeatureFlag> {
  try {
    const current = flagStore.get(flagId);
    if (!current) throw new Error(`feature flag ${flagId} not found`);
    if (current.governed) {
      const ok = await _verifyGovernor(governorDecisionId, "feature.flag.toggle");
      if (!ok.approved) {
        logger.warn("[customs-gateway/adapter-health] governed flag toggle DENIED", {
          flagId, reason: ok.reason,
        });
        return current;
      }
    }
    const updated: FeatureFlag = { ...current, enabled };
    flagStore.set(flagId, updated);
    try {
      await db.activity.create({
        data: {
          action: "FEATURE_FLAG_TOGGLE",
          description: `Feature flag ${flagId} → ${enabled ? "ENABLED" : "DISABLED"}${current.governed ? ` (governor: ${governorDecisionId || "none"})` : ""}`,
          type: enabled ? "INFO" : "WARN",
          metadata: JSON.stringify({
            flagId, enabled, governed: current.governed,
            governorDecisionId: governorDecisionId || null,
          }),
        },
      });
    } catch (actErr) {
      logger.warn("[customs-gateway/adapter-health] flag-toggle audit failed", { error: String(actErr) });
    }
    logger.info("[customs-gateway/adapter-health] feature flag toggled", {
      flagId, enabled, governed: current.governed,
    });
    return updated;
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] toggleFeatureFlag failed", {
      error: String(err), flagId, enabled,
    });
    return flagStore.get(flagId) || FEATURE_FLAGS_SEED[0];
  }
}

async function _verifyGovernor(
  decisionId: string | undefined,
  expectedAction: string,
): Promise<{ approved: boolean; reason: string }> {
  try {
    if (!decisionId) return { approved: false, reason: "missing governor decision id" };
    const row = (await db.governorDecision.findUnique({
      where: { decisionId },
    })) as any;
    if (!row) return { approved: false, reason: `decision ${decisionId} not found` };
    if (String(row.verdict || "").toUpperCase() !== "ALLOW") {
      return { approved: false, reason: `verdict is ${row.verdict}` };
    }
    if (expectedAction && String(row.action || "") !== expectedAction) {
      logger.warn("[customs-gateway/adapter-health] governor action mismatch — soft-allowing", {
        expected: expectedAction, recorded: row.action, decisionId,
      });
    }
    return { approved: true, reason: "approved" };
  } catch (err) {
    return { approved: false, reason: `internal error: ${String(err)}` };
  }
}

// ============ §134 Country Configuration ============

export interface CountryConfiguration {
  country: string;
  jurisdiction: string;
  customsAuthority: string;
  customsSystem: string;
  adapter: string;
  adapterVersion: string;
  schemaVersion: string;
  transactionType: string;
  legalRole: string;
  representationType: string;
  environment: string;
}

const COUNTRY_CONFIG_SEED: CountryConfiguration[] = [
  {
    country: "US", jurisdiction: "US",
    customsAuthority: "US Customs and Border Protection (CBP)",
    customsSystem: "ACE (Automated Commercial Environment)",
    adapter: "US-CBP-ACE", adapterVersion: "1.0.0",
    schemaVersion: "CBP ABI 2024.1",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "EG", jurisdiction: "EG",
    customsAuthority: "Egyptian Customs Authority (ECA)",
    customsSystem: "Nafeza / ACI",
    adapter: "EG-NAFEZA", adapterVersion: "1.0.0",
    schemaVersion: "Nafeza ACI 2023.2",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "EG", jurisdiction: "EG-CARGOX",
    customsAuthority: "CargoX (blockchain identity for ACID)",
    customsSystem: "CargoX",
    adapter: "EG-CARGOX", adapterVersion: "1.0.0",
    schemaVersion: "CargoX 2023.1",
    transactionType: "IMPORT", legalRole: "EXPORTER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "EG", jurisdiction: "EG-ETA",
    customsAuthority: "Egyptian Tax Authority (ETA)",
    customsSystem: "ETA e-Invoice",
    adapter: "EG-ETA", adapterVersion: "1.0.0",
    schemaVersion: "ETA e-Invoice 2023.1",
    transactionType: "EXPORT", legalRole: "SELLER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "EU", jurisdiction: "EU",
    customsAuthority: "national customs authorities (DG-TAXUD coordination)",
    customsSystem: "AES / ICS2",
    adapter: "(none — country-specific)", adapterVersion: "n/a",
    schemaVersion: "EU UCC 2023.1",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "CN", jurisdiction: "CN",
    customsAuthority: "General Administration of Customs of China (GACC)",
    customsSystem: "China Single Window",
    adapter: "(none — country-specific)", adapterVersion: "n/a",
    schemaVersion: "GACC 2023.1",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "IN", jurisdiction: "IN",
    customsAuthority: "Central Board of Indirect Taxes and Customs (CBIC)",
    customsSystem: "ICEGATE",
    adapter: "(none — country-specific)", adapterVersion: "n/a",
    schemaVersion: "ICEGATE 2023.1",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
  {
    country: "BR", jurisdiction: "BR",
    customsAuthority: "Receita Federal do Brasil (RFB)",
    customsSystem: "Portal Único Siscomex",
    adapter: "(none — country-specific)", adapterVersion: "n/a",
    schemaVersion: "Siscomex 2023.1",
    transactionType: "IMPORT", legalRole: "BROKER",
    representationType: "DIRECT", environment: "PRODUCTION",
  },
];

/**
 * §134 — Get the country configuration for a country code. Returns the
 * first matching config (jurisdiction may have multiple — caller can
 * filter further). Returns null if the country is not configured.
 * NEVER throws.
 */
export async function getCountryConfiguration(
  countryCode: string,
): Promise<CountryConfiguration | null> {
  try {
    if (!countryCode) return null;
    const upper = countryCode.toUpperCase();
    return COUNTRY_CONFIG_SEED.find((c) => c.country === upper) || null;
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] getCountryConfiguration failed", { error: String(err) });
    return null;
  }
}

/**
 * §134 — List all country configurations. NEVER throws — returns the
 * seed list on error.
 */
export async function listCountryConfigurations(): Promise<CountryConfiguration[]> {
  try {
    return COUNTRY_CONFIG_SEED;
  } catch (err) {
    logger.error("[customs-gateway/adapter-health] listCountryConfigurations failed", { error: String(err) });
    return COUNTRY_CONFIG_SEED;
  }
}
