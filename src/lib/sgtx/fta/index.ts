// SGTX Add-On 16 — FTA Preference Management
//
// Free Trade Agreement (FTA) preference management for individual shipments.
// Tenants query the FTA preference table to determine if a (origin, destination,
// hsCode) tuple qualifies for a reduced / zero duty rate under an existing
// FTA (e.g., GAFTA, Pan-Arab, AGOA, EU-Japan EPA, RCEP, USMCA).
//
// IMPORTANT — Distinction from GRiRE:
//   • `FtaPreferenceRule` (in GRiRE) is the rule engine's *discovered* rules —
//     generic rules extracted from FTA texts. Used by `grire/fta-preference`.
//   • `FtaPreference` (this add-on) is the *authoritative* preference catalog
//     curated per (hsCode, origin, destination, FTA name) — with validFrom/
//     validTo windows and document requirements. Tenants file
//     `FtaPreferenceClaim` rows against specific shipments when they actually
//     invoke the preference at customs.
//
// What this module does:
//   1. checkFtaPreference(input) — look up matching FTA preference rows for a
//      given (origin, destination, hsCode). Returns the best applicable rate
//      + the documents required to claim it.
//   2. createClaim(input) — file a claim against a shipment (USTN), recording
//      the chosen preference and tracking verification.
//   3. listClaims(ustn) — list claims for a tenant's shipment.
//
// All DB calls wrapped in try/catch. The library never throws.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface FtaPreferenceCheckInput {
  originCountry: string;          // ISO 3166-1 alpha-2
  destinationCountry: string;      // ISO 3166-1 alpha-2
  hsCode: string;                  // HS code (4–10 digits; matched by prefix)
  asOf?: Date;                     // default now() — filter by validFrom/validTo
}

export interface FtaPreferenceMatch {
  id: string;
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  ftaName: string;
  preferenceRate: number;          // 0..1 (0 = duty-free, 0.5 = 50% reduction)
  documentRequired: string;
  productSpecificRules: any;       // parsed JSON
  validFrom: Date | null;
  validTo: Date | null;
}

export interface FtaPreferenceCheckResult {
  input: FtaPreferenceCheckInput;
  matches: FtaPreferenceMatch[];
  bestMatch: FtaPreferenceMatch | null;
  applicableRate: number | null;   // the lowest preferenceRate among matches
  explanation: string;
}

export interface FtaClaimInput {
  ustn?: string | null;
  ftaPreferenceId?: string | null;
  claimType: string;                // ORIGIN | PROCESSING | DE MINIMIS | OTHER
  claimReference?: string | null;   // external customs reference
}

// ============ Core function ============

/**
 * Check FTA preferences for a (origin, destination, hsCode) tuple.
 *
 * Pure-ish: one DB read against `FtaPreference`. Returns the best match
 * (lowest preferenceRate) plus the full list of matching FTAs. The caller
 * is responsible for persisting a claim if the tenant chooses to invoke
 * the preference at customs.
 *
 * HS code matching is by prefix (left-anchored) — a 6-digit HS code in the
 * table matches a 10-digit HS code in the query. This mirrors how customs
 * authorities interpret FTA schedules.
 */
