// SGTX Add-On 19 — Cargo Insurance Integration
// ===========================================================================
//
// Bridges trade shipments (USTN) with third-party marine cargo insurance
// providers. Each provider exposes a (configurable) API endpoint and a set
// of supported coverage types + currencies. The lib issues policies that
// cover a shipment's declared cargo value, persists them as InsurancePolicy
// rows, and exposes lookup helpers used by the API routes under
// /api/sgtx/cargo-insurance/*.
//
// Design notes:
//   • All DB access is wrapped in try/catch by the caller (the API routes).
//     This module exposes pure async helpers that throw on DB failure; the
//     routes translate thrown errors into 500s with a logged stack.
//   • Provider credentials (apiKeyEncrypted) are NEVER returned by the read
//     helpers — `listProviders` strips them before returning.
//   • Coverage types and accepted currencies are stored as JSON-encoded
//     strings on the InsuranceProvider row (per schema); helpers parse and
//     normalise them to arrays.
//
// Models:
//   db.insuranceProvider  — provider directory (Lloyd's, Allianz, AXA XL, …)
//   db.insurancePolicy    — issued policies, linked to a shipment by ustn

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type InsuranceCoverageType =
  | "ALL_RISKS"
  | "TOTAL_LOSS_ONLY"
  | "WAREHOUSE_TO_WAREHOUSE"
  | "INSTITUTE_CARGO_CLAUSES_A"
  | "INSTITUTE_CARGO_CLAUSES_B"
  | "INSTITUTE_CARGO_CLAUSES_C"
  | "WAR_RISK"
  | "STRIKES_RIOTS_CIVIL_COMMOTION";

export interface InsuranceProviderSummary {
  id: string;
  providerName: string;
  providerCode: string;
  apiEndpoint?: string | null;
  coverageTypes: string[];
  acceptedCurrencies: string[];
  isActive: boolean;
}

export interface CreatePolicyInput {
  ustn?: string | null;
  providerId?: string | null;
  policyNumber: string;
  coverageType: string;
  coverageAmount: number;
  premiumAmount: number;
  currency?: string;
  validFrom?: string | null;
  validTo?: string | null;
  certificateUrl?: string | null;
  status?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a JSON-encoded string field into a string array, tolerating null,
 *  malformed JSON, and non-array shapes. Always returns an array. */
function parseJsonStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function toProviderSummary(row: any): InsuranceProviderSummary {
  return {
    id: row.id,
    providerName: row.providerName,
    providerCode: row.providerCode,
    apiEndpoint: row.apiEndpoint ?? null,
    coverageTypes: parseJsonStringArray(row.coverageTypes),
    acceptedCurrencies: parseJsonStringArray(row.acceptedCurrencies),
    isActive: !!row.isActive,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Return all insurance providers, optionally filtered to active-only.
 *  Sensitive fields (apiKeyEncrypted) are stripped before returning. */
export async function listInsuranceProviders(
  opts: { activeOnly?: boolean } = {},
): Promise<InsuranceProviderSummary[]> {
  const where: any = {};
  if (opts.activeOnly) where.isActive = true;

  const rows = await (db as any).insuranceProvider.findMany({
    where,
    orderBy: { providerName: "asc" },
  });

  return (rows || []).map(toProviderSummary);
}

/** Create an insurance policy for a shipment. Throws on DB failure. */
export async function createInsurancePolicy(input: CreatePolicyInput) {
  const coverageAmount = Number(input.coverageAmount);
  const premiumAmount = Number(input.premiumAmount);

  if (!input.policyNumber?.trim()) {
    throw new Error("policyNumber is required");
  }
  if (!input.coverageType?.trim()) {
    throw new Error("coverageType is required");
  }
  if (isNaN(coverageAmount) || coverageAmount <= 0) {
    throw new Error("coverageAmount must be a positive number");
  }
  if (isNaN(premiumAmount) || premiumAmount < 0) {
    throw new Error("premiumAmount must be a non-negative number");
  }

  const data: any = {
    policyNumber: input.policyNumber.trim(),
    coverageType: input.coverageType.trim(),
    coverageAmount: +coverageAmount.toFixed(2),
    premiumAmount: +premiumAmount.toFixed(2),
    currency: input.currency || "USD",
    status: input.status || "ACTIVE",
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.providerId) data.providerId = input.providerId;
  if (input.validFrom) data.validFrom = new Date(input.validFrom);
  if (input.validTo) data.validTo = new Date(input.validTo);
  if (input.certificateUrl) data.certificateUrl = input.certificateUrl;

  const policy = await (db as any).insurancePolicy.create({ data });
  logger.info("[cargo-insurance] policy created", {
    policyId: policy.id,
    ustn: input.ustn,
    policyNumber: data.policyNumber,
    coverageAmount: data.coverageAmount,
    currency: data.currency,
  });
  return policy;
}

/** List insurance policies attached to a shipment (by USTN). */
export async function listPoliciesForShipment(ustn: string) {
  if (!ustn) return [];
  const rows = await (db as any).insurancePolicy.findMany({
    where: { ustn },
    orderBy: { createdAt: "desc" },
    include: { provider: true } as any,
  });
  return rows || [];
}