export async function checkFtaPreference(
  input: FtaPreferenceCheckInput,
): Promise<FtaPreferenceCheckResult> {
  const originCountry = input.originCountry.toUpperCase();
  const destinationCountry = input.destinationCountry.toUpperCase();
  const hsCode = input.hsCode.replace(/[^0-9]/g, "");
  const asOf = input.asOf ?? new Date();

  const empty: FtaPreferenceCheckResult = {
    input,
    matches: [],
    bestMatch: null,
    applicableRate: null,
    explanation: `No FTA preferences found for HS ${hsCode} (${originCountry}→${destinationCountry}).`,
  };

  if (!hsCode || !originCountry || !destinationCountry) {
    return { ...empty, explanation: "Invalid input — origin, destination, and hsCode are required." };
  }

  // Load candidate FTA preference rows for the (origin, destination) pair.
  // We fetch all matching rows (defensive against empty tables) and then
  // filter in memory by HS-code prefix + validity window.
  let candidates: any[] = [];
  try {
    candidates = await (db as any).ftaPreference.findMany({
      where: {
        originCountry,
        destinationCountry,
      },
      orderBy: { preferenceRate: "asc" },
    });
  } catch (e: any) {
    logger.warn("[fta] ftaPreference lookup failed", { error: e?.message || String(e) });
    return { ...empty, explanation: `FTA preference lookup failed: ${e?.message || "DB error"}` };
  }

  // Filter by HS-code prefix + validity window.
  const matches: FtaPreferenceMatch[] = [];
  for (const row of candidates) {
    const tableHs = String(row.hsCode || "").replace(/[^0-9]/g, "");
    if (!tableHs || !hsCode.startsWith(tableHs)) continue;

    const validFrom = row.validFrom ? new Date(row.validFrom) : null;
    const validTo = row.validTo ? new Date(row.validTo) : null;
    if (validFrom && asOf < validFrom) continue;
    if (validTo && asOf > validTo) continue;

    let productSpecificRules: any = null;
    if (row.productSpecificRules) {
      try { productSpecificRules = JSON.parse(row.productSpecificRules); } catch { productSpecificRules = row.productSpecificRules; }
    }

    matches.push({
      id: row.id,
      hsCode: row.hsCode,
      originCountry: row.originCountry,
      destinationCountry: row.destinationCountry,
      ftaName: row.ftaName,
      preferenceRate: Number(row.preferenceRate) || 0,
      documentRequired: row.documentRequired || "",
      productSpecificRules,
      validFrom,
      validTo,
    });
  }

  if (matches.length === 0) {
    return empty;
  }

  // Best match = lowest preferenceRate (most preferential).
  const bestMatch = matches[0]; // already ordered ascending by preferenceRate in DB query
  const applicableRate = bestMatch.preferenceRate;

  const explanation = [
    `${matches.length} FTA preference${matches.length === 1 ? "" : "s"} match HS ${hsCode} (${originCountry}→${destinationCountry}).`,
    `Best: ${bestMatch.ftaName} @ ${(applicableRate * 100).toFixed(1)}% (requires: ${bestMatch.documentRequired || "standard FTA cert"}).`,
    `Apply by filing an FTA preference claim against the shipment USTN.`,
  ].join(" ");

  return {
    input,
    matches,
    bestMatch,
    applicableRate,
    explanation,
  };
}

// ============ Persistence helpers ============

/**
 * Create an FTA preference claim against a shipment (USTN). Defensive —
 * returns null on failure.
 */
export async function createFtaClaim(
  input: FtaClaimInput,
): Promise<{ id: string; status: string } | null> {
  try {
    const row = await (db as any).ftaPreferenceClaim.create({
      data: {
        ustn: input.ustn ?? null,
        ftaPreferenceId: input.ftaPreferenceId ?? null,
        claimType: input.claimType.toUpperCase(),
        claimReference: input.claimReference ?? null,
        status: "PENDING",
        verified: false,
      },
    });
    return { id: row.id, status: row.status };
  } catch (e: any) {
    logger.error("[fta] createFtaClaim failed", { error: e?.message || String(e) });
    return null;
  }
}

/**
 * List FTA preference claims for a tenant's shipment. Defensive — returns
 * [] on failure.
 */
export async function listFtaClaims(
  ustn: string,
  take = 50,
): Promise<any[]> {
  try {
    return await (db as any).ftaPreferenceClaim.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
      take: Math.min(500, take),
      include: { ftaPreference: true },
    });
  } catch (e: any) {
    logger.warn("[fta] listFtaClaims failed", { error: e?.message || String(e) });
    return [];
  }
}

/**
 * List FTA preferences (the catalog), filtered by origin/destination/hsCode
 * (any combination). Used by the GET /preferences endpoint.
 */
export async function listFtaPreferences(input: {
  originCountry?: string;
  destinationCountry?: string;
  hsCode?: string;
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (input.originCountry) where.originCountry = input.originCountry.toUpperCase();
    if (input.destinationCountry) where.destinationCountry = input.destinationCountry.toUpperCase();
    // hsCode exact match if supplied (callers wanting prefix match should use
    // checkFtaPreference() instead).
    if (input.hsCode) where.hsCode = input.hsCode;
    return await (db as any).ftaPreference.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(500, input.take ?? 100),
    });
  } catch (e: any) {
    logger.warn("[fta] listFtaPreferences failed", { error: e?.message || String(e) });
    return [];
  }
}
